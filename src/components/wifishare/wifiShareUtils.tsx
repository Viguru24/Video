import React from 'react';
import { Film, Image as ImageIcon, FileText } from 'lucide-react';

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getMediaIcon(filename: string, mime?: string) {
  const lower = ((filename || '') + ' ' + (mime || '')).toLowerCase();
  if (lower.includes('video') || lower.endsWith('.mp4') || lower.endsWith('.mkv') || lower.endsWith('.mov') || lower.endsWith('.webm')) {
    return <Film size={11} style={{ color: '#00d2ff', flexShrink: 0 }} />;
  }
  if (lower.includes('image') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp') || lower.endsWith('.gif')) {
    return <ImageIcon size={11} style={{ color: '#00ff88', flexShrink: 0 }} />;
  }
  return <FileText size={11} style={{ color: 'rgba(255,255,255,0.7)', flexShrink: 0 }} />;
}
