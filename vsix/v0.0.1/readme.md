# Image Annotator v0.0.1

Package:

```text
image-annotator-0.0.1.vsix
```

Initial runnable VS Code image bbox annotation extension.

Highlights:
- Open a single image or an image folder from the Command Palette.
- Supports `jpg`, `jpeg`, `png`, `bmp`, and `webp`.
- Uses one VS Code `WebviewPanel` with an image and HTML Canvas overlay.
- Supports bbox create, select, move, resize, delete, undo, redo, and save.
- Saves annotations as JSON using original image pixel coordinates.
- Supports `annotation.yaml` labels with hotkeys.
- Works in VS Code Remote SSH through `vscode.workspace.fs` and webview-safe URIs.

Install this VSIX with VS Code `Extensions` -> `...` -> `Install from VSIX...`.
