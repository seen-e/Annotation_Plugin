import * as vscode from 'vscode';
import { openFolder } from './commands/openFolder';
import { openImage } from './commands/openImage';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('imageAnnotator.openImage', () => openImage(context.extensionUri)),
    vscode.commands.registerCommand('imageAnnotator.openFolder', () => openFolder(context.extensionUri))
  );
}

export function deactivate(): void {
  // No background resources are kept after the webview is disposed.
}
