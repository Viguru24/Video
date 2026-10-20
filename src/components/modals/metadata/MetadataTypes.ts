import type { VideoItem } from '../../../types';
import { toRealPath } from '../../../utils/videoUtils';

export interface MetadataKeyValue {
  key: string;
  value: string;
  source: string;
}

export interface EditableExifFields {
  title: string;
  artist: string;
  copyright: string;
  description: string;
  comment: string;
  software: string;
  date_time: string;
}

export interface FileMetadataReport {
  path: string;
  file_name: string;
  format: string;
  file_size_bytes: number;
  has_comfyui: boolean;
  has_exif: boolean;
  has_gps: boolean;
  comfyui_entries: MetadataKeyValue[];
  exif_entries: MetadataKeyValue[];
  editable_exif: EditableExifFields;
  summary_badge: string;
}

export interface SingleFileMetadataResult {
  original_path: string;
  output_path: string;
  success: boolean;
  error: string | null;
  bytes_before: number;
  bytes_after: number;
}

export interface BatchMetadataResult {
  results: SingleFileMetadataResult[];
  success_count: number;
  fail_count: number;
  total_bytes_saved: number;
}

export interface MetadataStudioModalProps {
  targets: VideoItem[];
  allVideos: VideoItem[];
  onClose: () => void;
  onFilesUpdated: (results: SingleFileMetadataResult[], overwrite: boolean) => void;
  addLog: (msg: string) => void;
}

export interface ExtractedComfySummary {
  models: string[];
  positivePrompts: string[];
  negativePrompts: string[];
  samplerInfo: string[];
  nodeCount: number;
}

export function extractComfyUiSummary(entries: MetadataKeyValue[]): ExtractedComfySummary | null {
  const promptEntry = entries.find((e) => e.key.toLowerCase() === 'prompt');
  const workflowEntry = entries.find((e) => e.key.toLowerCase() === 'workflow');
  if (!promptEntry && !workflowEntry) return null;

  const models = new Set<string>();
  const positivePrompts = new Set<string>();
  const negativePrompts = new Set<string>();
  const samplerInfo: string[] = [];
  let nodeCount = 0;

  if (promptEntry) {
    try {
      const parsed = JSON.parse(promptEntry.value);
      if (parsed && typeof parsed === 'object') {
        const nodes = Object.values(parsed) as any[];
        nodeCount = nodes.length;

        const posIds = new Set<string>();
        const negIds = new Set<string>();

        for (const node of nodes) {
          const inputs = node?.inputs || {};
          if (Array.isArray(inputs.positive) && inputs.positive[0] !== undefined) {
            posIds.add(String(inputs.positive[0]));
          }
          if (Array.isArray(inputs.negative) && inputs.negative[0] !== undefined) {
            negIds.add(String(inputs.negative[0]));
          }

          for (const [k, v] of Object.entries(inputs)) {
            if (
              typeof v === 'string' &&
              (k.includes('ckpt_name') ||
                k.includes('unet_name') ||
                k.includes('lora_name') ||
                k.includes('model_name') ||
                k.includes('vae_name'))
            ) {
              models.add(v);
            }
          }

          const classType = String(node?.class_type || '');
          if (classType.toLowerCase().includes('sampler')) {
            const parts: string[] = [];
            if (inputs.seed !== undefined && typeof inputs.seed !== 'object') parts.push(`Seed: ${inputs.seed}`);
            if (inputs.steps !== undefined && typeof inputs.steps !== 'object') parts.push(`Steps: ${inputs.steps}`);
            if (inputs.cfg !== undefined && typeof inputs.cfg !== 'object') parts.push(`CFG: ${inputs.cfg}`);
            if (inputs.sampler_name) parts.push(`Sampler: ${inputs.sampler_name}`);
            if (inputs.scheduler) parts.push(`Scheduler: ${inputs.scheduler}`);
            if (parts.length > 0) {
              samplerInfo.push(parts.join(' • '));
            }
          }
        }

        for (const [id, node] of Object.entries(parsed) as [string, any][]) {
          const inputs = node?.inputs || {};
          const textVal =
            typeof inputs.text === 'string'
              ? inputs.text.trim()
              : typeof inputs.prompt === 'string'
              ? inputs.prompt.trim()
              : '';
          if (textVal && textVal.length > 1) {
            if (negIds.has(id)) {
              negativePrompts.add(textVal);
            } else if (posIds.has(id) || String(node?.class_type || '').includes('TextEncode')) {
              positivePrompts.add(textVal);
            }
          }
        }
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  if (nodeCount === 0 && workflowEntry) {
    try {
      const parsed = JSON.parse(workflowEntry.value);
      if (Array.isArray(parsed?.nodes)) {
        nodeCount = parsed.nodes.length;
      }
    } catch {
      // Ignore
    }
  }

  if (
    models.size === 0 &&
    positivePrompts.size === 0 &&
    negativePrompts.size === 0 &&
    samplerInfo.length === 0 &&
    nodeCount === 0
  ) {
    return null;
  }

  return {
    models: Array.from(models),
    positivePrompts: Array.from(positivePrompts),
    negativePrompts: Array.from(negativePrompts),
    samplerInfo,
    nodeCount,
  };
}

export function resolveItemRealPath(v: VideoItem): string {
  const raw =
    v.folderFiles && v.currentIdx !== undefined
      ? v.folderFiles[v.currentIdx]?.path || v.folderFiles[v.currentIdx]?.url
      : v.realPath || v.url;
  return toRealPath(raw || '') || raw || '';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
