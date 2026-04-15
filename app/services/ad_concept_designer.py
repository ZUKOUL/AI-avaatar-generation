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


# Full taxonomy of static ad formats that actually perform in the Meta Ad
# Library. We pick one at random per request so consecutive generations
# don't collapse onto the same "before/after" or "UGC morning ritual"
# pattern — that was the #1 complaint from users who generated 5 ads in a
# row and got 5 before/afters.
#
# Keep this list BROAD. If you add an angle here it will start showing up
# in rotation immediately — no other code change needed.
_CONCEPT_ANGLES = [
    # People-centric / UGC
    "UGC selfie — real-feeling customer holding the product with an iPhone, imperfect framing, bathroom or kitchen mirror",
    "Founder-to-camera — visible creator/founder holding the product, warm eye-contact, trust-building",
    "POV first-person — shot from the user's perspective, their hand using the product in context",
    "Micro-influencer unboxing moment — hands pulling product out of packaging, emotional first-reaction vibe",
    "Customer-in-action hero — real person mid-motion, using the product, captured in a candid moment of value",

    # Problem / solution / comparison
    "Problem close-up — macro shot of the pain the product solves (messy hair, dirty car seat, bad posture) with product entering the frame",
    "Split-screen this-vs-that — problem on the left, solution on the right, labelled",
    "Stacked comparison — product vs. competitor, side by side with clear labels and arrows",
    "Before/after transformation split — classic two-panel change visualisation (only when the product genuinely shows a visible transformation)",

    # Social proof / text-forward
    "Testimonial screenshot overlay — fake review card (5 stars + customer quote) layered on a lifestyle shot",
    "Reddit / TikTok comment screenshot — viral-feeling quote pulled from the audience, product visible alongside",
    "Star-rating callout — giant ★★★★★ 4.9/5 rating block, product held or placed nearby",
    "Social proof stack — 3–4 layered review cards fanning around the product",
    "Big-number stat hero — dominant data point (e.g. '93% results in 7 days') as the focal headline, product supporting",

    # Bold / typographic / interruption
    "Text-heavy bold statement — oversized sans-serif headline occupying most of the frame, product small but striking",
    "Interruption-pattern framing — deliberately unusual crop or extreme close-up that breaks the scroll",
    "Bold colour-block backdrop — product hero against a single punchy flat colour for Stories/Reels placement",
    "Infographic-style feature callout — bullet points with arrows pointing at specific product details",
    "Meme-inspired format — culturally-relevant composition (safe-for-work), product tied into a familiar visual joke",

    # Editorial / premium
    "Magazine editorial — Vogue/Apple-ad feel, dramatic lighting, refined colour grade, generous negative space",
    "Outdoor golden-hour cinematic — real person using product during sunset, warm backlight, lens flare, aspirational",
    "Luxury still-life — product on polished marble/brushed metal/velvet, specular highlights, rich blacks",

    # Product-forward
    "Close-up texture / material macro — extreme detail shot emphasising craftsmanship and quality",
    "Packaging-as-hero — the box / branded packaging itself is the creative, with product partly revealed",
    "Variety group shot — every colourway or size of the product lined up, 'something for everyone' feel",

    # Demonstration
    "Sequential demo frames — 2–3 in-frame panels showing the product being used step-by-step",
    "Hand-pointing callout — human hand pressing a button / pointing at a feature, demonstrating ease-of-use",
    "Gift-reveal surprise — opening a box moment, birthday/holiday emotional pull, product emerging",
]


_BRIEF_PROMPT = """You are a senior DTC e-commerce strategist. Before any ad \
is designed, you sit down and answer the questions a great marketer asks \
themselves about their own product. Use Google Search to study the niche, \
competitors, and target-audience language — think like someone who has \
spent $10M+ profitably on Meta ads.

PRODUCT
- Name: {name}
- Category: {category}
- Description: {description}
- Key features: {features}
- Price (if known): {price}

ANSWER THESE QUESTIONS, thoroughly and specifically. No fluff, no generic \
answers that could apply to any product.

Return ONLY a JSON object with these exact keys:

- "problem_solved": the CONCRETE daily pain this product removes — not \
  "makes life better" but "cleans stubborn pet hair off car seats in 30s \
  instead of vacuuming for 20 min"
- "target_audience": 1-2 sentences describing WHO exactly buys this — \
  demographic + psychographic + life context (age range, gender lean if \
  any, income level, routine, motivations)
- "before_state": what the customer's life looks like RIGHT NOW without \
  this product — the unpleasant status quo, in vivid terms
- "after_state": the desirable outcome they'll get from using it — tangible \
  and specific, not abstract
- "key_benefit": the ONE benefit you'd lead with in the ad headline. Pick \
  the single most emotionally compelling one, not a list
- "main_objection": the #1 objection buyers will have in their head \
  ("too expensive", "probably doesn't actually work", "I don't really \
  need this") — state it bluntly
- "objection_response": how the ad visual or overlay should pre-empt \
  that objection (e.g. "show it actually working in 5 seconds")
- "emotional_angle": the core emotion to trigger (relief, pride, FOMO, \
  curiosity, guilt, empowerment, belonging, etc.) with a short reason why
- "winning_hook_ideas": array of 3-5 short ad hook headlines (max 8 words each, \
  title-case, no emoji), each testing a different angle
- "social_proof_cue": what credibility element belongs in the ad — "reviews \
  screenshot", "before/after photo", "creator holding product", "UGC face \
  to camera", or null if not relevant
- "urgency_or_scarcity": what makes the viewer act NOW rather than saving \
  for later — or null if the product doesn't warrant it

RULES
- Answers must be SPECIFIC to this exact product — no boilerplate
- Skip anything you're not sure about rather than inventing
- Output MUST be valid JSON, no markdown fences, no prose around it
"""


