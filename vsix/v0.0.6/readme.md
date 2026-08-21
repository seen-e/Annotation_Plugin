# Image Annotator v0.0.6

Package:

```text
image-annotator-0.0.6.vsix
```

Improves deletion behavior for continuous bbox editing.

Changes from v0.0.5:
- Deleting the selected bbox automatically selects the next bbox.
- If the deleted bbox was the last one, the previous bbox is selected.
- If no bboxes remain, selection is cleared.
- Undo/redo preserves the updated selected bbox state.
