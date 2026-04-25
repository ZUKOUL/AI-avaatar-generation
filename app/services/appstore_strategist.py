"""
App Store Screenshot Strategist — first-stage AI that turns raw user context
into a 5-screen narrative brief BEFORE any image is generated.

The point: an App Store screenshot pack is not 5 pretty pictures, it's a
sales funnel rendered as static visuals. The strategist plays "senior CRO
designer" and decides:

  • What the narrative arc is across the 5 frames
  • What each frame's job is (hook → proof → 2nd benefit → social proof → closer)
  • What headline + subheadline goes on each
  • What visual treatment serves that purpose best

The generator (Gemini 3 Pro Image) then renders each frame faithfully to
this brief — instead of being asked to invent a strategy AND a visual at
the same time.

Powered by Gemini 2.5 Pro (matches the existing ad_concept_designer.py
pattern — same vendor, same API key, no new SDK to install).
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

from google import genai
from google.genai import types

from app.services.niche_loader import style_profile_summary

logger = logging.getLogger(__name__)


_STRATEGIST_SYSTEM = """You are a senior App Store conversion designer with \
10 years of experience producing screenshot packs that 2-3x install rates \
for top-100 apps.

Your job is NOT to make pretty pictures.
Your job is to CONVERT App Store visitors into installs.

# How App Store visitors actually behave
- They scroll the icon row in 0.5 seconds.
- 70% only ever see screenshots 1 and 2.
- They decide to install BEFORE reading the description.
- They are skeptical — they have been burned by overpromising apps.
- They want to immediately understand WHAT the app does and WHY they \
should care.

# The 5-screenshot narrative arc you must follow

Screenshot 1 — THE HOOK (most important — 70% of impressions)
  Purpose: stop the scroll. Communicate the #1 user benefit in <6 words.
  The headline MUST be a USER BENEFIT, not a feature name.
  BAD example:  "AI-Powered Reminders"
  GOOD example: "Never forget what matters."

Screenshot 2 — THE PROOF
  Purpose: prove that screen 1's promise is real, in the actual app.
  Headline confirms the promise, mockup shows the app delivering it.

Screenshot 3 — THE SECONDARY BENEFIT
  Purpose: add depth. A second compelling reason to install.
  Different visual angle (illustration, callouts, product close-up).

Screenshot 4 — SOCIAL PROOF OR THIRD BENEFIT
  If the user provided social proof (rating, downloads, awards): use it \
here as the centerpiece.
  Otherwise: surface a third strong feature.

Screenshot 5 — THE CLOSER
  Purpose: convert the visitor who scrolled this far but hasn't tapped \
Install yet.
  Format: emotional callback to screenshot 1's promise, plus the most \
polished frame visually (rewards the scroller).

# Hard rules
1. ONE message per screenshot. No mixed signals.
2. Headlines describe USER BENEFITS, never feature names or technical jargon.
3. The narrative must BUILD across the 5 — never repeat the same idea.
4. Tone is consistent across all 5. If the app is premium-calm, NEVER let \
one screen go playful.
5. If no visual references are provided, design treatments that suggest \
the mood without inventing fake UI inside a phone mockup.
6. Read the user's description like a copywriter: extract the strongest \
emotional benefit, NOT the most technical feature.

# Output format
Return ONLY a JSON object (no prose, no fences) with this exact shape:

{
  "tone_used": "playful | premium | professional | energetic | calm | spiritual",
  "vertical_used": "<the vertical you decided on>",
  "narrative_arc": "<one sentence summarising the 5-screen story>",
  "screens": [
    {
      "screen": 1,
      "purpose": "hook",
      "headline": "max 6 words, user benefit, NEVER a feature name",
      "subheadline": "max 10 words, optional, '' if not needed",
      "visual_direction": "2-3 sentences describing the visual: bg, type \
treatment, mockup, illustration, mood. Concrete and renderable.",
      "mockup_treatment": "tilted-phone | full-bleed-illustration | \
mascot-led | text-only | photo-bg-with-phone | collage",
      "palette_hex": ["#xxxxxx", "#xxxxxx", "#xxxxxx"],
      "rationale": "1 sentence: why this beats the alternatives for THIS \
position in the arc"
    },
    { "screen": 2, "purpose": "proof", ... },
    { "screen": 3, "purpose": "secondary_benefit", ... },
    { "screen": 4, "purpose": "social_proof_or_third_benefit", ... },
    { "screen": 5, "purpose": "closer", ... }
  ]
}
"""


_STRATEGIST_USER_TEMPLATE = """# The app you're designing for

App name: {app_name}

What does it do?
{what_it_does}

Who is it for?
{who_for}

Vertical hint from user: {vertical_hint}
Tone preference: {tone_pref}
Primary brand colour: {color_primary}
Secondary brand colour: {color_secondary}
Social proof to use (if any): {social_proof}

# Style anchor — a top-converting pack from the same vertical

