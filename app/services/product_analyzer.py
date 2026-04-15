"""
Product-page analyzer.

Fetches a product URL (AliExpress, Amazon, Shopify, TikTok Shop, etc.),
strips it down to readable text, and asks Gemini 2.5 Flash to extract
structured product information used to enrich ad generation prompts.

Returns a dict shaped like:
    {
      "title":       "Portable handheld smoothie blender",
      "description": "USB-rechargeable personal blender for shakes on the go…",
      "features":    ["380 ml capacity", "USB-C charging", "Food-grade BPA-free"],
      "category":    "Kitchen gadget",
      "price":       "$24.99" | None,
    }

All network calls are best-effort — if the page blocks us (bot detection)
or Gemini returns garbage, we degrade gracefully to returning whatever we
were able to extract.
"""
import os
import re
import json
import logging
import ipaddress
import socket
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# Max characters of page text we forward to Gemini — product pages can be
# huge with reviews/related products, and we want to stay well under the
# model's token budget while keeping the useful header/spec block.
_MAX_PAGE_TEXT = 18_000

# Browser-ish headers so AliExpress/Amazon don't instantly return an
# interstitial. Not a bypass — just enough to look like a real client.
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.7",
    "Cache-Control": "no-cache",
}


# ─── SSRF guard ──────────────────────────────────────────────────────────────
def _is_safe_url(url: str) -> bool:
    """Reject non-http(s) schemes and URLs that resolve to private networks."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False
    if not parsed.hostname:
        return False

    # Block obvious internal hostnames before DNS lookup
    lowered = parsed.hostname.lower()
    if lowered in {"localhost", "0.0.0.0"} or lowered.endswith(".internal") or lowered.endswith(".local"):
        return False

    # Resolve and verify the IP is public
    try:
        ip = socket.gethostbyname(parsed.hostname)
        ip_obj = ipaddress.ip_address(ip)
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
            return False
    except Exception:
        # DNS failure — let httpx deal with it; treating it as safe avoids
        # blocking legitimate domains that happen to resolve oddly.
        pass
    return True


# ─── Fetch + HTML to text ────────────────────────────────────────────────────
async def _fetch_html(url: str) -> str:
    """Fetch a URL and return its HTML as text (empty string on failure)."""
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(12.0, connect=5.0),
            follow_redirects=True,
            headers=_BROWSER_HEADERS,
        ) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.text
    except httpx.HTTPStatusError as e:
        logger.warning(f"Product page returned {e.response.status_code}: {url}")
        return ""
    except httpx.RequestError as e:
        logger.warning(f"Network error fetching {url}: {e}")
        return ""
    except Exception as e:
        logger.warning(f"Unexpected error fetching {url}: {e}")
        return ""


def _html_to_text(html: str) -> str:
    """Strip scripts/styles, keep the main text + structured product data."""
    if not html:
        return ""
    try:
        soup = BeautifulSoup(html, "html.parser")

        # Pull JSON-LD blocks first — many shops embed product metadata here.
        jsonld_chunks: list[str] = []
        for s in soup.find_all("script", type="application/ld+json"):
            raw = (s.string or "").strip()
            if "product" in raw.lower() and len(raw) < 4000:
                jsonld_chunks.append(raw)

        # Pull title, meta description, og:* tags
        meta_parts: list[str] = []
        if soup.title and soup.title.string:
            meta_parts.append(f"TITLE: {soup.title.string.strip()}")
        for prop in ("description", "og:title", "og:description", "product:price:amount", "twitter:description"):
            tag = soup.find("meta", attrs={"name": prop}) or soup.find("meta", attrs={"property": prop})
            content = (tag.get("content") if tag else None) or ""
            if content:
                meta_parts.append(f"{prop.upper()}: {content.strip()}")

        # Drop noise tags
        for el in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "iframe"]):
            el.decompose()

        body_text = soup.get_text(separator=" ", strip=True)
        body_text = re.sub(r"\s+", " ", body_text)

        combined = "\n".join(meta_parts)
        if jsonld_chunks:
            combined += "\n\nJSON-LD:\n" + "\n".join(jsonld_chunks)
        combined += "\n\nBODY:\n" + body_text
        return combined[:_MAX_PAGE_TEXT]
    except Exception as e:
        logger.warning(f"HTML parsing failed: {e}")
        return html[:_MAX_PAGE_TEXT]


# ─── Gemini extraction ───────────────────────────────────────────────────────
_EXTRACT_PROMPT = """You are extracting structured product info from an e-commerce page.

