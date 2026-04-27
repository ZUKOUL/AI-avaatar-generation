"""
Bento Card Strategist — first-stage AI that turns a raw product description
into a polished bento brief BEFORE the image is generated.

Why a strategist hop:
A bento card is a *single* cell of a SaaS landing-page grid. Its job is not
to "look pretty" — it's to convert a scrolling visitor into someone who
keeps reading. The difference between a generic AI bento and a bento that
makes a Linear / Vercel / Notion page work is roughly:

  • Headline that stops the scroll                 (the strategist owns this)
  • Sub-copy that reinforces, never repeats        (this too)
  • Layout chosen to fit the message               (this too)
  • Mood / palette consistent with the brand       (this too)

Letting the image model invent both the strategy AND the visual at the same
time produces "AI-looking" cards. Splitting the two — first a copywriter
brief, then a faithful render — is what makes the output feel hand-crafted.

Powered by Gemini 2.5 Pro, same vendor as the appstore_strategist sibling.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


_STRATEGIST_SYSTEM = """You are a senior growth designer who has shipped \
landing pages for Linear, Vercel, Notion, Loom, Stripe and Cursor. \
You design bento cards for product pages that consistently 2x time-on-page \
and lift signup conversion.

You are NOT here to make pretty pictures.
You are here to TURN A PRODUCT DESCRIPTION INTO A SINGLE BENTO CARD \
THAT MAKES A VISITOR THINK "I need this".

# What a great bento card does in 2 seconds
- Reader's eye lands on the OVERLINE (small overline, brand name or \
feature name) — context.
- Eye drops to the HEADLINE (big, dominant) — the BENEFIT.
- Eye scans the SUPPORTING line — proof or specificity.
- Eye lingers on the VISUAL ELEMENT — pleasure / surprise / understanding.
- Reader keeps scrolling, primed for the next bento.

# Bento conventions you must respect
- ONE message per card. Multi-feature cards confuse and convert worse.
- Headline is a USER BENEFIT, never a feature name.
    BAD:  "Real-time collaboration"
    GOOD: "Ship together. Without the merge fights."
- Sub-headline NEVER repeats the headline. It either:
    a) makes it specific ("Edits sync in 60ms across 200 cursors"), or
    b) names the proof ("12,000 teams ship daily on Horpen"), or
    c) reframes the benefit a second way for the skeptical reader.
- Visual element supports the headline LITERALLY when possible:
    • "0.3s search" → giant clock or "0.3s" rendered as the hero
    • "Edit anywhere" → 3 stacked device mockups
    • "Loved by 12k teams" → a wall of avatars or a logo stack
- The bento has rounded corners (~24-32px) and lives on a light or dark \
neutral. NEVER on a saturated brand-colour wash — that screams "ad".

# Picking the dominant visual treatment
You must pick ONE of these layouts. Each has a different conversion job.

icon-led
    A single oversized icon / glyph dominates the upper half. Best for \
abstract benefits ("Privacy-first", "Faster", "Built for speed"). \
Apple's iCloud feature page is the reference.

text-led
    The HEADLINE itself is the hero. Visuals are minimal (a thin underline, \
a tiny accent dot, or nothing). Best for category-defining claims or \
brand-voice moments. Linear's homepage is the reference.

split
    Card splits ~60/40. Text on one side, a single visual on the other. \
Best for "before / after" or "feature → result" framings. Stripe Press is \
the reference.

ui-mockup
    A real-looking product UI screenshot dominates the card. Best when the \
proof is "look how clean this is". The mockup MUST look like a real product \
— never lorem ipsum, never abstract rectangles.

illustration
    A custom 3D / painterly illustration carries the card. Best for \
emotional benefits ("Calm", "Joy", "Confidence") or for B2C tools where \
the audience reads vibe before features. Loom & Linear hero illustrations \
are the reference.

stat-led
    A single oversized number or chart dominates. Best when the benefit IS \
the number ("0.3s", "200%", "$2M saved"). The Vercel homepage uses this for \
performance claims.

# Mood lexicon
Pick ONE mood that fits the product and stay with it across the whole \
bento. Mixing moods is the #1 mistake of generic AI bentos.

minimal-light
    Off-white or pure white background. Lots of whitespace. Type does the \
heavy lifting. Apple, Linear, Vercel reference.

