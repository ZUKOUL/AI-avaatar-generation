#!/usr/bin/env python3
"""
App Store screenshot template curation pipeline.

Sister of `scripts/miniature_curate.py` — turns a folder of raw App
Store screenshot inspirations sitting in
`~/Downloads/appscreen/App Store Screenshots/` into a curated, deduped,
categorised library at `app/services/niche_assets/appstore_inspo/`.

Why a separate library instead of folding into the existing
`appstore/` packs:
  • The existing `appstore/` library is structured per-PACK (multiple
    coordinated screens for one app) and used by the Smart Pack / Style
    Anchor pipeline.
  • This new library is FLAT — every image is its own template
    inspiration, and they're grouped by VISUAL STYLE so the user can
    pin a single screen as a stylistic anchor in the Direct (one-shot)
    flow.

Pipeline mirrors the bento / miniature ones:
  1. CONVERT — re-encode every PNG/JPG/WebP/GIF into a clean JPEG.
  2. FILTER — drop tiny / corrupt files.
  3. DEDUPE — perceptual ahash, hamming ≤ 4, keep the largest.
  4. CATEGORISE — Gemini 2.5 Flash with response_schema enum +
     thinking_budget=0 (the recipe that already worked for bento +
     miniatures). Drops `not_appstore_screenshot` images (logos,
     stock photos, full app dashboards, anything that isn't a
     portrait App Store / Play Store screen).
  5. ORGANISE — move JPEGs into
     `app/services/niche_assets/appstore_inspo/<style>/<slug>.jpg`
     and write a top-level `index.json`.

Run from the project root:

    venv/bin/python3 scripts/appstore_screenshots_curate.py \\
        --src "$HOME/Downloads/appscreen/App Store Screenshots" \\
        --max-categorise 500

Idempotent — re-runs skip files already in their bucket.
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
log = logging.getLogger("appstore_screenshots_curate")


# ──────────────────────────────────────────────────────────────────────────────
# Style taxonomy — picked from observation of high-converting App
# Store screenshot designs. 8 buckets, every working screen falls into
# roughly one of these.
# ──────────────────────────────────────────────────────────────────────────────
STYLES = {
    "headline_first":     "Big bold headline takes the top half, mockup or visual underneath. Most common pattern — Apple's own templates use this.",
    "phone_mockup":       "Phone device mockup is the dominant subject (tilted / angled / floating). Real UI visible inside.",
    "lifestyle_photo":    "Real-world photo background (person, hand, scene) with the app screen overlaid as a phone mockup.",
    "illustration_led":   "Custom 3D illustration, mascot, or painterly artwork is the hero. Phone mockup is small or absent.",
    "feature_callout":    "Annotated screenshot — arrows, circles, badges pointing to UI features. Tutorial energy.",
    "social_proof":       "Reviews, ratings, testimonials, awards, user count as the centerpiece. Quote-led layout.",
    "before_after":       "Split-screen comparison, before/after, with-without, two-column visual. Transformation framing.",
    "minimal_text":       "Pared-back: one short headline, one mockup, lots of whitespace. Premium / Apple feel.",
}

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = Path.home() / "Downloads" / "appscreen" / "App Store Screenshots"
DEST = ROOT / "app" / "services" / "niche_assets" / "appstore_inspo"

MAX_LONG_EDGE = 1600
JPEG_Q = 88
MIN_LONG_EDGE = 600
MIN_BYTES = 8_000


# ──────────────────────────────────────────────────────────────────────────────
# Step 1: convert + filter
# ──────────────────────────────────────────────────────────────────────────────
def convert_and_filter(src: Path, work: Path) -> list[Path]:
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
    return bin(a ^ b).count("1")


def dedupe(paths: list[Path], threshold: int = 4) -> list[Path]:
    items = [(p, ahash(p), p.stat().st_size) for p in paths]
    items.sort(key=lambda x: -x[2])
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
# Step 3: categorise via Gemini Flash (with strict drop bucket)
# ──────────────────────────────────────────────────────────────────────────────
def categorise(paths: list[Path], cap: int) -> dict[Path, str]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        log.warning("GEMINI_API_KEY missing — skipping categorisation.")
        return {p: "uncategorised" for p in paths[:cap]}

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    style_block = "\n".join(f"  - {k}: {v}" for k, v in STYLES.items())

    valid_labels = list(STYLES.keys()) + ["not_appstore_screenshot"]
    prompt = (
        "You classify App Store / Play Store screenshot templates. The "
        "user is curating a library of high-quality screenshot designs "
        "to use as STYLE ANCHORS when their AI generates new app "
        "screenshots.\n\n"
        "An App Store screenshot is a vertical (portrait, ~9:19.5) "
        "marketing image that shows a phone mockup, a headline, "
        "illustration, or some combination of these — it's what users "
        "see in the App Store / Play Store listing carousel.\n\n"
        "If this image is NOT an App Store-style screenshot — meaning "
        "it's a logo on its own, a brand mark, a stock photo with no "
        "UI, a full landscape app dashboard, a website screenshot, an "
        "avatar, a meme, anything that wouldn't fit as a vertical "
        "portrait mobile-store screen — label it `not_appstore_screenshot`.\n\n"
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
        if style == "not_appstore_screenshot":
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

    log.info(
        f"organise: dropped {dropped} non-app-store images "
        f"(logos, dashboards, photos, …)"
    )

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


def main() -> None:
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--src",
        type=Path,
        default=DEFAULT_SRC,
        help="Folder with raw App Store screenshot images",
    )
    ap.add_argument(
        "--max-categorise",
        type=int,
        default=500,
        help="Cap on Gemini Flash calls (cost guard).",
    )
    ap.add_argument(
        "--work",
        type=Path,
        default=ROOT / ".cache" / "appstore-inspo-converted",
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
