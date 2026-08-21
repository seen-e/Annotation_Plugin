import * as vscode from 'vscode';
import { AnnotationPanel } from '../editor/annotationPanel';
import { createFolderSession } from '../editor/annotationSession';
import { readImageFolder } from '../utils/imageUtils';

export async function openFolder(extensionUri: vscode.Uri): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
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

  await AnnotationPanel.createOrShow(extensionUri, createFolderSession(images));
}
