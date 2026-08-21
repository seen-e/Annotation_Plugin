import * as vscode from 'vscode';
import { AnnotationPanel } from '../editor/annotationPanel';
import { createSingleImageSession } from '../editor/annotationSession';

export async function openImage(extensionUri: vscode.Uri): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      Images: ['jpg', 'jpeg', 'png', 'bmp', 'webp']
    },
    title: 'Open Image'
  });

  if (!selected || selected.length === 0) {
    return;
  }

  await AnnotationPanel.createOrShow(extensionUri, createSingleImageSession(selected[0]));
}
