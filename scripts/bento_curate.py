#!/usr/bin/env python3
"""
Bento template curation pipeline.

Turns ~1300 raw bento landing-page images sitting in
`~/Downloads/bento database/` into a curated, deduped, categorised
library at `app/services/niche_assets/bento/`.

What it does, in order:
  1. CONVERT — re-encode every PNG/JPG/WebP/GIF into a clean JPEG
     (q=88, max 1600px on the long edge). Fixes the "extension lying
     about content" issue we hit with the App Store dataset, and shrinks
     the on-disk footprint enough to commit the curated set.
  2. FILTER — drop images smaller than 800px on the long edge (mostly
     tiny thumbnails or icons) and drop files <12 KB after re-encode
     (placeholder / corrupt).
  3. DEDUPE — perceptual hash (8x8 average hash, plenty for "same shot
     scraped from two sources" cases). Hash collisions within a
     hamming distance of 4 are treated as duplicates; we keep the
     larger file.
  4. CATEGORISE — call Gemini 2.5 Flash on each survivor to assign it
     a style bucket from a fixed taxonomy. Capped at MAX_CATEGORISE so
     we don't spend the user's GEMINI_API_KEY budget without warning.
  5. ORGANISE — move the categorised JPEGs into
     `app/services/niche_assets/bento/<style>/<slug>.jpg` and write a
     top-level index.json the gallery UI will read.

Run it from the project root:

    venv/bin/python3 scripts/bento_curate.py \\
        --src "$HOME/Downloads/bento database" \\
        --max-categorise 250

Then visually review the output in `app/services/niche_assets/bento/`
and delete anything that landed in the wrong bucket. The script is
idempotent — re-running it skips files already in the destination.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from PIL import Image, UnidentifiedImageError

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
log = logging.getLogger("curate")

# ──────────────────────────────────────────────────────────────────────────────
# Style taxonomy. Keep this list TIGHT — 8 buckets max so users browsing
# the gallery don't suffer from choice overload, and each bucket has
# enough samples to feel meaningful.
# ──────────────────────────────────────────────────────────────────────────────
STYLES = {
    "minimal_light":   "Light, minimalist, lots of whitespace. Apple, Linear, Vercel feel.",
    "dark_tech":       "Dark / near-black background, premium tech feel. SaaS infrastructure pages.",
    "illustration":    "Heavy illustration or 3D-rendered character / object. Loom, Notion hero cards.",
    "dashboard_mockup":"Card built around a UI screenshot or data visualisation.",
    "split":           "Two-column split — text one side, visual other side.",
    "colorful_playful":"Bright accent colours, playful typography, illustrative mascots.",
    "editorial_text":  "Oversized typography is the entire visual. Pull-quote / magazine feel.",
    "collage":         "Multiple smaller elements arranged in a collage / scrapbook layout.",
}

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = Path.home() / "Downloads" / "bento database"
DEST = ROOT / "app" / "services" / "niche_assets" / "bento"

MAX_LONG_EDGE = 1600
JPEG_Q = 88
MIN_LONG_EDGE = 800
MIN_BYTES = 12_000


# ──────────────────────────────────────────────────────────────────────────────
# Step 1: convert + filter
# ──────────────────────────────────────────────────────────────────────────────
def convert_and_filter(src: Path, work: Path) -> list[Path]:
    """Re-encode everything to JPEG, drop small / corrupt files."""
    work.mkdir(parents=True, exist_ok=True)
    accepted: list[Path] = []
    rejected = Counter()

    for f in sorted(src.iterdir()):
        if f.is_dir():
            continue
        out = work / (f.stem + ".jpg")
        if out.exists():
            accepted.append(out)
            continue
        try:
            with Image.open(f) as im:
                im.load()
                if im.mode != "RGB":
                    im = im.convert("RGB")
                w, h = im.size
                long_edge = max(w, h)
                if long_edge < MIN_LONG_EDGE:
                    rejected["too_small"] += 1
                    continue
                if long_edge > MAX_LONG_EDGE:
                    scale = MAX_LONG_EDGE / long_edge
                    im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
                im.save(out, "JPEG", quality=JPEG_Q, optimize=True)
        except (UnidentifiedImageError, OSError) as e:
            rejected[f"unreadable:{type(e).__name__}"] += 1
            continue

        if out.stat().st_size < MIN_BYTES:
            out.unlink()
            rejected["too_few_bytes"] += 1
            continue
        accepted.append(out)

    log.info(f"convert: {len(accepted)} accepted, rejected={dict(rejected)}")
    return accepted


# ──────────────────────────────────────────────────────────────────────────────
# Step 2: dedupe via 8×8 average hash
# ──────────────────────────────────────────────────────────────────────────────
def ahash(path: Path, side: int = 8) -> int:
    """Tiny implementation of average hash. 64-bit int, hamming distance friendly."""
    with Image.open(path) as im:
        im = im.convert("L").resize((side, side), Image.LANCZOS)
        pixels = list(im.getdata())
    avg = sum(pixels) / len(pixels)
    bits = 0
    for i, p in enumerate(pixels):
        if p >= avg:
            bits |= 1 << i
    return bits


def hamming(a: int, b: int) -> int:
    # int.bit_count() is Python 3.10+. Stay 3.9-compatible because the
    # project's venv is still on 3.9 (`int.bit_count` would crash there).
    return bin(a ^ b).count("1")


def dedupe(paths: list[Path], threshold: int = 4) -> list[Path]:
    """Keep one survivor per cluster of perceptual-hash near-duplicates.
    The survivor is the largest file (proxy for highest fidelity)."""
    items = [(p, ahash(p), p.stat().st_size) for p in paths]
    items.sort(key=lambda x: -x[2])  # largest first
    kept: list[tuple[Path, int]] = []
    dropped = 0
    for path, h, _size in items:
        if any(hamming(h, kh) <= threshold for _, kh in kept):
            dropped += 1
            continue
        kept.append((path, h))
    log.info(f"dedupe: kept {len(kept)}, dropped {dropped} near-duplicates")
    return [p for p, _ in kept]


# ──────────────────────────────────────────────────────────────────────────────
# Step 3: categorise via Gemini Flash
# ──────────────────────────────────────────────────────────────────────────────
def categorise(paths: list[Path], cap: int) -> dict[Path, str]:
    """Ask Gemini Flash to pick a style bucket for each image, capped."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        log.warning("GEMINI_API_KEY missing — skipping categorisation, dumping all into 'uncategorised'.")
        return {p: "uncategorised" for p in paths[:cap]}

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    style_block = "\n".join(f"  - {k}: {v}" for k, v in STYLES.items())
    # Force structured JSON output. Gemini Flash ignores "reply with just
    # the key, no explanation" instructions in plain-text mode (returns
    # "This is a minimal_light style." instead of "minimal_light"), which
    # blew up our parser and dumped 80% of the dataset into "uncategorised"
    # on the first run. JSON mode + strict schema fixes it cleanly.
    #
    # Strict reject prompt v2 — the v1 was too permissive: full landing
    # pages, scrapbook-Pinterest mosaics, posters, memes and stock photos
    # all leaked into `dashboard_mockup` and `collage`. Same "REJECT
    # when in doubt" pattern that fixed the appstore_inspo curation.
    valid_labels = list(STYLES.keys()) + ["not_bento"]
    prompt = (
        "You filter and classify bento landing-page cards for a curated "
        "design reference library. A bento card is ONE rounded, self-"
        "contained card cell from a modern SaaS landing page: a single "
        "feature cell with typography + a visual element (icon, mockup, "
        "illustration, chart or numerical stat) inside a single bordered "
        "/ filled rectangle. Think Apple, Linear, Vercel, Loom, Notion, "
        "Stripe feature grids — ONE card from such a grid, not the grid "
        "itself.\n\n"
        "REJECT (label `not_bento`) when the image is ANY of:\n"
        "- A full landing page or hero section (nav bar visible, multiple "
        "  feature blocks, footer)\n"
        "- A grid / mosaic / scrapbook of multiple cards stitched together "
        "  (Pinterest-style moodboard) — we want ONE card, not a collection\n"
        "- A logo, wordmark, app icon, favicon or pure brand identity asset\n"
        "- A photo of a person, product, or physical object with no card "
        "  framing (lifestyle photo, product shot, headshot)\n"
        "- A meme, tweet screenshot, Instagram square post, social media "
        "  card, or any platform-native UI capture\n"
        "- A full app or admin dashboard screenshot taken outside a card "
        "  (the `dashboard_mockup` bucket only fits dashboards EMBEDDED "
        "  in a clearly framed bento card on a marketing page)\n"
        "- A poster, flyer, slide deck slide, magazine page, book cover, "
        "  or print-design layout\n"
        "- A pure quote / testimonial graphic with no surrounding card\n"
        "- A stock photo, abstract gradient, wallpaper, texture or pattern\n"
        "- An avatar, profile picture, or character portrait\n"
        "- A 3D character / mascot rendered against a plain background "
        "  with no card structure (illustrations get the `illustration` "
        "  bucket only when wrapped in a clear card frame)\n"
        "- Any visual that wouldn't make sense as ONE feature cell on a "
        "  SaaS landing page's bento grid\n\n"
        "When in doubt — REJECT. We optimise for purity, not coverage.\n\n"
        "If it IS a single bento card, pick exactly ONE style bucket:\n\n"
        + style_block
        + "\n\nReturn JSON: {\"label\": \"<one of: "
        + ", ".join(valid_labels)
        + ">\"}"
    )

    import json as _json

    valid_labels = list(STYLES.keys()) + ["not_bento"]
    valid_set = set(valid_labels)
    # Forced enum schema — combined with thinking_budget=0 this gives us
    # back clean JSON like {"label":"dashboard_mockup"} every time. Without
    # thinking_budget=0 Gemini 2.5 Flash burns the entire output token
    # budget on internal reasoning tokens and we get an empty .text back.
    schema = {
        "type": "OBJECT",
        "properties": {
            "label": {"type": "STRING", "enum": valid_labels},
        },
        "required": ["label"],
    }

    out: dict[Path, str] = {}
    paths_capped = paths[:cap]
    for i, p in enumerate(paths_capped, 1):
        try:
            data = p.read_bytes()
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=data, mime_type="image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    temperature=0.0,
                    max_output_tokens=40,
                    response_mime_type="application/json",
                    response_schema=schema,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
            raw = (getattr(resp, "text", "") or "").strip()
            label = ""
            try:
                parsed = _json.loads(raw)
                label = (parsed.get("label") or "").strip().lower()
            except Exception:
                pass
            out[p] = label if label in valid_set else "uncategorised"
        except Exception as e:
            log.warning(f"categorise {p.name}: {e}")
            out[p] = "uncategorised"
        if i % 25 == 0:
            log.info(f"categorise: {i}/{len(paths_capped)} ({Counter(out.values()).most_common(4)})")
        # Light rate-limit cushion so we don't hammer the API.
        time.sleep(0.05)

    log.info(f"categorise: distribution {dict(Counter(out.values()))}")
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Step 4: organise + write index.json
# ──────────────────────────────────────────────────────────────────────────────
def organise(buckets: dict[Path, str]) -> dict:
    DEST.mkdir(parents=True, exist_ok=True)

    # Idempotent re-runs: wipe every bucket subdir before re-populating,
    # so images that flipped to `not_bento` on a stricter prompt get
    # purged from the library instead of lingering. We keep DEST itself
    # (and any non-bucket sibling files like a future README) — only
    # remove subdirs that match a known style key plus `uncategorised`.
    purge_keys = set(STYLES.keys()) | {"uncategorised"}
    for child in DEST.iterdir():
        if child.is_dir() and child.name in purge_keys:
            shutil.rmtree(child)

    index: dict[str, list[dict]] = {style: [] for style in STYLES}
    index["uncategorised"] = []
    dropped = 0

    for src, style in buckets.items():
        # Drop everything Gemini Flash flagged as not_bento (logos, photos,
        # full-app screenshots, anything that wouldn't fit as a feature cell
        # on a landing page). User asked for this filter explicitly.
        if style == "not_bento":
            dropped += 1
            continue
        bucket_dir = DEST / style
        bucket_dir.mkdir(parents=True, exist_ok=True)
        # Stable slug from the original filename so re-runs are idempotent.
        slug = src.stem
        out_path = bucket_dir / f"{slug}.jpg"
        if not out_path.exists():
            shutil.copy2(src, out_path)
        rel = f"{style}/{slug}.jpg"
        index[style].append({
            "slug": slug,
            "path": rel,
            "bytes": out_path.stat().st_size,
        })

    log.info(f"organise: dropped {dropped} non-bento images (logos, full screenshots, photos, ...)")

    # Drop empty buckets to keep index.json tidy.
    index = {k: v for k, v in index.items() if v}

    # Per-bucket: order largest first (proxy for most detailed / highest
    # fidelity), so the gallery shows the "best" first.
    for items in index.values():
        items.sort(key=lambda d: -d["bytes"])

    out_path = DEST / "index.json"
    summary = {
        "version": 1,
        "styles": {k: STYLES.get(k, "Uncategorised") for k in index},
        "counts": {k: len(v) for k, v in index.items()},
        "total": sum(len(v) for v in index.values()),
        "buckets": index,
    }
    out_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    log.info(f"organise: wrote {out_path}, {summary['total']} files across {len(index)} buckets")
    return summary


