import * as path from 'path';
import * as vscode from 'vscode';
import { AnnotationFile, ImageStatus } from './types';
import { basename, basenameWithoutExt, dirname, directoryExists, fileExists, joinUri } from '../utils/imageUtils';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export class AnnotationStore {
  public async load(imageUri: vscode.Uri): Promise<AnnotationFile> {
    const annotationUri = await this.getAnnotationUri(imageUri, false);
    if (!(await fileExists(annotationUri))) {
      return this.createEmptyAnnotation(imageUri);
    }

    const raw = decoder.decode(await vscode.workspace.fs.readFile(annotationUri));
    const parsed = JSON.parse(raw) as Partial<AnnotationFile>;
    return {
      image: parsed.image ?? basename(imageUri),
      width: parsed.width ?? 0,
      height: parsed.height ?? 0,
      reviewed: parsed.reviewed ?? false,
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : []
    };
  }

  public async save(imageUri: vscode.Uri, annotation: AnnotationFile): Promise<void> {
    const annotationUri = await this.getAnnotationUri(imageUri, true);
    if (annotation.annotations.length === 0 && !annotation.reviewed) {
      if (await fileExists(annotationUri)) {
        await vscode.workspace.fs.delete(annotationUri, { useTrash: false });
      }
      return;
    }

    const normalized: AnnotationFile = {
      image: basename(imageUri),
      width: annotation.width,
      height: annotation.height,
      reviewed: annotation.reviewed,
      annotations: annotation.annotations
    };
    await vscode.workspace.fs.writeFile(
      annotationUri,
      encoder.encode(`${JSON.stringify(normalized, null, 2)}\n`)
    );
  }

  public async getStatuses(images: vscode.Uri[]): Promise<ImageStatus[]> {
    return Promise.all(
      images.map(async (imageUri, imageIndex): Promise<ImageStatus> => {
        const annotationUri = await this.getAnnotationUri(imageUri, false);
        if (!(await fileExists(annotationUri))) {
          return {
            imageIndex,
            filename: basename(imageUri),
            hasAnnotation: false,
            reviewed: false
          };
        }

        try {
          const data = JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(annotationUri))) as Partial<AnnotationFile>;
          return {
            imageIndex,
            filename: basename(imageUri),
            hasAnnotation: Array.isArray(data.annotations) && data.annotations.length > 0,
            reviewed: data.reviewed === true
          };
        } catch {
          return {
            imageIndex,
            filename: basename(imageUri),
            hasAnnotation: true,
            reviewed: false
          };
        }
      })
    );
  }

  public getDatasetRoot(imageUri: vscode.Uri): vscode.Uri {
    const imageDir = dirname(imageUri);
    if (path.posix.basename(imageDir.path).toLowerCase() === 'images') {
      return dirname(imageDir);
    }
    return imageDir;
  }

  private createEmptyAnnotation(imageUri: vscode.Uri): AnnotationFile {
    return {
      image: basename(imageUri),
      width: 0,
      height: 0,
      reviewed: false,
      annotations: []
    };
  }

  private async getAnnotationUri(imageUri: vscode.Uri, createDirectory: boolean): Promise<vscode.Uri> {
    const imageDir = dirname(imageUri);
    const imageStem = basenameWithoutExt(imageUri);

    if (path.posix.basename(imageDir.path).toLowerCase() === 'images') {
      const labelsDir = joinUri(dirname(imageDir), 'labels');
      if (createDirectory && !(await directoryExists(labelsDir))) {
        await vscode.workspace.fs.createDirectory(labelsDir);
      }
      return joinUri(labelsDir, `${imageStem}.json`);
    }

    return joinUri(imageDir, `${imageStem}.json`);
  }
}
