import * as path from 'path';
import * as vscode from 'vscode';

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp']);

const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
});

export function isSupportedImage(uri: vscode.Uri): boolean {
  return imageExtensions.has(path.posix.extname(uri.path).toLowerCase());
}

export function basename(uri: vscode.Uri): string {
  return path.posix.basename(uri.path);
}

export function basenameWithoutExt(uri: vscode.Uri): string {
  return path.posix.basename(uri.path, path.posix.extname(uri.path));
}

export function dirname(uri: vscode.Uri): vscode.Uri {
  return uri.with({ path: path.posix.dirname(uri.path) });
}

export function joinUri(base: vscode.Uri, ...segments: string[]): vscode.Uri {
  return vscode.Uri.joinPath(base, ...segments);
}

export function naturalCompare(a: string, b: string): number {
  return naturalCollator.compare(a, b);
}

export async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export async function directoryExists(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.type === vscode.FileType.Directory;
  } catch {
    return false;
  }
}

export async function readImageFolder(folder: vscode.Uri): Promise<vscode.Uri[]> {
  const entries = await vscode.workspace.fs.readDirectory(folder);
  return entries
    .filter(([, fileType]) => fileType === vscode.FileType.File)
    .map(([name]) => joinUri(folder, name))
    .filter(isSupportedImage)
    .sort((a, b) => naturalCompare(a.path, b.path));
}
