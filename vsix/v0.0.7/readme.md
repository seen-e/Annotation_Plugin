# Image Annotator v0.0.7

Package:

```text
image-annotator-0.0.7.vsix
```

Improves performance for folders with many images.

Changes from v0.0.6:
- Opening and switching images no longer scans every annotation JSON file.
- Image status is cached and only the current image status is updated after load/save.
- Next/Previous only loads the target image and its annotation file.
- The right-side image list reuses existing DOM buttons instead of rebuilding the full list every time.

This version is recommended for large image folders.