_CONCEPT_PROMPT = """You are a top-tier performance marketer who has scaled \
thousands of Facebook and Instagram ads for e-commerce and dropshipping brands. \
You work like an analyst: study what's winning RIGHT NOW, then design accordingly.

STRATEGIC BRIEF (already answered by the marketer — USE THIS to drive the concept):
{brief_block}

RESEARCH TASK (use Google Search aggressively)
1. Search the Meta Ad Library and top DTC brand accounts for STATIC image ads \
   in the "{category}" niche — look for ads that have been live 30+ days \
   (repeat-spend signal = it works).
2. Also pull references from:
   - TikTok Creative Center
   - Foreplay.co / Motion.ai public ad swipes
   - Top-performing Shopify / Dropshipping landing-page creatives
3. Identify the VISUAL FORMATS that keep reappearing for this kind of \
   product — NOT one format, the full spread.
4. Ignore video ads. Only single-image creatives.

PRODUCT TO ADVERTISE
- Name: {name}
- Category: {category}
- Description: {description}
- Key features: {features}

CREATIVE FORMAT TO USE (chosen at random from the winning-format library — \
commit to this format, do NOT substitute a different one):

{angle}

YOUR OUTPUT
Design ONE winning static ad concept in the format above, tailored to this \
exact product and strategic brief. Convey the KEY BENEFIT, pre-empt the \
MAIN OBJECTION, hit the EMOTIONAL ANGLE. Return ONLY a JSON object with \
these exact keys:

- "concept_name": 3-6 word descriptor naming the format + the twist (e.g. \
  "Testimonial overlay on lifestyle", "Magazine editorial macro", \
  "Star-rating callout")
- "visual_direction": 2-4 sentences describing exactly what the image shows — \
  setting, who is in frame (if anyone), what they are doing, where the product \
  sits, the overall feel. Be specific and visual, like a photographer brief. \
  The scene must visually communicate the key benefit from the brief.
- "composition": camera angle, framing, how negative space is used for text overlay
- "mood_lighting": lighting style and mood in one short phrase
- "hook_overlay_text": SHORT ad headline that goes on the image, max 7 words, \
  no emoji, title-case — pull from the brief's winning_hook_ideas and adapt. \
  Use null ONLY when the chosen format genuinely reads better without text \
  (rare — most ad formats want a headline).
- "why_it_converts": one sentence tying the visual choice back to the \
  psychological trigger from the strategic brief

HARD RULES
- COMMIT to the chosen format. Do NOT default to before/after unless that \
  format was specifically selected above. The user has complained that every \
  ad comes out as a before/after split — break that pattern.
- The concept MUST look like a native Facebook/Instagram ad, not a sterile \
  catalogue photo.
- Composition must leave room for headline text where the chosen format \
  uses one.
- Output MUST be valid JSON, no markdown fences, no prose around it.
"""


def _parse_grounded_json(text: str) -> Optional[dict]:
    """Defensive JSON extraction — grounding mode returns raw text that may
    be wrapped in ``` fences or have a short preamble before the object."""
    text = (text or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).rstrip("`").strip()
    if not text.startswith("{"):
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            text = match.group(0)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


