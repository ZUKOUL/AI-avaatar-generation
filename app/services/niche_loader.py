"""
Loader for the curated App Store screenshot reference library.

Layout on disk:
    app/services/niche_assets/appstore/
        index.json
        <vertical>/<pack_slug>/
            icon.jpg
            screen_01.jpg ... screen_NN.jpg
            manifest.json

Two responsibilities:
  • Tell the strategist which packs exist for a given vertical (so it can
    draw inspiration from the right style profile)
  • Hand image bytes to the generator at call-time so we can pass 1-2
    references into Gemini 3 Pro Image to anchor palette + typography +
    layout to a vertical that actually converts on the App Store.
"""
from __future__ import annotations

import json
import logging
import random
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

ROOT = Path(__file__).parent / "niche_assets" / "appstore"


def _read_json(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def list_verticals() -> list[str]:
    """Available verticals (sorted) — those with at least one pack."""
    index = _read_json(ROOT / "index.json") or {}
    return sorted(index.keys())


def list_packs(vertical: Optional[str] = None) -> list[dict]:
    """Pack summaries. Filter to one vertical when provided."""
    index = _read_json(ROOT / "index.json") or {}
    if vertical:
        return list(index.get(vertical, []))
    return [p for packs in index.values() for p in packs]


def load_pack(vertical: str, slug: Optional[str] = None) -> Optional[dict]:
    """
    Load a single pack's manifest. When slug is None we pick the first
    pack of the vertical (deterministic — first added wins so the
    behaviour is reproducible).
    """
    packs = list_packs(vertical)
    if not packs:
        return None
    if slug:
        match = next((p for p in packs if p["slug"] == slug), None)
        if not match:
            return None
        target_slug = match["slug"]
    else:
        target_slug = packs[0]["slug"]

    manifest_path = ROOT / vertical / target_slug / "manifest.json"
    manifest = _read_json(manifest_path)
    if not manifest:
        logger.warning(f"manifest missing for {vertical}/{target_slug}")
        return None

    pack_dir = manifest_path.parent
    return {
        **manifest,
        "_dir": str(pack_dir),
        "icon_path": str(pack_dir / manifest["icon"]),
        "screen_paths": [str(pack_dir / s) for s in manifest.get("screens", [])],
    }


def pick_pack_for(
    vertical: Optional[str],
    description: Optional[str] = None,
    seed: Optional[int] = None,
) -> Optional[dict]:
    """
    Best-effort pack selection.

    Strategy:
      1. If `vertical` matches a folder, pick the first pack there.
      2. Otherwise scan every pack and score against `description` keywords
         (cheap heuristic — proper semantic match would need embeddings).
      3. Last resort: random pack from the whole library.

    Returns None when the library is empty.
    """
    if vertical:
        pack = load_pack(vertical)
        if pack:
            return pack

    all_packs = list_packs()
    if not all_packs:
        return None

    if description:
        desc_l = description.lower()
        scored: list[tuple[int, dict]] = []
        for summary in all_packs:
            score = 0
            for token in (summary["name"].lower().split() + summary["vertical"].split()):
                if len(token) > 3 and token in desc_l:
                    score += 1
            if score:
                scored.append((score, summary))
        if scored:
            scored.sort(key=lambda t: -t[0])
            best = scored[0][1]
            return load_pack(best["vertical"], best["slug"])

    rng = random.Random(seed)
    pick = rng.choice(all_packs)
    return load_pack(pick["vertical"], pick["slug"])


def read_reference_bytes(path: str, max_bytes: int = 4_500_000) -> Optional[bytes]:
    """
    Read a reference image from disk. Skips files > max_bytes (Gemini's
    inline-image limit is ~5 MB; some upscaled mockups in the lib are
    9 MB and would be rejected). Caller should resize before sending in
    that case — for now we just skip to avoid an API error.
    """
    try:
        data = Path(path).read_bytes()
    except FileNotFoundError:
        logger.warning(f"reference image not found: {path}")
        return None
    if len(data) > max_bytes:
        logger.info(f"reference image too large ({len(data)} bytes), skipping: {path}")
        return None
    return data


def style_profile_summary(pack: dict) -> str:
    """
    One-paragraph English summary of the pack's style profile, ready to
    drop into a prompt. Reads only the parts the strategist needs to
    decide visual direction.
    """
    sp = pack.get("style_profile", {})
    palette = pack.get("palette", [])
    palette_str = ", ".join(palette[:4]) if palette else "(no palette)"
    parts = [
        f"Pack: {pack.get('name', '?')} ({pack.get('vertical', '?')})",
        f"Palette: {palette_str}",
    ]
    for k in ("background", "accent_role", "typography", "layout",
              "mockup_treatment", "callouts", "mood"):
        v = sp.get(k)
        if v:
            parts.append(f"{k.replace('_', ' ').title()}: {v}")
    headlines = pack.get("headlines_observed") or []
    if headlines:
        parts.append("Sample headlines: " + " / ".join(f'"{h}"' for h in headlines[:3]))
    return " · ".join(parts)
