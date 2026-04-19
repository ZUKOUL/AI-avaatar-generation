"""
Niche registry — one-click AI video templates tuned for a specific
TikTok / Reels content style.

Each niche locks a style profile (visual identity, voice, pacing, tone,
language) plus a topic-generation strategy, so a user can click
"Generate" and get back a video that visually + narratively belongs to
that channel's aesthetic — no prompt-writing required.

Why code-as-source-of-truth instead of a DB table:
    - Git-tracked iteration (we WILL tune these prompts over time).
    - Zero ops cost — deploying a new niche is a PR.
    - Still exposes a nice JSON shape to the frontend via `serialize()`
      so the UI renders cards dynamically and new niches show up the
      moment they land on main.
    - A DB layer can wrap this later when we want user-editable niches.

To add a new niche:
    1. Add a `Niche(...)` entry at the bottom of this file.
    2. That's it — the /ai-videos/niches endpoint picks it up, the
       frontend renders a card, and the orchestrator knows how to use
       its style instructions.
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────
# Niche schema
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class Niche:
    """Preset for a TikTok/Reels creative niche.

    All string fields are rendered into downstream LLM prompts — keep
    them concrete and specific. Vague niches produce vague videos.
    """

    # Identity ---------------------------------------------------------------
    slug: str                            # URL-safe id (primary key)
    name: str                            # human-readable label for the card
    handle: str                          # "@humain.penseur" — reference account
    description: str                     # one line shown in the UI card
    tagline: str = ""                    # optional secondary line on the card

    # Language + tone --------------------------------------------------------
    language: str = "auto"               # ISO-639-1, 'auto' lets Gemini detect
    tone: str = ""                       # passed through to script generator

    # Generation settings ----------------------------------------------------
    # These override the user-visible defaults on one-click generation.
    default_duration_seconds: int = 60
    default_mode: str = "slideshow"      # 'slideshow' | 'motion'
    default_aspect_ratio: str = "9:16"
    default_subtitle_style: str = "karaoke"
    default_voice_enabled: bool = True
    default_voice_id: Optional[str] = None   # ElevenLabs voice id override

    # Style injection --------------------------------------------------------
    # Appended to every keyframe image_prompt. This is what gives a niche
    # its unmistakable visual signature — grain, palette, subject vocabulary.
    visual_style: str = ""

    # Passed to BOTH the script generator and the storyboard generator as an
    # extra "STYLE INSTRUCTIONS" clause. Use it for voice, pacing, structure
    # expectations — anything the LLM should internalise beyond tone.
    style_instructions: str = ""

    # Topic pool -------------------------------------------------------------
    # A text prompt that Gemini receives to invent fresh topics in the
    # niche's style. We use this instead of rotating through a finite list
    # so channels don't become repetitive after 20 videos. The prompt
    # should tell the LLM to think like the channel's editor and surface
    # topics with strong share / watch-through potential.
    topic_generation_prompt: str = ""

    # Fallback list used when Gemini isn't available — we pick one at random.
    fallback_topics: list[str] = field(default_factory=list)

    # Post metadata ---------------------------------------------------------
    # Hashtags we surface to the user when the video is ready so they can
    # copy-paste a performant caption + tag set. These are the ones the
    # reference channel actually uses — not AI-guessed generic tags.
    recommended_hashtags: list[str] = field(default_factory=list)
    caption_template: str = ""   # optional templated caption, {topic} substituted

    # Reference images for direct visual conditioning -----------------------
    # TEXT PROMPTS ALONE ARE NOT ENOUGH to lock a niche's look. Observed
    # failure: Gemini 3 Pro Image renders "matte white stylised figure"
    # as a marble/stone statue when the video topic is philosophical,
    # regardless of how much we say "NOT stone" in the prompt. One
    # actual reference image is worth ~2000 words of style description.
    #
    # Each entry is either:
    #   - a repo-relative path, e.g. "app/services/niche_assets/claymation_3d/ref_01.png"
    #   - OR an absolute URL (https://…)
    # The pipeline resolves + fetches at render time.
    reference_image_sources: list[str] = field(default_factory=list)

    # UI --------------------------------------------------------------------
    # Pure-CSS card background so we don't need to host thumbnails yet.
    # The frontend applies this as `style={{ background: gradient_css }}`.
    card_gradient: str = "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
    accent_color: str = "#e8c372"

    # ─── Serialisation ────────────────────────────────────────────────────

    def serialize(self) -> dict:
        """Shape sent to the frontend for card rendering. We deliberately
        omit the raw style/topic prompts — they're implementation detail."""
        return {
            "slug": self.slug,
            "name": self.name,
            "handle": self.handle,
            "description": self.description,
            "tagline": self.tagline,
            "language": self.language,
            "tone": self.tone,
            "default_duration_seconds": self.default_duration_seconds,
            "default_mode": self.default_mode,
            "default_aspect_ratio": self.default_aspect_ratio,
            "default_subtitle_style": self.default_subtitle_style,
            "default_voice_enabled": self.default_voice_enabled,
            "default_voice_id": self.default_voice_id,
            "card_gradient": self.card_gradient,
            "accent_color": self.accent_color,
            "recommended_hashtags": self.recommended_hashtags,
            "caption_template": self.caption_template,
            "sample_topics": self.fallback_topics[:5],   # for UI hover preview
        }

    # ─── Topic generator ──────────────────────────────────────────────────

    async def pick_topic(self) -> str:
        """Return ONE topic phrase for a fresh video in this niche.

        Uses `suggest_topics(count=1)` under the hood so the ranking + UI
        and the one-click flow share the same prompt + logic.
        """
        topics = await self.suggest_topics(count=1)
        if topics:
            return topics[0]
        # Last resort — the name of the niche itself.
        return self.name

    async def suggest_topics(self, count: int = 6) -> list[str]:
        """Return `count` fresh topic ideas for this niche, sorted by
        expected virality / watch-through.

        The LLM is instructed to think like the channel's editor and
        diversify the list (different angles, different pain points).
        Falls back to random picks from `fallback_topics` when Gemini is
        unavailable so the UI always has something to render.
        """
        count = max(1, min(12, count))

        if os.getenv("GEMINI_API_KEY") and self.topic_generation_prompt:
            try:
                fresh = await self._gemini_suggest_topics(count)
                if fresh:
                    return fresh
            except Exception as e:
                logger.warning(
                    f"Gemini topic suggestion failed for niche {self.slug}: {e}"
                )

        if self.fallback_topics:
            pool = list(self.fallback_topics)
            random.shuffle(pool)
            return pool[:count]

        return [self.name]

    async def _gemini_suggest_topics(self, count: int) -> list[str]:
        """One LLM call → list of topic strings. Single call (rather than
        N calls) so the model can actively DIVERSIFY the ideas against
        each other and rank them by virality potential."""
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        prompt = f"""{self.topic_generation_prompt}

Your job NOW: propose {count} distinct topics, sorted from highest to
lowest expected TikTok / Reels virality potential.

For each topic think about:
- HOOK STRENGTH — does the title alone stop the scroll?
- SHAREABILITY — would a viewer tag a friend?
- SATURATION — avoid topics already done to death on the channel
- PROVOCATION — angles that challenge a common belief beat generic
  "be yourself" content
- CURRENT ZEITGEIST — is there a tension in modern life that makes this
  land RIGHT NOW?

Return STRICT JSON shaped exactly like this:
{{
  "topics": [
    {{ "title": "<the hook / title as it would appear in the video>",
       "rationale": "<one short line why it will perform>" }}
  ]
}}
Do not include any other keys. No markdown, no prose outside the JSON.
"""

        resp = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-pro",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.95,    # very high — we want genuine variety
            ),
        )

        # Cheap JSON parse — never raise, let the caller fall back.
        import json, re
        raw = (resp.text or "").strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            data = json.loads(m.group(0)) if m else {}

        titles: list[str] = []
        for t in (data.get("topics") or [])[:count]:
            if isinstance(t, dict):
                title = (t.get("title") or "").strip()
            elif isinstance(t, str):
                title = t.strip()
            else:
                continue
            if title:
                titles.append(title[:500])

        if not titles:
            raise RuntimeError("Gemini returned no topic suggestions.")
        return titles


