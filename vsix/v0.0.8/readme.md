# Image Annotator v0.0.8

Package:

```text
image-annotator-0.0.8.vsix
```

Adds in-panel open controls.

Changes from v0.0.7:
- Added top toolbar `Open Image`.
- Added top toolbar `Open Folder`.
- The current Image Annotator panel is reused when opening a new image or folder.
- File dialogs start from the most recent image/folder location when possible.
- If current annotations are dirty, the extension saves them before changing the opened image/folder.

This avoids returning to the Command Palette just to switch datasets.
