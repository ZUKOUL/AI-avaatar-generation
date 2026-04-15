"""
Research-driven ad concept designer.

Uses Gemini 2.5 Pro with Google Search grounding to study what actually
performs as static Facebook / Instagram / Meta Ads Library creatives in
the product's niche, then synthesises ONE original, scroll-stopping ad
concept tailored to the uploaded product.

The output is a structured dict that feeds directly into the image
generation prompt — so Gemini 3 Pro Image renders a true ad creative
rather than a catalogue product shot.

Never raises: callers can fall back to a static template on failure.
"""
import os
import re
import json
import random
import logging
from typing import Optional

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


# Seed lines injected into the research prompt so concepts vary across
# successive generations rather than always landing on the same "UGC
# morning ritual" idea. We pick one at random per request.
_CONCEPT_ANGLES = [
    "UGC-style, candid, shot like a real customer",
    "problem/solution before-after narrative",
    "lifestyle hero — product in aspirational everyday use",
    "social-proof callout with visible testimonial cue",
    "bold benefit-led composition with bright accent colour",
    "minimalist luxury hero with dramatic lighting",
    "in-use action shot capturing the key moment of value",
    "unboxing / first-impression moment",
]


_CONCEPT_PROMPT = """You are a top-tier performance marketer who has scaled \
thousands of Facebook and Instagram ads for e-commerce and dropshipping brands.

RESEARCH TASK
1. Use Google Search to study examples of high-performing STATIC Facebook, \
   Instagram, and Meta Ads Library creatives in the "{category}" niche \
   (and adjacent niches if useful).
2. Focus on successful DTC brands, TikTok-viral products, and Meta Ad Library \
   repeat-spend winners. Note the recurring visual patterns that stop the scroll.
3. Ignore video ads — only single-image creatives.

PRODUCT TO ADVERTISE
- Name: {name}
- Category: {category}
- Description: {description}
- Key features: {features}

CREATIVE ANGLE TO LEAN INTO (seed): {angle}

YOUR OUTPUT
Design ONE winning static ad concept for THIS product, inspired by what you \
researched but NOT a copy. Return ONLY a JSON object with these exact keys:

- "concept_name": 3-6 word descriptor (e.g. "UGC morning ritual", "Before/after split")
- "visual_direction": 2-4 sentences describing exactly what the image shows — \
  setting, who is in frame (if anyone), what they are doing, where the product \
  sits, and the overall feel. Be specific and visual, like a photographer brief.
- "composition": camera angle, framing, how negative space is used for text overlay
- "mood_lighting": lighting style and mood in one short phrase
- "hook_overlay_text": SHORT ad headline that goes on the image, max 7 words, \
  no emoji, title-case — or null if the concept reads best without text
- "why_it_converts": one sentence on the psychological trigger

RULES
- The concept MUST look like a native Facebook/Instagram ad, not a sterile catalogue photo
- Prefer people-in-frame, lifestyle, UGC, or problem/solution over isolated studio
- Composition must leave room for headline text where relevant
- Output MUST be valid JSON, no markdown fences, no prose around it
"""


async def design_ad_concept(
    name: str,
    category: Optional[str],
    description: Optional[str],
    features: Optional[list],
) -> Optional[dict]:
    """
    Ask Gemini 2.5 Pro (with Google Search grounding) to design a winning
    Facebook ad concept for the product. Returns None on failure.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY missing — skipping ad concept design.")
        return None

    try:
        client = genai.Client(api_key=api_key)
        angle = random.choice(_CONCEPT_ANGLES)
        prompt = _CONCEPT_PROMPT.format(
            name=name or "unnamed product",
            category=category or "general consumer goods",
            description=description or "(no description provided)",
            features=", ".join(features or []) or "(no features provided)",
            angle=angle,
        )

        # Google Search grounding gives the model access to real top-performing
        # ads instead of relying on stale training data. response_mime_type
        # cannot be combined with tools, so we parse JSON defensively.
        response = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.85,  # creative variance across re-rolls
            ),
        )
        text = (getattr(response, "text", "") or "").strip()
        if not text:
            return None

        # Strip accidental ``` fences if the model wraps its JSON.
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?", "", text).rstrip("`").strip()

        # Gemini sometimes prefixes the JSON with a brief intro sentence. Grab
        # the first {...} block as a fallback.
        if not text.startswith("{"):
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                text = match.group(0)

        data = json.loads(text)
        if not isinstance(data, dict):
            return None

        # Normalise and cap field lengths so we never blow up the image prompt.
        result = {
            "concept_name": (data.get("concept_name") or "").strip()[:80],
            "visual_direction": (data.get("visual_direction") or "").strip()[:800],
            "composition": (data.get("composition") or "").strip()[:300],
            "mood_lighting": (data.get("mood_lighting") or "").strip()[:200],
            "why_it_converts": (data.get("why_it_converts") or "").strip()[:300],
        }
        hook = data.get("hook_overlay_text")
        if isinstance(hook, str):
            hook = hook.strip().strip('"').strip("'")[:60]
            result["hook_overlay_text"] = hook or None
        else:
            result["hook_overlay_text"] = None

        if not result["visual_direction"]:
            return None  # useless without the main brief
        return result

    except json.JSONDecodeError as e:
        logger.warning(f"Ad concept JSON parse failed: {e}")
        return None
    except Exception as e:
        logger.warning(f"Ad concept generation failed: {e}")
        return None


def concept_to_prompt(concept: Optional[dict]) -> str:
    """
    Turn the structured concept dict into a prompt block that slots directly
    into the Gemini 3 Pro Image generation call.
    """
    if not concept:
        return ""
    parts: list[str] = []

    vd = concept.get("visual_direction")
    if vd:
        parts.append(vd)

    comp = concept.get("composition")
    if comp:
        parts.append(f"Composition: {comp}.")

    mood = concept.get("mood_lighting")
    if mood:
        parts.append(f"Lighting & mood: {mood}.")

    hook = concept.get("hook_overlay_text")
    if hook:
        parts.append(
            f'Render bold, professionally typeset sans-serif ad headline text '
            f'that reads exactly "{hook}" placed in the negative-space area, '
            f'high contrast against the background, like a real Meta ad overlay.'
        )

    # Always nail the final directive — we want an ad, not a photo.
    parts.append(
        "The final image MUST look like a native, scroll-stopping static "
        "Facebook/Instagram ad creative — not a sterile product catalogue shot. "
        "Commercial DSLR quality, 8K, ad-ready."
    )
    return " ".join(parts)