async def design_marketing_brief(
    name: str,
    category: Optional[str],
    description: Optional[str],
    features: Optional[list],
    price: Optional[str] = None,
) -> Optional[dict]:
    """
    Chain-of-thought step #1 — the AI sits down as an e-commerce strategist
    and answers the foundational questions (problem solved, target audience,
    key benefit, main objection, emotional angle, social proof, urgency…)
    BEFORE any visual concept gets designed.

    The resulting brief is fed into design_ad_concept() so the generated ad
    is strategy-aligned instead of just aesthetically pretty.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY missing — skipping marketing brief.")
        return None

    try:
        client = genai.Client(api_key=api_key)
        prompt = _BRIEF_PROMPT.format(
            name=name or "unnamed product",
            category=category or "general consumer goods",
            description=description or "(no description provided)",
            features=", ".join(features or []) or "(no features provided)",
            price=price or "(unknown)",
        )
        response = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.5,  # strategic answers, not creative fiction
            ),
        )
        data = _parse_grounded_json(getattr(response, "text", "") or "")
        if not data:
            return None

        # Normalise + cap lengths so we can safely stuff this back into later
        # prompts without running out of context budget.
        brief = {
            "problem_solved": (data.get("problem_solved") or "").strip()[:400],
            "target_audience": (data.get("target_audience") or "").strip()[:400],
            "before_state": (data.get("before_state") or "").strip()[:400],
            "after_state": (data.get("after_state") or "").strip()[:400],
            "key_benefit": (data.get("key_benefit") or "").strip()[:200],
            "main_objection": (data.get("main_objection") or "").strip()[:300],
            "objection_response": (data.get("objection_response") or "").strip()[:300],
            "emotional_angle": (data.get("emotional_angle") or "").strip()[:300],
            "social_proof_cue": None,
            "urgency_or_scarcity": None,
        }

        # Hook ideas list
        raw_hooks = data.get("winning_hook_ideas") or []
        hooks: list[str] = []
        if isinstance(raw_hooks, list):
            for h in raw_hooks:
                if isinstance(h, str):
                    clean = h.strip().strip('"').strip("'")[:80]
                    if clean:
                        hooks.append(clean)
        brief["winning_hook_ideas"] = hooks[:6]

        # Optional fields — keep None when the strategist said "not relevant"
        spc = data.get("social_proof_cue")
        if isinstance(spc, str) and spc.strip():
            brief["social_proof_cue"] = spc.strip()[:200]
        urg = data.get("urgency_or_scarcity")
        if isinstance(urg, str) and urg.strip():
            brief["urgency_or_scarcity"] = urg.strip()[:200]

        if not brief["key_benefit"] and not brief["problem_solved"]:
            return None  # useless without at least these
        return brief

    except Exception as e:
        logger.warning(f"Marketing brief generation failed: {e}")
        return None


def _format_brief_for_concept(brief: Optional[dict]) -> str:
    """Render the marketing brief as a compact block to slot into the concept
    designer prompt. Skips empty fields so the prompt stays lean."""
    if not brief:
        return "(no strategic brief available — design from product info alone)"
    lines: list[str] = []
    pairs = [
        ("Problem solved", brief.get("problem_solved")),
        ("Target audience", brief.get("target_audience")),
        ("Before state", brief.get("before_state")),
        ("After state", brief.get("after_state")),
        ("Key benefit to lead with", brief.get("key_benefit")),
        ("Main buyer objection", brief.get("main_objection")),
        ("How to pre-empt it visually", brief.get("objection_response")),
        ("Emotional angle", brief.get("emotional_angle")),
        ("Social proof cue", brief.get("social_proof_cue")),
        ("Urgency / scarcity", brief.get("urgency_or_scarcity")),
    ]
    for label, val in pairs:
        if val:
            lines.append(f"- {label}: {val}")
    hooks = brief.get("winning_hook_ideas") or []
    if hooks:
        lines.append("- Winning hook ideas to draw from:")
        for h in hooks:
            lines.append(f"    • {h}")
    return "\n".join(lines) if lines else "(brief empty)"


async def design_ad_concept(
    name: str,
    category: Optional[str],
    description: Optional[str],
    features: Optional[list],
    brief: Optional[dict] = None,
) -> Optional[dict]:
    """
    Ask Gemini 2.5 Pro (with Google Search grounding) to design a winning
    Facebook ad concept for the product. Returns None on failure.

    When `brief` is provided (from design_marketing_brief), the concept is
    strategically aligned with the marketer's answers. Without a brief we
    still work — the concept just won't be as targeted.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY missing — skipping ad concept design.")
        return None

    try:
        client = genai.Client(api_key=api_key)
        angle = random.choice(_CONCEPT_ANGLES)
        prompt = _CONCEPT_PROMPT.format(
            brief_block=_format_brief_for_concept(brief),
            name=name or "unnamed product",
            category=category or "general consumer goods",
            description=description or "(no description provided)",
            features=", ".join(features or []) or "(no features provided)",
            angle=angle,
        )

        response = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.85,  # creative variance across re-rolls
            ),
        )
        data = _parse_grounded_json(getattr(response, "text", "") or "")
        if not data:
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