Return ONLY a JSON object with these exact keys:
- title: short product name (max 80 characters, no brand prefixes like "Free shipping")
- description: 2-3 sentence description of what the product does and who it's for (max 400 characters)
- features: array of 3-7 key features as short bullet points (each max 80 characters, factual not marketing)
- category: one short product category (e.g. "Kitchen gadget", "Fashion accessory", "Beauty tool")
- price: visible price as a string like "$19.99" or "€29.90", or null if not visible

Rules:
- Strip emoji, hype, and marketing fluff from titles ("🔥 HOT SALE 50% OFF" → just the real product name)
- Use the primary/English title if multiple languages are shown
- Features must be real product attributes, never "fast shipping" or "great reviews"
- Output MUST be valid JSON, no markdown fences, no prose before or after

URL: {url}

Page content:
{content}
"""


async def _extract_via_gemini(url: str, page_text: str) -> Optional[dict]:
    """Ask Gemini 2.5 Flash to structure the product info. Returns None on failure."""
    if not page_text.strip():
        return None
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY missing — skipping product extraction.")
        return None

    try:
        client = genai.Client(api_key=api_key)
        prompt = _EXTRACT_PROMPT.format(url=url, content=page_text)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        text = (getattr(response, "text", "") or "").strip()
        if not text:
            return None

        # Defensive parse — Gemini sometimes wraps JSON in ```json ... ```
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?", "", text).rstrip("`").strip()

        data = json.loads(text)
        if not isinstance(data, dict):
            return None

        # Normalise fields
        title = (data.get("title") or "").strip()[:80]
        description = (data.get("description") or "").strip()[:400]
        category = (data.get("category") or "").strip()[:60]
        price = data.get("price")
        if price is not None:
            price = str(price).strip()[:40] or None

        raw_features = data.get("features") or []
        features: list[str] = []
        if isinstance(raw_features, list):
            for f in raw_features:
                if not isinstance(f, str):
                    continue
                cleaned = f.strip()[:80]
                if cleaned:
                    features.append(cleaned)
        features = features[:7]

        if not (title or description or features):
            return None

        return {
            "title": title,
            "description": description,
            "features": features,
            "category": category,
            "price": price,
        }

    except json.JSONDecodeError as e:
        logger.warning(f"Gemini returned non-JSON for product extraction: {e}")
        return None
    except Exception as e:
        logger.warning(f"Gemini extraction failed: {e}")
        return None


# ─── Public entry point ──────────────────────────────────────────────────────
async def analyze_product_url(url: str) -> Optional[dict]:
    """
    Analyze a product URL and return structured info, or None if we couldn't
    extract anything useful. Never raises — callers can store the URL even
    when analysis fails.
    """
    if not url or len(url) > 2048:
        return None
    if not _is_safe_url(url):
        logger.info(f"Rejecting unsafe URL: {url}")
        return None

    html = await _fetch_html(url)
    if not html:
        return None

    text = _html_to_text(html)
    if not text:
        return None

    return await _extract_via_gemini(url, text)


def format_product_context(name: str, analysis: Optional[dict]) -> str:
    """
    Turn the extracted analysis into a single sentence block that we can
    prepend to the ad generation prompt so Gemini picks a relevant scene.
    """
    if not analysis:
        return ""

    parts: list[str] = []
    desc = analysis.get("description") or ""
    if desc:
        parts.append(desc)

    features = analysis.get("features") or []
    if features:
        parts.append("Key features: " + "; ".join(features) + ".")

    category = analysis.get("category") or ""
    if category:
        parts.append(f"Category: {category}.")

    if not parts:
        return ""
    return f'Product context — "{name}": ' + " ".join(parts)
