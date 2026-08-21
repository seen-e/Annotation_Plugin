import * as vscode from 'vscode';
import { LabelDefinition } from './types';
import { fileExists, joinUri } from '../utils/imageUtils';

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

const defaultLabels: LabelDefinition[] = [
  { name: 'left_gripper', hotkey: '1' },
  { name: 'right_gripper', hotkey: '2' }
];

export class LabelStore {
  public async loadLabels(datasetRoot: vscode.Uri): Promise<LabelDefinition[]> {
    const configUri = joinUri(datasetRoot, 'annotation.yaml');
    if (!(await fileExists(configUri))) {
      return defaultLabels;
    }

    try {
      const labels = parseAnnotationYaml(decoder.decode(await vscode.workspace.fs.readFile(configUri)));
      return labels.length > 0 ? labels : defaultLabels;
    } catch {
      return defaultLabels;
    }
  }

  public async saveLabels(datasetRoot: vscode.Uri, labels: LabelDefinition[]): Promise<void> {
    const configUri = joinUri(datasetRoot, 'annotation.yaml');
    const yaml = [
      'labels:',
      ...labels.map((label) => {
        const lines = [`  - name: ${quoteYaml(label.name)}`];
        if (label.hotkey) {
          lines.push(`    hotkey: ${quoteYaml(label.hotkey)}`);
        }
        return lines.join('\n');
      })
    ].join('\n');
    await vscode.workspace.fs.writeFile(configUri, encoder.encode(`${yaml}\n`));
  }
}

function parseAnnotationYaml(text: string): LabelDefinition[] {
  const labels: LabelDefinition[] = [];
  let inLabels = false;
  let current: Partial<LabelDefinition> | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    if (line === 'labels:') {
      inLabels = true;
      continue;
    }

    if (!inLabels) {
      continue;
    }

    if (line.startsWith('- ')) {
      if (current?.name) {
        labels.push({ name: current.name, hotkey: current.hotkey });
      }
      current = {};
      parseKeyValue(line.slice(2), current);
      continue;
    }

    if (current) {
      parseKeyValue(line, current);
    }
  }

  if (current?.name) {
    labels.push({ name: current.name, hotkey: current.hotkey });
  }

  return labels;
}

function parseKeyValue(line: string, target: Partial<LabelDefinition>): void {
  const separator = line.indexOf(':');
  if (separator === -1) {
    return;
  }

  const key = line.slice(0, separator).trim();
  const value = unquote(line.slice(separator + 1).trim());
  if (key === 'name' && value.length > 0) {
    target.name = value;
  }
  if (key === 'hotkey' && value.length > 0) {
    target.hotkey = value;
  }
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
