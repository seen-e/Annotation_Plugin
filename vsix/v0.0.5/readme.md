# Image Annotator v0.0.5

Package:

```text
image-annotator-0.0.5.vsix
```

Avoids creating empty annotation files.

Changes from v0.0.4:
- Navigation skips saving when the current image has no bbox and `Reviewed` is unchecked.
- Empty JSON files are no longer created for untouched images.
- If an image previously had saved annotations and the user deletes all boxes, saving removes the old JSON file.

This keeps large annotation folders cleaner during quick review.
