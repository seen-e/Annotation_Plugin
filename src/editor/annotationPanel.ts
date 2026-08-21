import * as vscode from 'vscode';
import { AnnotationStore } from '../annotation/annotationStore';
import { LabelStore } from '../annotation/labelStore';
import {
  ExtensionToWebviewMessage,
  ImageStatus,
  LabelDefinition,
  WebviewToExtensionMessage
} from '../annotation/types';
import { basename, dirname, readImageFolder } from '../utils/imageUtils';
import { AnnotationSession, createFolderSession, createSingleImageSession } from './annotationSession';

export class AnnotationPanel {
  public static currentPanel: AnnotationPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly annotationStore = new AnnotationStore();
  private readonly labelStore = new LabelStore();
  private session: AnnotationSession;
  private imageStatuses: ImageStatus[] = [];
  private labels: LabelDefinition[] = [];
  private lastDialogUri: vscode.Uri | undefined;

  public static async createOrShow(extensionUri: vscode.Uri, session: AnnotationSession): Promise<void> {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (AnnotationPanel.currentPanel) {
      AnnotationPanel.currentPanel.panel.reveal(column);
      await AnnotationPanel.currentPanel.updateSession(session);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'imageAnnotator',
      'Image Annotator',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: AnnotationPanel.getLocalResourceRoots(extensionUri, session)
      }
    );

