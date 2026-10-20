import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CollageItem, CollageConfig } from '../types';
import { isTauri } from '../utils/videoUtils';
import { PERSISTENCE_DEBOUNCE } from '../constants';

export function useCollageState() {
  const [showCollageCanvas, setShowCollageCanvas] = useState(false);
  const [collageItems, setCollageItems] = useState<CollageItem[]>([]);
  const [collageConfig, setCollageConfig] = useState<CollageConfig>({
    backgroundType: 'gradient',
    backgroundValue: 'linear-gradient(135deg, #0d081b 0%, #150d2e 50%, #05020c 100%)'
  });

  // Load collage state on mount
  useEffect(() => {
    invoke<string | null>('load_persistence', { key: 'cosmo-collage' }).then(saved => {
      if (saved) {
        try {
          const p = JSON.parse(saved);
          if (Array.isArray(p)) setCollageItems(p);
        } catch {}
      }
    }).catch(() => {});
    invoke<string | null>('load_persistence', { key: 'cosmo-collage-cfg' }).then(saved => {
      if (saved) {
        try {
          const p = JSON.parse(saved);
          if (p?.backgroundValue) setCollageConfig(p);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  // Auto-save collage state on change with debounce
  useEffect(() => {
    if (collageItems.length === 0) return;
    const timer = setTimeout(() => {
      const nonImageItems = collageItems.filter(item => !item.isImage);
      const dataStr = JSON.stringify(nonImageItems);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-collage', data: dataStr }).catch(() => {});
      }
      localStorage.setItem('cosmo-collage', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [collageItems]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const dataStr = JSON.stringify(collageConfig);
      if (isTauri()) {
        invoke('save_persistence', { key: 'cosmo-collage-cfg', data: dataStr }).catch(() => {});
      }
      localStorage.setItem('cosmo-collage-cfg', dataStr);
    }, PERSISTENCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [collageConfig]);

  return {
    showCollageCanvas,
    setShowCollageCanvas,
    collageItems,
    setCollageItems,
    collageConfig,
    setCollageConfig
  };
}