# ──────────────────────────────────────────────────────────────────────────────
# Driver
# ──────────────────────────────────────────────────────────────────────────────
def main():
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC, help="Folder with raw bento images")
    ap.add_argument(
        "--max-categorise",
        type=int,
        default=1500,
        help="Cap on Gemini Flash calls (cost guard). Survivors past the cap are skipped.",
    )
    ap.add_argument(
        "--work",
        type=Path,
        default=ROOT / ".cache" / "bento-converted",
        help="Working folder for the JPEG re-encode step.",
    )
    args = ap.parse_args()

    if not args.src.exists():
        log.error(f"src folder not found: {args.src}")
        sys.exit(1)

    log.info(f"src={args.src} dest={DEST} max-categorise={args.max_categorise}")

    converted = convert_and_filter(args.src, args.work)
    if not converted:
        log.error("nothing survived conversion — aborting")
        sys.exit(1)
    deduped = dedupe(converted)
    buckets = categorise(deduped, cap=args.max_categorise)
    summary = organise(buckets)

    log.info("=== summary ===")
    for style, count in summary["counts"].items():
        log.info(f"  {style:24s} {count}")
    log.info(f"total: {summary['total']}")
    log.info(f"index: {DEST / 'index.json'}")


if __name__ == "__main__":
    main()