# ──────────────────────────────────────────────────────────────────────────
# Registry — add new niches at the bottom.
# ──────────────────────────────────────────────────────────────────────────

_NICHES: dict[str, Niche] = {}


def _register(niche: Niche) -> None:
    _NICHES[niche.slug] = niche


def get_niche(slug: str) -> Optional[Niche]:
    """Lookup. Returns None for unknown slugs — caller handles 404."""
    return _NICHES.get(slug)


def list_niches() -> list[Niche]:
    """Stable-ordered list (insertion order)."""
    return list(_NICHES.values())


# ──────────────────────────────────────────────────────────────────────────
# Claymation 3D — minimalist matte-white-characters aesthetic
# ──────────────────────────────────────────────────────────────────────────
#
# WHAT THIS NICHE IS
# ------------------
# This is a VISUAL niche, not a topic niche. The signature is the
# cinematic 3D claymation look popularised by accounts like
# @humain.penseur — matte white stylized humanoid figures, smooth
# featureless skin, monochrome charcoal / obsidian / midnight-blue
# palette, soft volumetric studio lighting. The SUBJECT the video
# covers is intentionally free:
#     - psychology / emotional patterns (the @humain.penseur playbook)
#     - masculine / feminine energy
#     - relationships, attachment, break-ups
#     - modern life tensions
#     - stoic / philosophical reflections
#     - anything else that benefits from a slow, cinematic, thought-
#       provoking register
#
# The LLM is instructed to match the mood + pacing (deep narrator,
# short punchy sentences, provocative hook, reflective close) regardless
# of the specific topic the user supplies.
#
# Reference visual prompt pattern (Style Base, locked on every scene):
#   "Cinematic 3D minimalist animation, claymation aesthetic, matte
#    white stylized humanoid characters with no hair (except female
#    with ponytail), smooth featureless skin, monochrome palette:
#    charcoal grey, deep obsidian, and muted midnight blue. Soft
#    volumetric studio lighting, high contrast, 4K, 9:16 vertical."
#
# Reference channel for TONE + topic inspiration: @humain.penseur.

