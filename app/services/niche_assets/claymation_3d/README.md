# Claymation 3D — niche reference images

The pipeline conditions **Gemini 3 Pro Image directly** on the PNG files in
this directory when it generates keyframes for the `claymation_3d` niche.
This is the single most effective lever for visual consistency — far
stronger than the `visual_style` text prompt alone.

## How to add / update the reference image

1. **Save the image locally** at this exact path:

   ```
   app/services/niche_assets/claymation_3d/ref_01.png
   ```

   The recommended source is a screenshot from a real @humain.penseur
   TikTok video showing the matte-white 3D character(s) clearly.

2. **Recommended format**:
   - PNG (JPG also works, rename to `.png` or update the niche registry)
   - 9:16 portrait crop (1080×1920 ideal, any size ≥ 512px works)
   - Characters clearly visible, cropped so the figure fills most of the
     frame
   - Background representative of the niche palette (dark grey / midnight
     blue)

3. **Commit + push**:

   ```bash
   git add app/services/niche_assets/claymation_3d/ref_01.png
   git commit -m "chore(niche): add claymation_3d reference image"
   git push origin main
   ```

4. The next AI-video generation using this niche will automatically
   pick the new reference up — no code change required.

## Adding more reference images

To improve consistency further (especially across different character
poses and environments), drop additional files:

```
app/services/niche_assets/claymation_3d/ref_02.png
app/services/niche_assets/claymation_3d/ref_03.png
```

Then update `reference_image_sources` in
`app/services/niche_registry.py` to include the extra paths. Gemini 3
Pro Image accepts multiple reference images per call.

## Fallback behaviour

If no reference file is found at the configured path, the pipeline
logs a warning and falls back to text-prompt-only conditioning. The
video still renders but visual drift (stone statues instead of clay
characters) is likely on philosophical topics.
