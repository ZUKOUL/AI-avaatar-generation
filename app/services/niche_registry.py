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
# @humain.penseur — French pop-psychology introspection channel
# ──────────────────────────────────────────────────────────────────────────
#
# Reference analysis (from actual video titles observed 2025-2026):
#   • "La procrastination nocturne en psychologie"
#   • "Le TDAH et la psychologie : Comprendre les distractions"
#   • "La malédiction du savoir : Pourquoi en psychologie certaines
#      personnes, malgré une grande intelligence émotionnelle, se sentent-
#      elles plus seules… comme si voir trop clair dans les autres
#      finissait par isoler ?"
#   • "La dissonance cognitive comportementale : Pourquoi certaines
#      personnes comprennent-elles parfaitement ce qui les détruit… mais
#      n'arrivent toujours pas à s'en libérer."
#   • "L'évitement émotionnel : pourquoi certaines personnes rêvent-elles
#      de tout quitter… non pas pour fuir les autres, mais pour enfin
#      échapper à ce qu'elles ressentent ?"
#
# Identified pattern:
#   1. HEADLINE FORMAT — "[Clinical concept] : Pourquoi certaines personnes
#      [relatable behaviour]… [twist that reveals the hidden tension]?"
#   2. TOPIC SPACE — cognitive / behavioural psychology framed as
#      relatable life patterns (NOT classical philosophy quotations).
#      Dissonance, evitement, attachement, rumination, self-sabotage,
#      TDAH, intelligence émotionnelle, solitude du haut potentiel, etc.
#   3. VOCABULARY — uses real psychology terms but explains them through
#      concrete emotional experiences, not textbook definitions.
#   4. TONE — soft, non-judgmental, revelatory. The viewer should feel
#      "wow, I do that" rather than "I'm being lectured."
#   5. HOOK — the concept name is stated first, then a "Pourquoi certaines
#      personnes..." question dangles the twist for 2-3 seconds before
#      the payoff.
#   6. CLOSE — a line that lands the insight, often reframing the pattern
#      as something the viewer can finally name (not solve).
#   7. HASHTAG SET — #psychologie #santémentale #emotions
#
# Visual style is educated inference: cinematic introspective b-roll
# (silhouettes, windows at dusk, lone figures, abstract emotional imagery,
# no faces so viewers project themselves into the scenes).

