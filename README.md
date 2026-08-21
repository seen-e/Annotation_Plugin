# Image Annotator

Image Annotator is a VS Code extension for bbox annotation directly inside the editor area. It uses a WebviewPanel with an HTML Canvas overlay and works with VS Code Remote SSH because all dataset file access goes through `vscode.workspace.fs`.

## Install Dependencies

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Debug in VS Code

Press `F5` from this extension workspace.

## Usage

Open the Command Palette and run:

- `Image Annotator: Open Image`
- `Image Annotator: Open Image Folder`

Supported image formats: `jpg`, `jpeg`, `png`, `bmp`, `webp`.

After the panel is open, use the top `Open Image` / `Open Folder` buttons to update the current image or directory without reopening the command palette.

Draw a bbox by dragging on the image; after mouse release, choose a label from the popup list.

Labels can be added or deleted from the Labels panel. Changes are saved to `annotation.yaml` in the dataset root.

Use the right-side `← Previous` / `Next →` buttons, the bottom navigation buttons, `A` / `D`, or `ArrowLeft` / `ArrowRight` to save the current annotation and move between images.

Images with no bbox and unchecked `Reviewed` are skipped during navigation, so empty JSON files are not created.

Use the View controls for display-only image enhancement: linear brightness `I' = I + beta`, contrast `I' = alpha * I + beta`, Gamma correction, and CLAHE local contrast enhancement. These filters do not modify the source image or annotation coordinates.

When a selected bbox is deleted, the next bbox is selected automatically; deleting the last bbox selects the previous one.

Large folders are handled with cached image status updates, so navigation only loads the target image and its annotation file.

## Labels

If the dataset root contains `annotation.yaml`, labels are loaded from it:

```yaml
labels:
  - name: left
  - name: right
```

If no config exists, the default labels are `left` and `right` without hotkeys.

## Annotation Files

When images are inside an `images` directory, annotations are saved to the sibling `labels` directory:

```text
dataset/
  images/
    000001.jpg
  labels/
    000001.json
```

If that layout cannot be inferred, annotations fall back to same-directory JSON files.

## Remote SSH

The extension does not use local absolute file paths, external HTTP servers, or port forwarding. Images are converted with `webview.asWebviewUri(...)`, and JSON files are read and written through the VS Code workspace file system API.