    AnnotationPanel.currentPanel = new AnnotationPanel(panel, extensionUri, session);
    await AnnotationPanel.currentPanel.initialize();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    session: AnnotationSession
  ) {
    this.panel = panel;
    this.session = session;

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        void this.handleMessage(message);
      },
      undefined,
      this.disposables
    );
  }

  private async initialize(): Promise<void> {
    this.panel.webview.html = this.getHtml();
    await this.prepareSessionState();
    await this.sendSession();
    await this.loadImage(this.session.currentIndex);
  }

  private async updateSession(session: AnnotationSession): Promise<void> {
    this.session = session;
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: AnnotationPanel.getLocalResourceRoots(this.extensionUri, session)
    };
    await this.prepareSessionState();
    await this.sendSession();
    await this.loadImage(this.session.currentIndex);
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.prepareSessionState();
        await this.sendSession();
        await this.loadImage(this.session.currentIndex);
        return;
      case 'openImageDialog':
        await this.pickImage();
        return;
      case 'openFolderDialog':
        await this.pickFolder();
        return;
      case 'saveAnnotation':
        await this.saveAnnotation(message.imageIndex, message.annotationData);
        return;
      case 'requestImage':
        await this.loadImage(message.imageIndex);
        return;
      case 'saveAndLoadImage':
        if (await this.saveAnnotation(message.currentIndex, message.annotationData, false)) {
          await this.loadImage(message.targetIndex);
        }
        return;
      case 'saveAndOpenImageDialog':
        if (await this.saveAnnotation(message.currentIndex, message.annotationData, false)) {
          await this.pickImage();
        }
        return;
      case 'saveAndOpenFolderDialog':
        if (await this.saveAnnotation(message.currentIndex, message.annotationData, false)) {
          await this.pickFolder();
        }
        return;
      case 'updateLabels':
        await this.updateLabels(message.labels);
        return;
    }
  }

  private async sendSession(): Promise<void> {
    this.postMessage({
      type: 'loadSession',
      mode: this.session.mode,
      currentIndex: this.session.currentIndex,
      images: this.imageStatuses,
      labels: this.labels
    });
  }

  private async loadImage(imageIndex: number): Promise<void> {
    if (imageIndex < 0 || imageIndex >= this.session.images.length) {
      return;
    }

    this.session.currentIndex = imageIndex;
    const imageUri = this.session.images[imageIndex];
    const annotationData = await this.annotationStore.load(imageUri);
    this.updateStatusFromAnnotation(imageIndex, annotationData);

    // Remote files must be converted through asWebviewUri; the webview never sees raw file URIs.
    this.postMessage({
      type: 'loadImage',
      imageIndex,
      imageUri: this.panel.webview.asWebviewUri(imageUri).toString(),
      annotationData,
      labels: this.labels,
      imageStatuses: this.imageStatuses
    });
  }

  private async saveAnnotation(
    imageIndex: number,
    annotationData: Parameters<AnnotationStore['save']>[1],
    notify = true
  ): Promise<boolean> {
    if (imageIndex < 0 || imageIndex >= this.session.images.length) {
      return false;
    }

    try {
      await this.annotationStore.save(this.session.images[imageIndex], annotationData);
      this.updateStatusFromAnnotation(imageIndex, annotationData);
      if (notify) {
        this.postMessage({
          type: 'saveState',
          ok: true,
          message: `Saved ${basename(this.session.images[imageIndex])}`,
          imageStatuses: this.imageStatuses
        });
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postMessage({
        type: 'saveState',
        ok: false,
        message
      });
      void vscode.window.showErrorMessage(`Image Annotator save failed: ${message}`);
      return false;
    }
  }

  private async updateLabels(labels: Parameters<LabelStore['saveLabels']>[1]): Promise<void> {
    const datasetRoot = this.annotationStore.getDatasetRoot(this.session.images[this.session.currentIndex]);
    const normalized = labels
      .map((label) => ({
        name: label.name.trim(),
        hotkey: label.hotkey?.trim() || undefined
      }))
      .filter((label, index, all) => label.name.length > 0 && all.findIndex((item) => item.name === label.name) === index);

    if (normalized.length === 0) {
      this.postMessage({
        type: 'labelsUpdated',
        ok: false,
        message: 'At least one label is required.',
        labels: await this.getLabels()
      });
      return;
    }

    try {
      await this.labelStore.saveLabels(datasetRoot, normalized);
      this.labels = normalized;
      this.postMessage({
        type: 'labelsUpdated',
        ok: true,
        message: 'Labels saved',
        labels: normalized
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postMessage({
        type: 'labelsUpdated',
        ok: false,
        message,
        labels: await this.getLabels()
      });
    }
  }

  private async getLabels() {
    const datasetRoot = this.annotationStore.getDatasetRoot(this.session.images[this.session.currentIndex]);
    return this.labelStore.loadLabels(datasetRoot);
  }

  private async pickImage(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: this.getDialogDefaultUri(),
      filters: {
        Images: ['jpg', 'jpeg', 'png', 'bmp', 'webp']
      },
      title: 'Open Image'
    });

    if (!selected || selected.length === 0) {
      return;
    }

    this.lastDialogUri = dirname(selected[0]);
    await this.updateSession(createSingleImageSession(selected[0]));
  }

  private async pickFolder(): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: this.getDialogDefaultUri(),
      title: 'Open Image Folder'
    });

    if (!selected || selected.length === 0) {
      return;
    }

    const folder = selected[0];
    const images = await readImageFolder(folder);
    if (images.length === 0) {
      void vscode.window.showWarningMessage('No supported images found in the selected folder.');
      return;
    }

    this.lastDialogUri = folder;
    await this.updateSession(createFolderSession(images));
  }

  private getDialogDefaultUri(): vscode.Uri | undefined {
    return this.lastDialogUri ?? (this.session.images[0] ? dirname(this.session.images[this.session.currentIndex]) : undefined);
  }

  private async prepareSessionState(): Promise<void> {
    this.imageStatuses = this.session.images.map((image, imageIndex) => ({
      imageIndex,
      filename: basename(image),
      hasAnnotation: false,
      reviewed: false
    }));
    this.labels = await this.getLabels();
  }

  private updateStatusFromAnnotation(imageIndex: number, annotationData: Parameters<AnnotationStore['save']>[1]): void {
    const current = this.imageStatuses[imageIndex];
    if (!current) {
      return;
    }

    this.imageStatuses[imageIndex] = {
      ...current,
      hasAnnotation: annotationData.annotations.length > 0,
      reviewed: annotationData.reviewed
    };
  }

  private postMessage(message: ExtensionToWebviewMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));
    const canvasUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'canvas.js'));
    const annotatorUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'annotator.js'));
    const indexUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'index.js'));
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data: blob:`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link nonce="${nonce}" rel="stylesheet" href="${stylesUri}">
  <title>Image Annotator</title>
</head>
<body>
  <main class="app-shell">
    <header class="topbar">
      <h1>Image Annotator</h1>
      <div class="open-actions" aria-label="Open controls">
        <button id="openImageButton" type="button">Open Image</button>
        <button id="openFolderButton" type="button">Open Folder</button>
      </div>
      <div id="saveStatus" class="save-status">Ready</div>
    </header>
    <section class="workspace">
      <section class="stage-panel">
        <div id="stage" class="stage">
          <div id="imageStack" class="image-stack">
            <img id="image" alt="Selected image">
            <canvas id="overlay"></canvas>
            <div id="labelPopup" class="label-popup" hidden></div>
          </div>
        </div>
      </section>
      <aside class="sidebar">
        <section class="side-section images-section">
          <h2>Images</h2>
          <div id="imageList" class="image-list"></div>
        </section>
        <section class="side-section">
          <div class="side-nav-row">
            <button id="sidePrevButton" type="button" title="Save current annotations and open previous image">← Previous</button>
            <button id="sideNextButton" type="button" title="Save current annotations and open next image">Next →</button>
          </div>
          <h2>Labels</h2>
          <select id="labelSelect"></select>
          <div class="label-editor">
            <div class="label-add-row">
              <input id="newLabelInput" type="text" placeholder="label name" aria-label="New label name">
              <input id="newHotkeyInput" type="text" maxlength="1" placeholder="key" aria-label="New label hotkey">
              <button id="addLabelButton" type="button">Add</button>
            </div>
            <div id="labelManageList" class="label-manage-list"></div>
          </div>
        </section>
        <section class="side-section reviewed-row">
          <label><input id="reviewedInput" type="checkbox"> Reviewed</label>
        </section>
        <section class="side-section annotations-section">
          <h2>Annotations</h2>
          <div id="annotationList" class="annotation-list"></div>
        </section>
      </aside>
    </section>
    <footer class="footerbar">
      <button id="prevButton" type="button">A / ←</button>
      <span id="counter" class="counter">0 / 0</span>
      <button id="nextButton" type="button">→ / D</button>
      <span class="spacer"></span>
      <button id="fitButton" type="button">Fit</button>
      <button id="zoomOutButton" type="button">−</button>
      <button id="zoomInButton" type="button">+</button>
      <button id="saveButton" type="button">Save</button>
      <button id="deleteButton" type="button" class="danger">Delete</button>
    </footer>
  </main>
  <script nonce="${nonce}" src="${canvasUri}"></script>
  <script nonce="${nonce}" src="${annotatorUri}"></script>
  <script nonce="${nonce}" src="${indexUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    AnnotationPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private static getLocalResourceRoots(extensionUri: vscode.Uri, session: AnnotationSession): vscode.Uri[] {
    const roots = new Map<string, vscode.Uri>();
    const addRoot = (uri: vscode.Uri) => roots.set(uri.toString(), uri);
    addRoot(vscode.Uri.joinPath(extensionUri, 'media'));

    if (session.images.length > 0) {
      addRoot(dirname(session.images[0]));
    }

    for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
      addRoot(workspaceFolder.uri);
    }

    return [...roots.values()];
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
