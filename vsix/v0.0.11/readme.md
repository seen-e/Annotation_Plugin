# Image Annotator v0.0.11

Package:

```text
image-annotator-0.0.11.vsix
```

Upgrades display-only image enhancement.

Changes from v0.0.10:
- Replaced simple CSS brightness/contrast with canvas pixel processing.
- Added linear brightness control: `I' = I + beta`.
- Added contrast control: `I' = alpha * I + beta`.
- Added Gamma correction. For dark images, gamma values below `1` usually look more natural.
- Added CLAHE local contrast enhancement for low-contrast edges.
- Kept `Reset View` to restore original display.

Notes:
- These controls only affect the displayed image in the webview.
- The original image files are not modified.
- Bbox coordinates remain original image pixel coordinates.
