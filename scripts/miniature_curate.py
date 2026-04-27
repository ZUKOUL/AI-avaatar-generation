#!/usr/bin/env python3
"""
YouTube miniature template curation pipeline.

Turns the user's ~584 AI-generated faceless-character thumbnails sitting in
`~/Downloads/miniature templates/` into a curated, deduped, categorised
library at `app/services/niche_assets/miniatures/` that the Thumbsy
"Templates" sub-tab consumes.

Pipeline mirrors `scripts/bento_curate.py`:
  1. CONVERT — re-encode every PNG/JPG/WebP into a clean JPEG (q=88,
     max 1600px on the long edge). The user's pngs are JPEG payloads
     under a `.png` extension, this normalises them.
  2. FILTER — drop tiny / corrupt files.
  3. DEDUPE — perceptual ahash + hamming distance ≤ 4.
  4. CATEGORISE — Gemini 2.5 Flash assigns a YouTube-thumbnail-specific
     style bucket. Forced JSON enum + thinking_budget=0, same recipe
     that fixed the bento misclassification problem.
  5. ORGANISE — move JPEGs into
     `app/services/niche_assets/miniatures/<style>/<slug>.jpg` and
     write a top-level `index.json` the gallery UI reads.

Run from the project root:

    venv/bin/python3 scripts/miniature_curate.py \\
        --src "$HOME/Downloads/miniature templates" \\
        --max-categorise 600

Idempotent — re-runs skip files already in their destination bucket.
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

from dotenv import load_dotenv
from PIL import Image, UnidentifiedImageError

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
log = logging.getLogger("miniature_curate")


# ──────────────────────────────────────────────────────────────────────────────
# Style taxonomy — YouTube-thumbnail-specific. Picked to match the
# patterns top creators actually use: every working YouTube thumbnail
# falls into roughly one of these eight buckets, and 8 keeps the gallery
# UX tight (no analysis paralysis when the user picks a style anchor).
# ──────────────────────────────────────────────────────────────────────────────
STYLES = {
    "face_reaction":     "Single human (or character) face dominates with an expressive / shocked / exaggerated emotion. Usually a close-up filling 40-60% of the frame.",
    "dual_split":        "Two-panel composition — split / before-after / vs / left-vs-right comparison. Often a vertical line or contrast separates the halves.",
    "text_dominant":     "Bold oversized text or title is the primary visual element, taking up most of the frame. Background is supporting.",
    "mockup_focus":      "A product, device, screen, software UI, or branded object is the hero. Person (if any) is secondary.",
    "dark_dramatic":     "Dark / near-black background with a single strong light source or neon accent. High contrast, premium tech / mystery / cinematic feel.",
    "bright_colorful":   "Bright saturated colours, neon palette, candy / pop / playful energy. Multiple competing colours.",
    "tutorial_callout":  "Arrows, circles, hand-drawn highlights, numbered steps, red/yellow markers. Tutorial / how-to / educational visual language.",
    "mascot_3d":         "3D-rendered character, mascot, plastic / claymation / Pixar-style figure. Stylised non-photorealistic hero.",
}

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = Path.home() / "Downloads" / "miniature templates"
DEST = ROOT / "app" / "services" / "niche_assets" / "miniatures"

MAX_LONG_EDGE = 1600
JPEG_Q = 88
MIN_LONG_EDGE = 600   # YouTube thumbs natively render at 1280×720 but
                      # some upscaled / cropped sources are smaller; loosen
                      # the floor vs bento (which had 800).
MIN_BYTES = 8_000     # ditto — re-encoded JPEGs at 1280×714 land ~120KB
                      # but some compress further.


# ──────────────────────────────────────────────────────────────────────────────
# Step 1: convert + filter
# ──────────────────────────────────────────────────────────────────────────────
def convert_and_filter(src: Path, work: Path) -> list[Path]:
    """Re-encode everything to JPEG, drop small / corrupt files."""
    work.mkdir(parents=True, exist_ok=True)
    accepted: list[Path] = []
    rejected: Counter = Counter()

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
    # Stay 3.9-compatible (the venv ships with 3.9 — int.bit_count is 3.10+).
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
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        log.warning(
            "GEMINI_API_KEY missing — skipping categorisation, dumping all into 'uncategorised'."
        )
        return {p: "uncategorised" for p in paths[:cap]}

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    style_block = "\n".join(f"  - {k}: {v}" for k, v in STYLES.items())

    valid_labels = list(STYLES.keys()) + ["not_thumbnail"]
    prompt = (
        "You classify YouTube video thumbnails. The user's library is "
        "AI-generated thumbnails featuring a faceless or generic character "
        "(no specific face) so the thumbnail can be reused across creators.\n\n"
        "If this image is NOT a YouTube-style thumbnail (a logo on its own, "
        "a stock photo with no editorial layout, an empty mockup, etc.), "
        "label it `not_thumbnail`.\n\n"
        "Otherwise pick exactly ONE style bucket:\n\n"
        + style_block
        + "\n\nReturn JSON: {\"label\": \"<one of: "
        + ", ".join(valid_labels)
        + ">\"}"
    )

    valid_set = set(valid_labels)
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
                parsed = json.loads(raw)
                label = (parsed.get("label") or "").strip().lower()
            except Exception:
                pass
            out[p] = label if label in valid_set else "uncategorised"
        except Exception as e:
            log.warning(f"categorise {p.name}: {e}")
            out[p] = "uncategorised"
        if i % 25 == 0:
            log.info(
                f"categorise: {i}/{len(paths_capped)} ({Counter(out.values()).most_common(4)})"
            )
        time.sleep(0.05)

    log.info(f"categorise: distribution {dict(Counter(out.values()))}")
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Step 4: organise + write index.json
# ──────────────────────────────────────────────────────────────────────────────
def organise(buckets: dict[Path, str]) -> dict:
    DEST.mkdir(parents=True, exist_ok=True)
    index: dict[str, list[dict]] = {style: [] for style in STYLES}
    index["uncategorised"] = []
    dropped = 0

    for src, style in buckets.items():
        if style == "not_thumbnail":
            dropped += 1
            continue
        bucket_dir = DEST / style
        bucket_dir.mkdir(parents=True, exist_ok=True)
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

    log.info(f"organise: dropped {dropped} non-thumbnail images")

    index = {k: v for k, v in index.items() if v}

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
def main() -> None:
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--src",
        type=Path,
        default=DEFAULT_SRC,
        help="Folder with raw miniature template images",
    )
    ap.add_argument(
        "--max-categorise",
        type=int,
        default=600,
        help="Cap on Gemini Flash calls (cost guard).",
    )
    ap.add_argument(
        "--work",
        type=Path,
        default=ROOT / ".cache" / "miniatures-converted",
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