dark-tech
    Deep near-black background (#0A0A0C — never pure #000). Cool greys, \
one cold accent (electric blue, magenta, lime). Stripe Press, Modal, Sentry \
reference.

editorial-soft
    Off-white with one warm pastel accent (peach, sage, butter yellow). \
Long-form-magazine vibe. Notion, Substack hero reference.

vibrant-saturated
    Bold solid colour or gradient as background. Single dominant accent. \
Loom, Linear hero, Webflow reference.

mono-statement
    Black text on white, or white text on black. No colour at all (or one \
tiny accent dot). Best for category-defining claims.

# Hard rules
1. ONE message per card. Resist the urge to cram 3 benefits into one.
2. Headline is a user benefit. Sub-line is proof or specificity, never \
filler.
3. The render_prompt you produce must be CONCRETE — palette hex codes, \
typography hint (Inter / Söhne / General Sans / Druk Wide / Anton level), \
exact element positions, exact spacing, exact corner radius. The render \
model has to be able to execute it without inventing strategy.
4. If a locked style anchor is provided (a previous bento the user picked \
as reference), you MUST inherit its palette, layout family, mood and \
visual treatment. The new card must look like a SISTER cell in the same \
landing-page bento grid — not a different design system.
5. If curated style references are provided (from the gallery or \
auto-selected from the library), use them as inspiration for palette, \
typography, ICON STYLE and visual richness. Adapt to the user's actual \
product but match the level of design density — never produce a flatter \
version of what the references show.

# CRITICAL — VISUAL RICHNESS MANDATE
The single biggest mistake an AI bento generator makes is producing a \
"safe" minimalist card with one flat icon and no other elements. THAT IS \
NOT ACCEPTABLE OUTPUT for this product.

Every render_prompt you write MUST specify multiple concrete design \
elements layered into the card. Pick AT LEAST 4 of these for any given \
card and weave them into render_prompt as labelled directives:

  - A specific decorative background treatment: subtle grain texture, \
soft directional gradient, faint dot grid, translucent gradient mesh, \
geometric subdivisions, blueprint-style line work.
  - A glow / soft drop shadow under the hero element so it floats.
  - A signature hero element rendered in DETAIL — not a flat outline icon \
but a designed object: 3D rendered, isometric, layered glass, gradient \
sphere with reflection, photo-realistic mockup, painterly illustration, \
collaged photo cutouts.
  - Secondary visual elements that frame the hero: small UI fragments \
(fake toolbar, cursor pointer, badge, tooltip, code line), micro icons, \
metric chips with numbers, decorative stickers, dotted call-out lines.
  - A typographic accent paired with the headline: monospace label \
above, italic emphasis on a single word, oversized initial letter, \
strikethrough on a "before" word.
  - Texture / depth: paper grain, glass reflection, screen scanlines, \
specular highlight on a 3D surface.
  - Environmental context: a subtle desk surface, sky gradient, room \
shadow, that grounds the composition.

A great bento card has THREE OR MORE VISUAL LAYERS visible at a glance. \
A flat coloured background + a single icon + a headline = REJECT and \
re-do. Output must look like a senior designer's 30-min work, not a \
30-second AI default.

# Output JSON shape (no extra commentary, no ``` fences)
{
  "headline": "max 8 words. Sentence case unless the brand is loud.",
  "subheadline": "max 14 words OR empty string '' when the headline is \
strong enough alone.",
  "overline": "Brand or feature name shown above the headline. Caps, \
0.18em tracking, 11-12px equivalent in the final render.",
  "layout": "icon-led | text-led | split | ui-mockup | illustration | \
stat-led",
  "mood": "minimal-light | dark-tech | editorial-soft | vibrant-saturated \
| mono-statement",
  "bg_tone": "light | dark",
  "accent_hex": "#xxxxxx — single accent that pops on this mood",
  "palette_hex": ["#bg", "#text", "#accent", "#muted"],
  "visual_direction": "2-3 sentences in plain English summarising the \
visual idea. The frontend may show this as a preview hint.",
  "render_prompt": "180-280 words ART DIRECTOR brief, labelled sections \
in this order: OVERALL CANVAS, OVERLINE, HEADLINE, SUPPORTING, MAIN \
VISUAL ELEMENT, COMPOSITION & SPACING, TYPOGRAPHY, OUTPUT. Every section \
must be specific (palette hex, layout grid, font family direction, exact \
positions). This goes straight to Gemini 3 Pro Image — no second editorial \
pass.",
  "rationale": "1 sentence: why this layout/mood combo fits this product \
better than the alternatives."
}
"""


_STRATEGIST_USER_TEMPLATE = """# The product you're designing for

What it is / what it does:
{product_description}

Product name (optional, '' when not specified): {product_name}
Audience hint: {audience}
Tone preference: {tone_pref}
Brand primary colour hint: {color_primary}

# Style anchor — curated template from the gallery
{template_block}

# Locked style anchor — a previous bento the user accepted
{locked_block}

# Your task
Produce the JSON brief for ONE bento card now. Choose the layout and mood \
that maximally serve THIS product's #1 benefit. Headline is a benefit, \
never a feature name. Sub-line never repeats the headline. Output JSON \
only — no commentary, no ``` fences."""


def _parse_json(text: str) -> Optional[dict]:
    """Extract JSON tolerating ``` fences and short preambles."""
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
        logger.warning(f"bento strategist returned non-JSON: {e}; head={text[:200]!r}")
        return None
    return data if isinstance(data, dict) else None


_LAYOUT_VALUES = {"icon-led", "text-led", "split", "ui-mockup", "illustration", "stat-led"}
_MOOD_VALUES = {"minimal-light", "dark-tech", "editorial-soft", "vibrant-saturated", "mono-statement"}
_BG_TONE_VALUES = {"light", "dark"}


def _normalise_brief(data: dict) -> Optional[dict]:
    """Cap lengths, default unknowns, drop unusable briefs."""
    headline = (data.get("headline") or "").strip().strip('"').strip("'")[:90]
    if not headline:
        # Without a headline the renderer has nothing to anchor on.
        return None

    layout = (data.get("layout") or "").strip().lower()
    if layout not in _LAYOUT_VALUES:
        layout = "text-led"

    mood = (data.get("mood") or "").strip().lower()
    if mood not in _MOOD_VALUES:
        mood = "minimal-light"

    bg_tone = (data.get("bg_tone") or "").strip().lower()
    if bg_tone not in _BG_TONE_VALUES:
        # Infer from mood when the model forgot.
        bg_tone = "dark" if mood == "dark-tech" else "light"

    return {
        "headline": headline,
        "subheadline": (data.get("subheadline") or "").strip().strip('"').strip("'")[:160],
        "overline": (data.get("overline") or "").strip().strip('"').strip("'")[:40],
        "layout": layout,
        "mood": mood,
        "bg_tone": bg_tone,
        "accent_hex": (data.get("accent_hex") or "").strip()[:9],
        "palette_hex": [c for c in (data.get("palette_hex") or []) if isinstance(c, str)][:6],
        "visual_direction": (data.get("visual_direction") or "").strip()[:600],
        "render_prompt": (data.get("render_prompt") or "").strip()[:4000],
        "rationale": (data.get("rationale") or "").strip()[:240],
    }


async def design_bento_brief(
    *,
    product_description: str,
    product_name: Optional[str] = None,
    audience: Optional[str] = None,
    tone_pref: Optional[str] = None,
    color_primary: Optional[str] = None,
    template_bytes: Optional[bytes] = None,
    template_slug: Optional[str] = None,
    locked_style_bytes: Optional[bytes] = None,
) -> Optional[dict]:
    """
    Produce the bento brief.

    Returns None when the API key is missing, the model output won't parse,
    or the brief has no headline. Caller can fall back to the legacy
    direct-form path or surface a 502 to the user.

    Image inputs are passed verbatim to the multimodal Gemini call so the
    strategist sees the same anchors the image generator will see — keeps
    palette/typography decisions consistent across the two hops.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY missing — cannot run bento strategist.")
        return None

    template_block = (
        f"A curated template was provided as the visual style anchor "
        f"(slug: {template_slug or 'unknown'}). Image 1 in the inputs "
        "above shows the exact card to inherit palette, typography rhythm "
        "and layout family from. Do NOT copy its text content."
        if template_bytes
        else "(no template — design from scratch using the conventions above)"
    )

    locked_block = (
        "A LOCKED style anchor was provided (image 2 in the inputs above) "
        "— this is a previously-generated bento the user accepted. The new "
        "card MUST inherit its palette (every hex), its icon style, its "
        "typography family and its layout family. Treat it as a sister "
        "cell on the same landing page, not a fresh design."
        if locked_style_bytes
        else "(none — this is the first card in the series)"
    )

    user_block = _STRATEGIST_USER_TEMPLATE.format(
        product_description=product_description.strip(),
        product_name=(product_name or "").strip(),
        audience=(audience or "(not specified — infer from description)").strip(),
        tone_pref=(tone_pref or "(not specified — pick the right tone for the product)").strip(),
        color_primary=(color_primary or "(not specified — pick a palette that fits)").strip(),
        template_block=template_block,
        locked_block=locked_block,
    )

    contents: list = []
    # Order matters: the strategist sees the same image refs in the same
    # order the image model will. Template first (style anchor), then
    # locked style anchor (user-pinned previous output) — both before the
    # text block so the model treats them as primary visual context.
    if template_bytes:
        contents.append(types.Part.from_bytes(data=template_bytes, mime_type="image/jpeg"))
    if locked_style_bytes:
        contents.append(types.Part.from_bytes(data=locked_style_bytes, mime_type="image/png"))
    contents.append(_STRATEGIST_SYSTEM + "\n\n" + user_block)

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=0.55,
                response_mime_type="application/json",
            ),
        )
    except Exception as e:
        logger.error(f"bento strategist call failed: {e}")
        return None

    raw = getattr(response, "text", "") or ""
    data = _parse_json(raw)
    if not data:
        logger.warning(f"bento strategist JSON parse failed; head={raw[:200]!r}")
        return None
    return _normalise_brief(data)