_register(Niche(
    slug="claymation_3d",
    name="Claymation 3D",
    handle="@humain.penseur",
    description=(
        "Personnages 3D blancs, style claymation minimaliste. "
        "Palette charcoal + obsidian + midnight blue. "
        "Fonctionne pour psycho, masculinité, relations, réflexions…"
    ),
    tagline="Claymation 3D · Cinematic",

    language="fr",
    tone="introspective, deep, slow-paced, reflective",

    default_duration_seconds=60,
    default_mode="slideshow",      # Ken Burns fits the contemplative pacing
    default_aspect_ratio="9:16",
    default_subtitle_style="karaoke",
    default_voice_enabled=True,
    default_voice_id=None,          # let the user pick their FR voice

    # ── THE VISUAL SIGNATURE ───────────────────────────────────────────
    # Appended to EVERY keyframe prompt. But text alone is NOT enough —
    # observed failure: Gemini 3 Pro Image rendered "matte white
    # stylized figure" as marble / stone busts when the topic was
    # philosophical, no matter how the prompt was worded. The fix is to
    # also pass REFERENCE IMAGES (see reference_image_sources below)
    # which the model conditions on directly. Images > 2000 words of
    # prose every time.
    #
    # The text below is written with EXPLICIT NEGATIVES so the model
    # has a hard line not to cross even without the image conditioning.
    visual_style=(
        "STYLE — THIS IS A CARTOON CHARACTER, NOT A SCULPTURE. "
        "Match the reference image(s) EXACTLY (if provided). "
        "3D minimalist claymation animation, like a Pixar / Tim Burton "
        "short film.\n\n"
        "CHARACTERS: soft rounded WHITE plastic-like figures, smooth "
        "rubbery clay-animation skin, simplified minimal faces (small "
        "oval eyes, a tiny mouth line, nothing else). Male characters "
        "are COMPLETELY BALD. Female characters have a single high "
        "pony-tail and nothing else. Rounded cartoon limbs.\n\n"
        "MATERIAL: matte painted plastic / rubber / Play-Doh. Subtle "
        "soft subsurface-scattering like a vinyl figurine. "
        "STRICTLY FORBIDDEN materials: stone, marble, concrete, bronze, "
        "rust, weathered / aged surfaces, cracked textures, carved-"
        "sculpture faces. This is NEVER a statue, NEVER a bust, NEVER "
        "an art piece — it is a CARTOON 3D CHARACTER.\n\n"
        "ENVIRONMENT: clean minimalist 3D studio sets — empty rooms, "
        "single arches / doorways, abstract voids, simple geometric "
        "architecture. Never cluttered, never photorealistic. Forbidden: "
        "ancient ruins, cathedrals, landscape photography, nature "
        "scenes with film grain.\n\n"
        "PALETTE: strict monochrome — charcoal grey + deep obsidian "
        "black + muted midnight blue ONLY. Occasional SINGLE soft "
        "accent of amber or translucent cyan light for one emotional "
        "beat. Forbidden: warm golden-hour lighting covering the frame, "
        "sepia tones, bronze coverage, full-scene amber wash.\n\n"
        "LIGHTING: soft volumetric studio lighting like a product "
        "photoshoot. Single key light from the side, long gentle "
        "shadows, high contrast between the white figure and the dark "
        "background. NO film grain, NO lens flare, NO photographic "
        "artefacts — clean 3D render.\n\n"
        "RENDERING: Cinema 4D / Octane / Blender Cycles cartoon-3D "
        "aesthetic. NOT photorealistic. NOT 35mm film. Vertical 9:16 "
        "composition, figures centred or off-centre against negative "
        "space."
    ),

    # ── NARRATOR VOICE + STRUCTURE (topic-agnostic) ───────────────────
    # Locks the MOOD and PACING without constraining the subject. Works
    # for psychology, masculinity, relationships, philosophy, etc.
    style_instructions=(
        "Write in the exact voice of a French cinematic-introspection TikTok "
        "channel (reference: @humain.penseur). REQUIRED STRUCTURE:\n"
        "  HOOK (0-4s): A provocative question or a counter-intuitive claim "
        "that stops the scroll. If the topic is psychological or behavioural, "
        "favour the format 'Pourquoi certaines personnes … ?' If the topic is "
        "about energy / relationships / values, a direct bold statement is "
        "also fine.\n"
        "  DEVELOPMENT (4-45s): explain the mechanism in plain French, through "
        "concrete micro-scenes the viewer recognises from their own life. "
        "Short declarative sentences. Deliberate pauses implied by full stops. "
        "When relevant, reference a real concept (attachement anxieux, "
        "énergie masculine, dissonance cognitive, stoïcisme, etc.) but decode "
        "it immediately with an everyday example — never leave the viewer "
        "stuck on jargon.\n"
        "  REVEAL (45-55s): name the underlying pattern + why it self-perpetuates.\n"
        "  LANDING (55-60s): a line that lets the viewer SEE themselves. No "
        "CTA, no 'follow for more', no moralising, no false optimism.\n"
        "\n"
        "RULES:\n"
        "- Never say 'guys', 'les gars', 'abonne-toi', 'commente', 'partage'.\n"
        "- Second-person address is rare and only at the end.\n"
        "- The insight IS the payoff — don't wrap up with a lesson or advice.\n"
        "- Match the tone to the subject: psychology → tender and non-"
        "judgmental; masculinity/energy → deeper and more grounded; "
        "philosophy → restrained and contemplative."
    ),

    # ── TOPIC IDEATION ─────────────────────────────────────────────────
    # Flexible across multiple subject domains but still opinionated about
    # WHAT makes a good video in this aesthetic: introspective, hook-driven,
    # revealing hidden patterns.
    topic_generation_prompt=(
        "You are the editor of a popular French cinematic-introspection "
        "TikTok channel in the Claymation 3D visual style (reference: "
        "@humain.penseur). Target audience: adults 20-45. Subjects that "
        "perform well:\n"
        "  - Pop psychology / emotional patterns (dissonance, évitement, "
        "    attachement, rumination, parentification, alexithymie, HPI/HPE, "
        "    syndrome de l'imposteur, malédiction du savoir…)\n"
        "  - Masculine + feminine energy dynamics, relationship patterns, "
        "    attachment + break-ups, the 'why he pulls away' / 'why she "
        "    overfunctions' territory\n"
        "  - Modern-life tensions (solitude in a crowd, hyper-stimulation, "
        "    purpose drift, comparison fatigue)\n"
        "  - Stoic / philosophical reflections when framed as behavioural "
        "    patterns, not as quotes\n"
        "\n"
        "Invent fresh French video titles that:\n"
        "  a) stop the scroll on the HOOK ALONE (no one needs context to "
        "     click);\n"
        "  b) reveal a HIDDEN EMOTIONAL TRUTH (not a generic 'be yourself' "
        "     line);\n"
        "  c) sit naturally in the Claymation 3D visual style — topics that "
        "     benefit from a slow contemplative voice over abstract "
        "     minimalist figures;\n"
        "  d) diversify across the subject domains above (don't propose 6 "
        "     psychology titles in a row).\n"
        "\n"
        "Preferred format: '[concept or pattern name] : Pourquoi [behaviour/"
        "tension]… [twist] ?' — but a direct provocative claim is also "
        "acceptable when the subject calls for it."
    ),

    fallback_topics=[
        # Psychology angles (reference channel's comfort zone)
        "L'évitement émotionnel : pourquoi certaines personnes préfèrent-elles "
        "se perdre dans le travail plutôt que de ressentir ce qu'elles vivent ?",
        "La malédiction du savoir : pourquoi comprendre parfaitement les "
        "autres finit-il par nous isoler d'eux ?",
        "Le perfectionnisme comme protection : pourquoi viser l'irréprochable "
        "revient-il souvent à cacher qu'on se sent profondément indigne ?",
        # Masculine / feminine energy
        "L'énergie masculine : pourquoi un homme qui aime profondément ne "
        "sera-t-il jamais totalement serein ?",
        "Le silence masculin : pourquoi un homme qui ne demande plus rien "
        "est-il déjà parti émotionnellement ?",
        "La féminité sacrée : pourquoi une femme qui se connaît devient-elle "
        "soudainement moins disponible ?",
        # Relationships
        "L'attachement anxieux : pourquoi a-t-on besoin d'être rassuré sans "
        "jamais vraiment l'être ?",
        "Les ruptures qui guérissent : pourquoi certaines séparations nous "
        "remettent-elles enfin en vie ?",
        # Modern life tensions
        "Le bruit intérieur : pourquoi cherchons-nous le silence à l'extérieur "
        "alors que le vacarme est en nous ?",
        "La solitude moderne : pourquoi sommes-nous les plus seuls au milieu "
        "d'une foule de notifications ?",
    ],

    # Generic cross-domain hashtag set — user can trim per topic.
    recommended_hashtags=[
        "#psychologie", "#santémentale", "#emotions", "#introspection",
        "#developpementpersonnel", "#relations", "#reflexion", "#philosophie",
    ],
    caption_template=(
        "{topic}\n\n"
        "#psychologie #santémentale #emotions #introspection "
        "#developpementpersonnel #reflexion"
    ),

    # Reference image(s) passed directly to Gemini 3 Pro Image as
    # multimodal conditioning. This is what actually locks the cartoon
    # claymation look — the text prompt alone is not reliable.
    # See app/services/niche_assets/claymation_3d/README.md for how to
    # add or swap reference images.
    reference_image_sources=[
        "app/services/niche_assets/claymation_3d/ref_01.png",
    ],

    # Card gradient matches the claymation palette (charcoal → obsidian →
    # midnight blue), not a warm golden look.
    card_gradient=(
        "linear-gradient(135deg, #1c1c1c 0%, #0d1424 50%, #1c2b4a 100%)"
    ),
    accent_color="#d6dce5",
))


# ─── Add the next niche below (template) ──────────────────────────────────
#
# _register(Niche(
#     slug="...",
#     name="...",
#     handle="@...",
#     description="...",
#     language="en",
#     tone="...",
#     visual_style="...",
#     style_instructions="...",
#     topic_generation_prompt="...",
#     fallback_topics=[...],
#     card_gradient="linear-gradient(...)",
# ))
