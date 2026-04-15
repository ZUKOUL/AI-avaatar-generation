"""
Product image scraper.

Given a product URL (AliExpress, Amazon, Shopify, etc.), fetch the page
and extract the photo gallery so a user can train a product from just a
link — no manual photo upload needed.

Strategy (in order of priority):
  1. JSON-LD Schema.org Product `image` array (cleanest, most reliable)
  2. OpenGraph / Twitter card meta tags (og:image, og:image:secure_url)
  3. `<link rel="image_src">`
  4. `<img>` tags inside common gallery containers
  5. All remaining `<img>` tags with big enough dimensions

Then download each candidate, filter the bytes (must be a real image,
minimum dimensions, skip near-duplicates), and return the raw bytes so
the training pipeline can treat them like user-uploaded files.

Never raises — callers can fall back to "no photos extracted" and ask
the user to upload manually.
"""
from __future__ import annotations

import io
import json
import logging
import re
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from PIL import Image

from app.services.product_analyzer import _BROWSER_HEADERS, _is_safe_url

logger = logging.getLogger(__name__)

# How many distinct candidate URLs we bother downloading. Most product
# pages have 4-8 gallery shots; cap keeps us fast and polite.
_MAX_CANDIDATES = 18

# How many images we ultimately return to the caller. Matches the upper
# bound of the training endpoint's MAX_PRODUCT_IMAGES (20).
_MAX_KEEP = 12

# Minimum image dimensions to count as a real product photo (filters out
# tiny thumbnails, tracking pixels, "1x1" spacers). Product gallery shots
# are usually >= 500×500.
_MIN_DIMENSION = 350

# Maximum download size per image — defensive, prevents a 50 MB hero TIFF
# from blowing up memory. Product photos are typically < 2 MB.
_MAX_IMAGE_BYTES = 8 * 1024 * 1024

# Per-image network timeout. Longer than HTML fetch because product CDNs
# can be slow on first hit.
_IMAGE_TIMEOUT = httpx.Timeout(15.0, connect=5.0)

# Substrings in the URL path that almost always indicate NOT a product
# photo (logos, icons, sprites, banners, avatars, tracking pixels).
_SKIP_PATH_HINTS = (
    "logo", "icon", "favicon", "sprite", "banner", "avatar",
    "pixel", "tracking", "analytics", "spacer", "blank.gif",
    "placeholder", "qrcode", "qr-code",
)


def _looks_like_product_image(url: str) -> bool:
    """Quick heuristic on the URL string before we spend a download.
    Rejects obvious non-product assets (logos, tracking pixels, icons)."""
    if not url:
        return False
    low = url.lower()
    if low.startswith("data:"):
        return False  # inline base64 — usually tiny placeholders
    if any(h in low for h in _SKIP_PATH_HINTS):
        return False
    # Common image extensions — we allow params after, many CDNs append ?v=
    path = urlparse(low).path
    if not path:
        return False
    if path.endswith(".svg"):
        return False  # almost always an icon or logo, not a photo
    # Accept anything that "looks" like an image file or has no extension
    # (lots of CDNs serve via /image/abc123 with no suffix).
    return True


def _absolutize(base_url: str, maybe_relative: str) -> Optional[str]:
    """Turn a relative or protocol-less URL into an absolute https URL."""
    if not maybe_relative:
        return None
    try:
        absolute = urljoin(base_url, maybe_relative)
        # Upgrade protocol-relative URLs like //cdn.foo.com/x.jpg
        if absolute.startswith("//"):
            absolute = "https:" + absolute
        if not absolute.startswith(("http://", "https://")):
            return None
        return absolute
    except Exception:
        return None


def _extract_jsonld_images(soup: BeautifulSoup, base_url: str) -> list[str]:
    """Pull product images from JSON-LD Schema.org Product blocks.
    Handles both string and array values for the `image` field."""
    urls: list[str] = []
    for tag in soup.find_all("script", type="application/ld+json"):
        raw = (tag.string or "").strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue

        # JSON-LD can be a single object, a list, or a @graph container.
        candidates: list[dict] = []
        if isinstance(data, list):
            candidates.extend(x for x in data if isinstance(x, dict))
        elif isinstance(data, dict):
            if "@graph" in data and isinstance(data["@graph"], list):
                candidates.extend(x for x in data["@graph"] if isinstance(x, dict))
            else:
                candidates.append(data)

        for node in candidates:
            typ = node.get("@type")
            if isinstance(typ, list):
                typ = typ[0] if typ else ""
            if typ and str(typ).lower() != "product":
                continue

            img = node.get("image")
            if isinstance(img, str):
                absolute = _absolutize(base_url, img)
                if absolute:
                    urls.append(absolute)
            elif isinstance(img, list):
                for entry in img:
                    if isinstance(entry, str):
                        absolute = _absolutize(base_url, entry)
                        if absolute:
                            urls.append(absolute)
                    elif isinstance(entry, dict) and entry.get("url"):
                        absolute = _absolutize(base_url, entry["url"])
                        if absolute:
                            urls.append(absolute)
            elif isinstance(img, dict) and img.get("url"):
                absolute = _absolutize(base_url, img["url"])
                if absolute:
                    urls.append(absolute)
    return urls