{style_anchor_block}

Use this anchor as INSPIRATION for palette, typography and layout rhythm. \
Do not copy its headlines — write fresh ones for THIS app.

# Real screenshots

{real_screens_note}

# Your task

Produce the 5-screen brief now. Remember: hook → proof → secondary → \
social-proof-or-third → closer. Headlines are USER BENEFITS, never feature \
names. Output JSON only."""


def _parse_json(text: str) -> Optional[dict]:
    """Extract JSON from the model output, tolerating ``` fences and short
    preambles. Same defensive pattern as ad_concept_designer."""
    text = (text or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).rstrip("`").strip()
    if not text.startswith("{"):
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            text = m.group(0)
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning(f"strategist returned non-JSON: {e}; head={text[:200]!r}")
        return None
    return data if isinstance(data, dict) else None


def _normalise_brief(data: dict) -> Optional[dict]:
    """Cap lengths, ensure 5 screens, drop unusable briefs."""
    screens = data.get("screens")
    if not isinstance(screens, list) or len(screens) < 5:
        return None
    norm_screens = []
    for i, s in enumerate(screens[:5], 1):
        if not isinstance(s, dict):
            return None
        norm_screens.append({
            "screen": i,
            "purpose": (s.get("purpose") or "").strip()[:60] or "benefit",
            "headline": (s.get("headline") or "").strip().strip('"').strip("'")[:60],
            "subheadline": (s.get("subheadline") or "").strip().strip('"').strip("'")[:120],
            "visual_direction": (s.get("visual_direction") or "").strip()[:600],
            "mockup_treatment": (s.get("mockup_treatment") or "tilted-phone").strip()[:60],
            "palette_hex": [c for c in (s.get("palette_hex") or []) if isinstance(c, str)][:5],
            "rationale": (s.get("rationale") or "").strip()[:200],
        })
    if not all(s["headline"] for s in norm_screens):
        # Headlines are mandatory — without them the generator has nothing
        # to render. Fall through to caller's fallback.
        return None
    return {
        "tone_used": (data.get("tone_used") or "").strip()[:30] or "professional",
        "vertical_used": (data.get("vertical_used") or "").strip()[:30],
        "narrative_arc": (data.get("narrative_arc") or "").strip()[:300],
        "screens": norm_screens,
    }


async def design_appstore_brief(
    *,
    app_name: str,
    what_it_does: str,
    who_for: str,
    vertical_hint: Optional[str] = None,
    tone_pref: Optional[str] = None,
    color_primary: Optional[str] = None,
    color_secondary: Optional[str] = None,
    social_proof: Optional[list[str]] = None,
    real_screenshots: Optional[list[bytes]] = None,
    style_anchor_pack: Optional[dict] = None,
) -> Optional[dict]:
    """
    Produce the 5-screen narrative brief.

    Returns None when the API key is missing or the model output can't be
    parsed — caller should surface a 500 in that case.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY missing — cannot run strategist.")
        return None

    style_anchor_block = (
        style_profile_summary(style_anchor_pack)
        if style_anchor_pack
        else "(no anchor available — design from scratch using App Store \
best practices)"
    )

    real_screens_note = (
        f"User uploaded {len(real_screenshots)} real screenshots of their \
app. Treat them as ground truth for the actual UI — when you design a \
mockup, refer to what's visible in these screens, do not invent fake UI."
        if real_screenshots
        else "User did NOT upload real screenshots. Design mockups that \
suggest the app's mood without inventing specific UI elements (use \
abstract device frames, illustrations, mascots, or text-led layouts \
instead of fake interface details)."
    )

    user_block = _STRATEGIST_USER_TEMPLATE.format(
        app_name=app_name,
        what_it_does=what_it_does,
        who_for=who_for,
        vertical_hint=vertical_hint or "(not specified — infer from description)",
        tone_pref=tone_pref or "(not specified — infer from description)",
        color_primary=color_primary or "(not specified)",
        color_secondary=color_secondary or "(not specified)",
        social_proof=", ".join(social_proof) if social_proof else "(none)",
        style_anchor_block=style_anchor_block,
        real_screens_note=real_screens_note,
    )

    contents: list = []
    # Real screenshots first so the model sees them as primary context.
    if real_screenshots:
        for img in real_screenshots[:5]:  # cap at 5 to keep tokens sane
            contents.append(types.Part.from_bytes(data=img, mime_type="image/jpeg"))
    contents.append(_STRATEGIST_SYSTEM + "\n\n" + user_block)

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=0.6,  # strategic but with some variety across re-rolls
                response_mime_type="application/json",
            ),
        )
    except Exception as e:
        logger.error(f"strategist call failed: {e}")
        return None

    raw = getattr(response, "text", "") or ""
    data = _parse_json(raw)
    if not data:
        logger.warning(f"strategist JSON parse failed; head={raw[:200]!r}")
        return None
    return _normalise_brief(data)
