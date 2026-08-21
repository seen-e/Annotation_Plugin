import * as vscode from 'vscode';

export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Annotation {
  id: string;
  label: string;
  bbox: BBox;
}

export interface AnnotationFile {
  image: string;
  width: number;
  height: number;
  reviewed: boolean;
  annotations: Annotation[];
}

export interface LabelDefinition {
  name: string;
  hotkey?: string;
}

export interface ImageStatus {
  imageIndex: number;
  filename: string;
  hasAnnotation: boolean;
  reviewed: boolean;
}

export interface LoadedImagePayload {
  type: 'loadImage';
  imageIndex: number;
  imageUri: string;
  annotationData: AnnotationFile;
  labels: LabelDefinition[];
  imageStatuses: ImageStatus[];
}

export interface SessionPayload {
  type: 'loadSession';
  mode: 'single' | 'folder';
  currentIndex: number;
  images: ImageStatus[];
  labels: LabelDefinition[];
}

export interface SaveStatePayload {
  type: 'saveState';
  ok: boolean;
  message: string;
  imageStatuses?: ImageStatus[];
}

export interface LabelsUpdatedPayload {
  type: 'labelsUpdated';
  ok: boolean;
  message: string;
  labels: LabelDefinition[];
}

export interface ErrorPayload {
  type: 'error';
  message: string;
}

export type ExtensionToWebviewMessage =
  | SessionPayload
  | LoadedImagePayload
  | SaveStatePayload
  | LabelsUpdatedPayload
  | ErrorPayload;

export interface ReadyMessage {
  type: 'ready';
}

export interface OpenImageDialogMessage {
  type: 'openImageDialog';
}

export interface OpenFolderDialogMessage {
  type: 'openFolderDialog';
}

export interface SaveAnnotationMessage {
  type: 'saveAnnotation';
  imageIndex: number;
  annotationData: AnnotationFile;
}

export interface RequestImageMessage {
  type: 'requestImage';
  imageIndex: number;
}

export interface SaveAndLoadImageMessage {
  type: 'saveAndLoadImage';
  currentIndex: number;
  targetIndex: number;
  annotationData: AnnotationFile;
}

export interface SaveAndOpenImageDialogMessage {
  type: 'saveAndOpenImageDialog';
  currentIndex: number;
  annotationData: AnnotationFile;
}

export interface SaveAndOpenFolderDialogMessage {
  type: 'saveAndOpenFolderDialog';
  currentIndex: number;
  annotationData: AnnotationFile;
}

export interface UpdateLabelsMessage {
  type: 'updateLabels';
  labels: LabelDefinition[];
}

export type WebviewToExtensionMessage =
  | ReadyMessage
  | OpenImageDialogMessage
  | OpenFolderDialogMessage
  | SaveAnnotationMessage
  | RequestImageMessage
  | SaveAndLoadImageMessage
  | SaveAndOpenImageDialogMessage
  | SaveAndOpenFolderDialogMessage
  | UpdateLabelsMessage;

export interface ImageFile {
  uri: vscode.Uri;
  filename: string;
}
