import * as vscode from 'vscode';

export interface AnnotationSession {
  mode: 'single' | 'folder';
  images: vscode.Uri[];
  currentIndex: number;
}

export function createSingleImageSession(image: vscode.Uri): AnnotationSession {
  return {
    mode: 'single',
    images: [image],
    currentIndex: 0
  };
}

export function createFolderSession(images: vscode.Uri[]): AnnotationSession {
  return {
    mode: 'folder',
    images,
    currentIndex: 0
  };
}