def _extract_meta_images(soup: BeautifulSoup, base_url: str) -> list[str]:
    """OpenGraph + Twitter card + link rel=image_src. These usually point
    at the primary product hero shot."""
    urls: list[str] = []
    meta_props = (
        "og:image", "og:image:secure_url", "og:image:url",
        "twitter:image", "twitter:image:src",
    )
    for prop in meta_props:
        for tag in soup.find_all("meta", attrs={"property": prop}):
            content = tag.get("content")
            if content:
                absolute = _absolutize(base_url, content)
                if absolute:
                    urls.append(absolute)
        for tag in soup.find_all("meta", attrs={"name": prop}):
            content = tag.get("content")
            if content:
                absolute = _absolutize(base_url, content)
                if absolute:
                    urls.append(absolute)

    for tag in soup.find_all("link", attrs={"rel": "image_src"}):
        href = tag.get("href")
        if href:
            absolute = _absolutize(base_url, href)
            if absolute:
                urls.append(absolute)
    return urls


def _extract_img_tags(soup: BeautifulSoup, base_url: str) -> list[str]:
    """Fallback: every `<img>` tag on the page. We'll filter the list
    afterwards by downloading a handful and checking actual dimensions."""
    urls: list[str] = []
    for img in soup.find_all("img"):
        # Prefer data-src (lazy-load) then srcset (first entry) then src
        candidate = (
            img.get("data-src")
            or img.get("data-lazy-src")
            or img.get("data-original")
            or img.get("srcset", "").split(",")[0].strip().split(" ")[0]
            or img.get("src")
        )
        if candidate:
            absolute = _absolutize(base_url, candidate)
            if absolute:
                urls.append(absolute)
    return urls


def _dedupe_preserving_order(items: list[str]) -> list[str]:
    """Drop duplicates while keeping first-seen order — earlier entries
    come from higher-priority extractors (JSON-LD > OG > <img>)."""
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        key = it.split("?")[0].lower()  # dedupe on path, ignore query params
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


async def _fetch_html(url: str) -> str:
    """Small copy of product_analyzer._fetch_html — we import private
    helpers too but keeping this one local lets us tune timeouts."""
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=5.0),
            follow_redirects=True,
            headers=_BROWSER_HEADERS,
        ) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.text
    except Exception as e:
        logger.warning(f"Image scraper HTML fetch failed for {url}: {e}")
        return ""


async def _download_image(client: httpx.AsyncClient, url: str) -> Optional[bytes]:
    """Download a single candidate URL and return the bytes if it passes
    sanity checks (real image, >= _MIN_DIMENSION, under size cap)."""
    try:
        r = await client.get(url)
        r.raise_for_status()
    except Exception as e:
        logger.debug(f"Skip image {url}: {e}")
        return None

    data = r.content
    if not data or len(data) > _MAX_IMAGE_BYTES or len(data) < 2048:
        return None

    # Verify it's actually an image + has reasonable dimensions. PIL's
    # verify() catches corrupt/non-image bytes cheaply.
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
        # verify() closes the file — reopen for dimension check
        img = Image.open(io.BytesIO(data))
        w, h = img.size
    except Exception:
        return None

    if w < _MIN_DIMENSION or h < _MIN_DIMENSION:
        return None
    if w * h < _MIN_DIMENSION * _MIN_DIMENSION:
        return None

    # Convert to PNG so downstream code doesn't have to sniff mime types.
    # This also strips EXIF/colour-profile weirdness that Gemini sometimes
    # chokes on.
    try:
        out = io.BytesIO()
        img = Image.open(io.BytesIO(data))
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        img.save(out, format="PNG", optimize=False)
        return out.getvalue()
    except Exception as e:
        logger.debug(f"Re-encode failed for {url}: {e}")
        return None


async def scrape_product_images(url: str, max_images: int = _MAX_KEEP) -> list[bytes]:
    """
    Main entry point — returns a list of PNG-encoded image bytes scraped
    from the given product URL, ready to feed into the training pipeline
    exactly like a user upload.

    Always returns a list (possibly empty). Never raises.
    """
    if not url or not _is_safe_url(url):
        logger.info(f"Skipping image scrape for unsafe URL: {url}")
        return []

    html = await _fetch_html(url)
    if not html:
        return []

    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception as e:
        logger.warning(f"HTML parse failed for image scrape: {e}")
        return []

    # Priority-ordered candidate list
    candidates: list[str] = []
    candidates.extend(_extract_jsonld_images(soup, url))
    candidates.extend(_extract_meta_images(soup, url))
    candidates.extend(_extract_img_tags(soup, url))
    candidates = [u for u in candidates if _looks_like_product_image(u)]
    candidates = _dedupe_preserving_order(candidates)
    candidates = candidates[:_MAX_CANDIDATES]

    if not candidates:
        logger.info(f"No image candidates extracted from {url}")
        return []

    logger.info(f"Trying to download {len(candidates)} candidate images from {url}")

    kept: list[bytes] = []
    seen_hashes: set[int] = set()
    try:
        async with httpx.AsyncClient(
            timeout=_IMAGE_TIMEOUT,
            follow_redirects=True,
            headers=_BROWSER_HEADERS,
        ) as client:
            for candidate in candidates:
                if len(kept) >= max_images:
                    break
                data = await _download_image(client, candidate)
                if not data:
                    continue
                # Cheap near-dedupe: hash first 1 KB of content. Product
                # pages often expose the same hero shot under multiple
                # URLs (thumb + full-res).
                head_hash = hash(data[:1024])
                if head_hash in seen_hashes:
                    continue
                seen_hashes.add(head_hash)
                kept.append(data)
    except Exception as e:
        logger.warning(f"Image download loop errored (keeping partial): {e}")

    logger.info(f"Scraped {len(kept)} usable images from {url}")
    return kept
