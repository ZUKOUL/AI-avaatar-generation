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

    # Reference scene-by-scene analyses of real channel videos. Fed to
    # the storyboard generator as FEW-SHOT examples so the LLM learns
    # the cadence + scene-level visual detail the channel actually uses
    # — no more generic "lonely figure in room" prompts.
    #
    # Each entry looks like:
    #   {
    #     "topic": "<one-line summary of the source video>",
    #     "scenes": [
    #       {"start": 0, "end": 7,
    #        "voiceover": "<exact spoken line>",
    #        "image_prompt": "<detailed visual description>",
    #        "motion_prompt": "<optional motion direction>"},
    #       ...
    #     ]
    #   }
    #
    # Can be seeded from `/ai-videos/analyze-reference` (Gemini
    # auto-extracts from a TikTok URL) or hand-authored.
    reference_storyboard_examples: list[dict] = field(default_factory=list)

    # Full narration scripts extracted from real reference videos. Fed
    # to the SCRIPT generator (generate_script) as few-shot examples so
    # the LLM mimics the exact cadence / structure / signature phrases
    # of the reference channel. Separate from storyboard examples: one
    # teaches "what a narration sounds like", the other teaches "what a
    # scene-level image prompt looks like".
    #
    # Each entry:
    #   { "topic": "<short summary>", "full_text": "<complete narration>" }
    reference_script_examples: list[dict] = field(default_factory=list)

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
# Reference-image merging — code-defined + user-uploaded
# ──────────────────────────────────────────────────────────────────────────

# Supabase Storage layout for user-uploaded references:
#   bucket: avatars
#   path:   niche_references/<slug>/<anything>.png
# We list that folder at render time and append each public URL to the
# niche's static `reference_image_sources` so users can drop extra
# references through the dashboard without touching the code.
_REFERENCES_STORAGE_PREFIX = "niche_references"
_REFERENCES_BUCKET = "avatars"


def _listing_to_public_url(slug: str, entry: dict) -> Optional[str]:
    """Convert one item from `supabase.storage.list(path)` into a public
    URL the pipeline can fetch. Returns None for Supabase's hidden
    `.emptyFolderPlaceholder` marker."""
    name = entry.get("name") or ""
    if not name or name == ".emptyFolderPlaceholder":
        return None
    from app.core.supabase import supabase
    path = f"{_REFERENCES_STORAGE_PREFIX}/{slug}/{name}"
    try:
        return supabase.storage.from_(_REFERENCES_BUCKET).get_public_url(path)
    except Exception:
        return None


def list_uploaded_reference_urls(slug: str) -> list[str]:
    """Return the public URLs of every user-uploaded reference image
    for this niche. Swallows Supabase hiccups and returns [] — a broken
    listing should never take down the pipeline."""
    try:
        from app.core.supabase import supabase
        res = (
            supabase.storage.from_(_REFERENCES_BUCKET)
            .list(f"{_REFERENCES_STORAGE_PREFIX}/{slug}")
        )
    except Exception as e:
        logger.warning(f"Could not list uploaded references for {slug}: {e}")
        return []

    urls: list[str] = []
    for entry in res or []:
        url = _listing_to_public_url(slug, entry)
        if url:
            urls.append(url)
    return urls


