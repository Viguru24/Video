import type { VideoItem } from '../../../types';

export interface MetadataKeyValue {
  key: string;
  value: string;
  category: string;
  source: string;
}

export interface EditableExifFields {
  title?: string;
  artist?: string;
  copyright?: string;
  description?: string;
  comment?: string;
  software?: string;
  date_time?: string;
}

export interface FileMetadataReport {
  path: string;
  file_size_bytes: number;
  file_name?: string;
  format_label: string;
  has_exif: boolean;
  has_comfyui: boolean;
  has_gps?: boolean;
  exif_entries: MetadataKeyValue[];
  comfyui_entries: MetadataKeyValue[];
  editable_exif: EditableExifFields;
}

export interface BatchMetadataResult {
  results: { original_path: string; output_path: string; success: boolean }[];
  success_count: number;
  fail_count: number;
  total_bytes_saved: number;
}

export interface MetadataStudioModalProps {
  targets: VideoItem[];
  allVideos: VideoItem[];
  onClose: () => void;
  onFilesUpdated: (
    results: { original_path: string; output_path: string; success: boolean }[],
    overwrite: boolean
  ) => void;
  addLog: (msg: string) => void;
}

export interface ExtractedComfySummary {
  nodeCount: number;
  models: string[];
  positivePrompts: string[];
  negativePrompts: string[];
  samplerInfo: string[];
}