_register(Niche(
    slug="humain_penseur",
    name="Humain Penseur",
    handle="@humain.penseur",
    description="Psychologie introspective — concepts cliniques en questions qui nous touchent",
    tagline="Psycho · Émotions · FR",

    language="fr",
    tone="introspective, soft-spoken, pattern-revealing, non-judgmental",

    default_duration_seconds=60,
    default_mode="slideshow",      # Ken Burns fits the contemplative pacing
    default_aspect_ratio="9:16",
    default_subtitle_style="karaoke",
    default_voice_enabled=True,
    default_voice_id=None,          # let the user pick their FR voice

    # Appended to every scene's image_prompt — this is what makes the
    # images visually belong to the same channel. The key is anonymity
    # (no identifiable faces, no branding) so viewers project themselves
    # into the scenes.
    visual_style=(
        "Cinematic 35mm film still, introspective mood, soft cold-to-warm "
        "gradient lighting (deep teal shadow + amber highlight), shallow "
        "depth of field, subtle film grain, muted desaturated palette. "
        "Favour: lone silhouettes seen from behind, hands on foggy window, "
        "empty bedroom at 3 AM lit only by a phone screen, crowded metro "
        "showing one isolated figure, feet hesitating at a doorway, reflections "
        "in rain-streaked glass, abstract shots of tangled yarn / broken "
        "mirrors / drifting smoke as metaphors for inner states, minimalist "
        "interiors with one figure dwarfed by empty space. STRICTLY NO "
        "identifiable faces, NO brand logos, NO on-image text — the viewer "
        "should feel this could be about them."
    ),

    # Injected into both script + storyboard LLM prompts. Defines the voice
    # of the narrator and the narrative arc we want.
    style_instructions=(
        "Write in the exact voice of the @humain.penseur TikTok channel — "
        "French pop-psychology introspection. REQUIRED STRUCTURE:\n"
        "  HOOK (0-4s): Clinical concept name + colon, then "
        "\"Pourquoi certaines personnes...?\" — a question that reveals an "
        "uncomfortable emotional truth about modern life.\n"
        "  DEVELOPMENT (4-45s): explain the psychological mechanism in "
        "plain French, through concrete micro-scenes the viewer recognises "
        "from their own life. Keep a soft, almost whispered rhythm — short "
        "declarative sentences, pauses implied by full stops.\n"
        "  REVEAL (45-55s): name the pattern and why it self-perpetuates.\n"
        "  LANDING (55-60s): a line that lets the viewer SEE themselves "
        "without fixing them. No CTA. No 'follow for more'. No moralising.\n"
        "\n"
        "RULES:\n"
        "- Use genuine psychology vocabulary (évitement, dissonance, "
        "hypervigilance, attachement, rumination, malédiction du savoir) "
        "but decode it immediately with an everyday example.\n"
        "- Never say 'guys', 'les gars', 'abonne-toi', 'commente', 'partage'.\n"
        "- Second-person address is rare and only at the end.\n"
        "- No classical philosophers (Camus, Sénèque, etc.) — this is pop "
        "psychology, not literature.\n"
        "- No false optimism or pep talk. The insight IS the payoff."
    ),

    # Fresh topic each generation — asks Gemini to think like @humain.penseur
    # editorial team and produce a title in the exact channel format.
    topic_generation_prompt=(
        "You are the editorial director of @humain.penseur, a successful "
        "French TikTok channel about pop psychology and emotional patterns "
        "(targets: adults 20-45, mostly women, struggling with modern "
        "anxiety, over-thinking, relationship patterns). Reference observed "
        "titles from the channel:\n"
        "  • 'La procrastination nocturne en psychologie'\n"
        "  • 'La malédiction du savoir : Pourquoi certaines personnes… se "
        "    sentent plus seules en voyant trop clair dans les autres ?'\n"
        "  • 'La dissonance cognitive comportementale : Pourquoi certaines "
        "    personnes comprennent ce qui les détruit mais n\\'arrivent pas "
        "    à s\\'en libérer ?'\n"
        "  • 'L\\'évitement émotionnel : pourquoi certaines personnes "
        "    rêvent de tout quitter… non pas pour fuir les autres, mais "
        "    pour enfin échapper à ce qu\\'elles ressentent ?'\n"
        "\n"
        "Invent fresh video titles that match this exact format:\n"
        "  '[clinical concept, French, maybe +qualifier] : Pourquoi "
        "certaines personnes [observed behaviour]… [twist revealing the "
        "hidden emotional mechanism] ?'\n"
        "\n"
        "Topic space (pick anywhere from here, do not repeat):\n"
        "- Cognitive biases (confirmation, projection, sunk cost, Dunning-"
        "Kruger), attachment patterns (anxieux, évitant, désorganisé), "
        "emotional regulation (alexithymie, flooding, dissociation), "
        "relational wounds (parentification, triangulation, idealisation / "
        "devalorisation), self-sabotage patterns, rumination, "
        "hypersensitivity + HPI / HPE, burnout, imposter syndrome, chronic "
        "people-pleasing, trauma responses, shame spirals.\n"
        "\n"
        "Titles must be in French and feel like they COULD be the next "
        "video posted on the real channel."
    ),

    fallback_topics=[
        "L'évitement émotionnel : pourquoi certaines personnes préfèrent-elles "
        "se perdre dans le travail plutôt que de ressentir ce qu'elles vivent ?",
        "La dissonance cognitive : pourquoi continuons-nous à faire "
        "exactement ce qui nous détruit, en sachant parfaitement que ça "
        "nous détruit ?",
        "L'attachement anxieux : pourquoi certaines personnes ont-elles "
        "besoin d'être rassurées toutes les heures… et se sentent pourtant "
        "plus vides à chaque fois qu'on les rassure ?",
        "La malédiction du savoir : pourquoi comprendre parfaitement les "
        "autres finit-il par nous isoler d'eux ?",
        "Le perfectionnisme comme protection : pourquoi certaines "
        "personnes visent-elles l'irréprochable pour cacher qu'elles se "
        "sentent profondément indignes ?",
        "La rumination mentale : pourquoi rejouons-nous mille fois des "
        "scènes qu'on ne peut plus changer ?",
        "L'hypervigilance émotionnelle : pourquoi certaines personnes "
        "lisent-elles les humeurs des autres avant leurs propres besoins ?",
        "La parentification : pourquoi certains adultes prennent-ils soin "
        "de tout le monde sauf d'eux-mêmes ?",
        "La dépression souriante : pourquoi les personnes qui vont le "
        "moins bien sont-elles souvent celles qui paraissent les plus "
        "lumineuses ?",
        "Le syndrome de l'imposteur : pourquoi plus on réussit, plus on "
        "se sent frauduleux ?",
    ],

    # Hashtags the real channel actually uses — surfaced to the user in
    # the UI so they can copy-paste a performant caption.
    recommended_hashtags=[
        "#psychologie", "#santémentale", "#emotions", "#introspection",
        "#developpementpersonnel", "#psycho", "#therapie",
    ],
    caption_template=(
        "{topic}\n\n"
        "#psychologie #santémentale #emotions #introspection "
        "#developpementpersonnel #psycho"
    ),

    card_gradient=(
        "linear-gradient(135deg, #0f1a2c 0%, #1a2940 40%, #2d3e5c 100%)"
    ),
    accent_color="#8bb4e0",
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