def effective_reference_sources(niche: Niche) -> list[str]:
    """Combine the niche's code-defined references (committed PNGs in
    `app/services/niche_assets/`) with anything the user has uploaded
    via the dashboard (Supabase Storage).

    Uploaded refs come AFTER the static ones so code-committed defaults
    take priority positionally (Gemini weighs earlier multimodal inputs
    more heavily), while user uploads supplement them."""
    sources = list(niche.reference_image_sources)
    sources.extend(list_uploaded_reference_urls(niche.slug))
    return sources


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

    # ── NARRATOR VOICE + STRUCTURE (refined from 9 real titles) ───────
    # Reverse-engineered from the channel's 9 most recent videos
    # (Apr 2026, extracted via Google SERP meta-tags because TikTok
    # blocks direct scraping). Two title formulas recur — this prompt
    # teaches the LLM to mimic them exactly.
    style_instructions=(
        "Write in the EXACT voice of the @humain.penseur TikTok channel "
        "(French pop-psychology introspection). REVERSE-ENGINEERED FROM 9 "
        "REAL RECENT TITLES. Observed patterns:\n"
        "\n"
        "TITLE/HOOK FORMAT — pick ONE of two templates, depending on the "
        "subject depth:\n"
        "\n"
        "  FORMULA A (long, question-based — used on the meatiest topics):\n"
        "    '[clinical concept in French] : Pourquoi [en psychologie]? "
        "certaines personnes/femmes [observed behaviour]… [twist that "
        "reveals a hidden emotional mechanism] ?'\n"
        "    Real examples:\n"
        "    - 'L\\'indifférence émotionnelle : Pourquoi en psychologie "
        "certaines femmes ont du mal à ressentir leurs émotions ?'\n"
        "    - 'La malédiction du savoir : Pourquoi en psychologie certaines "
        "personnes, malgré une grande intelligence émotionnelle, se sentent-"
        "elles plus seules… comme si voir trop clair dans les autres "
        "finissait par isoler ?'\n"
        "    - 'La dissonance cognitive comportementale : Pourquoi certaines "
        "personnes comprennent-elles parfaitement ce qui les détruit… mais "
        "n\\'arrivent toujours pas à s\\'en libérer.'\n"
        "    - 'L\\'évitement émotionnel : pourquoi certaines personnes "
        "rêvent-elles de tout quitter… non pas pour fuir les autres, mais "
        "pour enfin échapper à ce qu\\'elles ressentent ?'\n"
        "\n"
        "  FORMULA B (short, descriptive — used on single-concept explainers):\n"
        "    '[clinical concept] : [short descriptive subtitle]' OR just "
        "'[concept] et ses [effets/impacts]'\n"
        "    Real examples:\n"
        "    - 'Le TDAH et la psychologie : Comprendre les distractions'\n"
        "    - 'Le blues de l\\'anniversaire : Comprendre la tristesse'\n"
        "    - 'Le perfectionnisme inadapté et ses impacts'\n"
        "    - 'La procrastination nocturne en psychologie'\n"
        "\n"
        "SIGNATURE PHRASES used repeatedly in the real channel — use them "
        "when they fit:\n"
        "  - 'en psychologie'  (inserted as an authority marker inside the "
        "question — 'Pourquoi EN PSYCHOLOGIE certaines personnes…')\n"
        "  - 'certaines personnes' / 'certaines femmes'  (NEVER 'les gens' "
        "— the 'certaines' is deliberately in-group, invites identification)\n"
        "  - 'malgré [X], [Y]'  (paradox setup — 'malgré une grande "
        "intelligence émotionnelle, se sentent plus seules')\n"
        "  - '…'  (ellipsis before the twist is the SIGNATURE punctuation)\n"
        "  - 'comme si [metaphor]'  (post-twist expansion)\n"
        "  - 'non pas pour [X], mais pour [Y]'  (reframe pattern)\n"
        "\n"
        "REQUIRED STRUCTURE of the 30-60s narration:\n"
        "  HOOK (0-4s): One sentence. EXACTLY matches one of the two formulas "
        "above. No 'salut tout le monde', no intro, no throat-clearing — "
        "just the hook line spoken calm, deliberate.\n"
        "  DEVELOPMENT (4-45s): decode the concept in plain French through "
        "concrete micro-scenes the viewer recognises from their own life. "
        "Short declarative sentences. Deliberate pauses implied by full stops. "
        "When the title uses jargon, unpack it immediately with an everyday "
        "example.\n"
        "  REVEAL (45-55s): name the pattern + why it self-perpetuates.\n"
        "  LANDING (55-60s): a line that lets the viewer SEE themselves.\n"
        "\n"
        "ABSOLUTE RULES:\n"
        "  - The insight IS the payoff. Never end with advice, moral, "
        "or 'what to do about it'.\n"
        "  - NEVER: 'guys', 'les gars', 'les amis', 'abonne-toi', "
        "'commente', 'partage', 'fais-moi savoir', 'dis-le moi en "
        "commentaire'.\n"
        "  - Second-person address ('tu / vous') is rare and reserved for "
        "the very last sentence.\n"
        "  - No philosophical quotes (Camus, Sénèque, etc.) — this is POP "
        "PSYCHOLOGY. Clinical terms only.\n"
        "  - When the topic is about emotional patterns in women, say so "
        "explicitly ('certaines femmes') — the channel segments its audience."
    ),

    # ── TOPIC IDEATION (with explicit format + real examples) ─────────
    topic_generation_prompt=(
        "You are the editor of @humain.penseur, a successful French TikTok "
        "channel (~ adults 20-45, mostly women interested in self-"
        "understanding and emotional patterns). Your job: invent ONE fresh "
        "video title per suggestion, matching the channel's exact format.\n"
        "\n"
        "REAL RECENT TITLES from the channel (Apr 2026 — DO NOT REPEAT "
        "these concepts unless you find a genuinely new angle):\n"
        "  - L'indifférence émotionnelle : Pourquoi en psychologie certaines "
        "    femmes ont du mal à ressentir leurs émotions ?\n"
        "  - La malédiction du savoir : Pourquoi en psychologie certaines "
        "    personnes se sentent plus seules en voyant trop clair dans les "
        "    autres ?\n"
        "  - Le TDAH et la psychologie : Comprendre les distractions\n"
        "  - La procrastination nocturne en psychologie\n"
        "  - Le blues de l'anniversaire : Comprendre la tristesse\n"
        "  - Le perfectionnisme inadapté et ses impacts\n"
        "  - La dissonance cognitive comportementale : Pourquoi certaines "
        "    personnes comprennent ce qui les détruit mais n'arrivent pas à "
        "    s'en libérer ?\n"
        "  - L'évitement émotionnel : pourquoi certaines personnes rêvent de "
        "    tout quitter… non pas pour fuir les autres, mais pour échapper à "
        "    ce qu'elles ressentent ?\n"
        "\n"
        "FORMAT — pick one of these two, depending on topic depth:\n"
        "  A) LONG: '[clinical concept] : Pourquoi [en psychologie] certaines "
        "     personnes/femmes [behaviour]… [twist] ?'\n"
        "  B) SHORT: '[clinical concept] : Comprendre [consequence]' OR "
        "     '[concept] et ses impacts' OR '[concept] en psychologie'\n"
        "\n"
        "OPEN TOPIC SPACE (not yet covered on the channel — pick variety):\n"
        "  Attachment (anxieux / évitant / désorganisé), parentification, "
        "  hypervigilance, alexithymie, shame spirals, rumination mentale, "
        "  sabotage inconscient, syndrome de l'imposteur, dépression "
        "  souriante, hyperempathie, HPI/HPE, trauma responses, burn-out "
        "  invisible, people-pleasing chronique, peur de l'abandon, "
        "  ghosting émotionnel, intimacy anxiety, trauma bonds, relational "
        "  triangulation, self-gaslighting, compartmentalisation, gestalt "
        "  unfinished-business. Also masculine/feminine energy angles, "
        "  relationship patterns, modern-life tensions.\n"
        "\n"
        "REQUIREMENTS for each title:\n"
        "  1. French, in one of the two formats above.\n"
        "  2. Stops the scroll on the HOOK ALONE — no context needed.\n"
        "  3. Reveals a HIDDEN EMOTIONAL TRUTH (the 'twist' after the … "
        "     is where the paradox lives).\n"
        "  4. Uses a real clinical concept in the title, not a vague "
        "     theme.\n"
        "  5. No overlap with the real-title list above.\n"
        "  6. Diversify across topic domains (don't propose 6 attachment "
        "     titles in a row)."
    ),

    fallback_topics=[
        # Real titles from the channel (verified Apr 2026 via SERP).
        # We reuse the EXACT originals so 'Surprise-moi' in offline mode
        # still gives the user something that sounds like the channel.
        "L'indifférence émotionnelle : Pourquoi en psychologie certaines "
        "femmes ont du mal à ressentir leurs émotions ?",
        "La malédiction du savoir : Pourquoi en psychologie certaines "
        "personnes, malgré une grande intelligence émotionnelle, se "
        "sentent-elles plus seules… comme si voir trop clair dans les "
        "autres finissait par isoler ?",
        "La dissonance cognitive comportementale : Pourquoi certaines "
        "personnes comprennent-elles parfaitement ce qui les détruit… "
        "mais n'arrivent toujours pas à s'en libérer ?",
        "L'évitement émotionnel : pourquoi certaines personnes rêvent-"
        "elles de tout quitter… non pas pour fuir les autres, mais pour "
        "enfin échapper à ce qu'elles ressentent ?",
        "Le perfectionnisme inadapté et ses impacts",
        # Fresh extensions in the same format, covering adjacent spaces
        # the channel hasn't yet touched.
        "La parentification : Pourquoi en psychologie certains adultes "
        "prennent-ils soin de tout le monde… sauf d'eux-mêmes ?",
        "L'hyperempathie : Pourquoi certaines personnes absorbent-elles "
        "les émotions des autres… jusqu'à ne plus savoir ce qu'elles "
        "ressentent vraiment ?",
        "La dépression souriante : Pourquoi les personnes qui vont le "
        "moins bien sont-elles souvent celles qui paraissent les plus "
        "lumineuses ?",
        "Le people-pleasing chronique et ses impacts",
        "La rumination mentale : Pourquoi rejouons-nous mille fois des "
        "scènes qu'on ne peut plus changer ?",
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

    # Structured scene-by-scene analysis of ONE real @humain.penseur
    # video. Fed to the storyboard LLM as a few-shot example so every
    # new storyboard inherits the cadence + scene-level detail of the
    # real channel. Source: Gemini-extracted analysis the user shared
    # from a TikTok URL ("Un homme qui aime profondément sa copine…").
    reference_storyboard_examples=[
        {
            "topic": (
                "Un homme qui aime profondément sa copine pensera toujours "
                "qu'elle peut le tromper — l'anxiété d'attachement masculine"
            ),
            "scenes": [
                {
                    "start": 0, "end": 7,
                    "voiceover": (
                        "Un homme qui aime sa copine pensera toujours qu'elle "
                        "peut le tromper. Pourquoi ? Parce qu'il l'aime vraiment."
                    ),
                    "image_prompt": (
                        "A male and female 3D claymation figure lying on a "
                        "large grey couch. The man is holding the woman "
                        "tightly, looking pensive and slightly worried into "
                        "the camera. Slow zoom in."
                    ),
                    "motion_prompt": "Slow push-in on the man's worried face.",
                },
                {
                    "start": 7, "end": 15,
                    "voiceover": (
                        "Quand un homme aime profondément une femme, il prend "
                        "conscience de tout ce qu'il peut perdre."
                    ),
                    "image_prompt": (
                        "A male 3D figure standing alone in a dark, empty "
                        "room. He looks at a glowing white silhouette of the "
                        "woman that slowly fades away. Emotional atmosphere."
                    ),
                    "motion_prompt": "The female silhouette fades to nothing.",
                },
                {
                    "start": 15, "end": 22,
                    "voiceover": (
                        "En psychologie, on appelle ça l'anxiété d'attachement. "
                        "Plus l'attachement est fort, plus la peur de perdre "
                        "l'autre grandit."
                    ),
                    "image_prompt": (
                        "Two 3D claymation figures standing face to face. A "
                        "thick, dark blue smoke or energy flows between them, "
                        "connecting their chests. The man is trying to hold "
                        "onto the smoke."
                    ),
                    "motion_prompt": "The blue energy pulses and shifts.",
                },
                {
                    "start": 22, "end": 30,
                    "voiceover": (
                        "Les hommes savent aussi comment pensent les autres "
                        "hommes. Il en est un lui-même. Il connaît les "
                        "intentions et les approches."
                    ),
                    "image_prompt": (
                        "The male 3D figure standing in front of a group of "
                        "identical blurry male silhouettes in the background. "
                        "The man looks suspicious, scanning the surroundings."
                    ),
                    "motion_prompt": "Subtle camera pan across the silhouettes.",
                },
                {
                    "start": 30, "end": 37,
                    "voiceover": (
                        "Il sait que l'attention et la validation peuvent, "
                        "avec le temps, se transformer en tentation. Un homme "
                        "amoureux n'est pas naïf."
                    ),
                    "image_prompt": (
                        "A female 3D claymation figure standing under a "
                        "spotlight. Several grey 3D hands reach from the "
                        "shadows toward her, offering small glowing hearts. "
                        "The man watches from the dark."
                    ),
                    "motion_prompt": "Hands slowly emerge from shadow.",
                },
                {
                    "start": 37, "end": 45,
                    "voiceover": (
                        "Il observe les comportements, pas seulement les "
                        "paroles. Il sait que chacun a des faiblesses et des "
                        "moments de vulnérabilité."
                    ),
                    "image_prompt": (
                        "Split screen. Left: the woman's mouth moving. Right: "
                        "the man's eyes staring intensely, observing tiny "
                        "details. Minimalist and sharp."
                    ),
                    "motion_prompt": "Static split-screen, subtle blink.",
                },
                {
                    "start": 45, "end": 52,
                    "voiceover": (
                        "C'est pourquoi il pose des limites. Il met en place "
                        "des règles et des standards. Il protège ce qu'il a "
                        "construit."
                    ),
                    "image_prompt": (
                        "The male 3D figure building a tall wall with grey "
                        "bricks around the female figure. He looks protective "
                        "and determined. Cinematic wide shot."
                    ),
                    "motion_prompt": "He places one brick after another.",
                },
                {
                    "start": 52, "end": 60,
                    "voiceover": (
                        "À l'inverse, un homme qui ne tient pas à toi ne "
                        "posera rien. S'il est silencieux et distant, c'est "
                        "que te perdre ne lui coûterait rien."
                    ),
                    "image_prompt": (
                        "The male 3D figure sitting on a chair, back turned "
                        "to the woman who is crying in the background. He "
                        "looks cold and indifferent. Fade to black."
                    ),
                    "motion_prompt": "Slow fade to black.",
                },
            ],
        },
    ],

    # Full narration scripts from real @humain.penseur videos (user-
    # supplied Apr 2026 — extracted by Gemini from TikTok URLs and
    # shared in chat). Each script is 60 s of spoken narration; feeding
    # them to the script generator as few-shot examples lets the LLM
    # mimic the real channel's cadence, thesis structure, and landing
    # one-liners instead of producing generic pop-psych output.
    reference_script_examples=[
        {
            "topic": (
                "L'anxiété d'attachement masculine — pourquoi un homme qui "
                "aime profondément reste toujours un peu inquiet"
            ),
            "full_text": (
                "Un homme qui aime sa copine pensera toujours qu'elle peut "
                "le tromper. Quand un homme aime profondément une femme, il "
                "prend conscience de tout ce qu'il peut perdre. En "
                "psychologie, on appelle ça l'anxiété d'attachement. Plus "
                "l'attachement est fort, plus la peur de perdre l'autre "
                "peut apparaître. Les hommes savent aussi comment pensent "
                "les autres hommes. Il en est un lui-même. Il connaît les "
                "intentions, les approches, les dynamiques de séduction. "
                "Il sait que l'attention, la validation et la proximité "
                "peuvent, avec le temps, se transformer en tentation. Un "
                "homme amoureux ne vit pas dans un conte de fées. Il sait "
                "que personne n'est parfait, que chacun peut avoir des "
                "faiblesses, des moments de vulnérabilité. Alors il "
                "observe les comportements, pas seulement les paroles. "
                "Plus un homme s'investit émotionnellement, financièrement "
                "et personnellement, plus il protège ce qu'il a construit. "
                "Un homme qui t'aime pose des limites parce qu'il sait que "
                "la tromperie est possible. Il met en place des règles, "
                "des standards, des frontières. À l'inverse, un homme qui "
                "ne tient pas à toi ne posera rien. Il reste silencieux, "
                "distant, parce que te perdre ne lui coûterait rien. Un "
                "homme qui aime a quelque chose à perdre. Et quand quelque "
                "chose compte vraiment, on le protège."
            ),
        },
        {
            "topic": (
                "Le silence masculin comme signe de renoncement — quand un "
                "homme arrête de se disputer, il a commencé à partir"
            ),
            "full_text": (
                "Le jour où un homme arrête de se disputer avec toi, c'est "
                "le jour où il a commencé à te perdre. Beaucoup de femmes "
                "pensent que le silence d'un homme est un signe de paix, "
                "mais c'est souvent le signe d'un renoncement. S'il ne te "
                "fait plus de reproches, s'il ne cherche plus à t'expliquer "
                "ce qui le blesse, c'est qu'il a déjà commencé à se "
                "détacher émotionnellement. Un homme qui s'énerve ou qui "
                "exprime son mécontentement est un homme qui investit "
                "encore de l'énergie dans la relation. Il espère encore un "
                "changement. Le jour où il devient calme, poli mais "
                "distant, c'est qu'il a déjà fait son deuil dans sa tête. "
                "Le silence n'est pas l'absence de colère, c'est l'absence "
                "d'espoir. Une fois qu'un homme a atteint ce stade, il est "
                "presque impossible de le faire revenir. Il ne partira pas "
                "forcément tout de suite, il restera peut-être par "
                "habitude ou par devoir, mais son cœur est déjà ailleurs. "
                "Ne prends jamais son silence pour un acquis, car c'est le "
                "dernier avertissement avant le départ définitif."
            ),
        },
        {
            "topic": (
                "Le respect comme oxygène de l'homme — pourquoi un homme "
                "part vraiment (et ce n'est pas pour une autre femme)"
            ),
            "full_text": (
                "Un homme ne part jamais vraiment pour une autre femme. "
                "Il part parce qu'il ne se sent plus respecté, apprécié "
                "ou entendu. La vérité, c'est que la plupart des hommes "
                "peuvent supporter la pauvreté, le stress et les épreuves "
                "de la vie tant qu'ils ont une femme à leurs côtés qui "
                "croit en eux. Mais dès qu'ils sentent qu'ils sont devenus "
                "un fardeau ou qu'ils sont constamment rabaissés, ils "
                "commencent à construire un mur. Le respect est l'oxygène "
                "de l'homme. Sans lui, il s'étouffe émotionnellement. Il "
                "ne te dira pas « je souffre de ton manque de respect », "
                "il se contentera de s'éloigner, de s'investir davantage "
                "dans son travail ou dans ses passions pour combler le "
                "vide. Beaucoup de femmes réalisent l'importance de ce "
                "respect quand il est déjà trop tard. Un homme qui se sent "
                "respecté te donnera le monde. Un homme qui se sent "
                "méprisé te rendra ton monde et reprendra le sien. "
                "Protège le respect dans ton couple, car c'est la seule "
                "chose qui retient vraiment un homme sur le long terme."
            ),
        },
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
