import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../utils/videoUtils';

export function usePopoutState() {
  const [isPopout, setIsPopout] = useState(() => {
    if (isTauri()) {
      try {
        const label = getCurrentWindow().label;
        if (label.startsWith('pop-') || label === 'popout') {
          return true;
        }
      } catch { /* ignore non-Tauri window check */ }
    }
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('popout') === 'true';
    }
    return false;
  });

  const [popoutUrl, setPopoutUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const qUrl = urlParams.get('url');
      if (qUrl) {
        try {
          return decodeURIComponent(qUrl);
        } catch {
          return qUrl;
        }
      }
    }
    if (isTauri()) {
      try {
        const label = getCurrentWindow().label;
        if (label.startsWith('pop-') || label === 'popout') {
          return localStorage.getItem(`cosmo-popout-active-url-${label}`) || '';
        }
      } catch { /* ignore storage read failure */ }
    }
    return '';
  });

  const [isPopoutChecking, setIsPopoutChecking] = useState(!isPopout);

  useEffect(() => {
    if (isTauri()) {
      try {
        const label = getCurrentWindow().label;
        if (label.startsWith('pop-') || label === 'popout' || isPopout) {
          invoke<string | null>('get_popout_url')
            .then(url => {
              if (url) {
                setIsPopout(true);
                setPopoutUrl(url);
                try {
                  localStorage.setItem(`cosmo-popout-active-url-${label}`, url);
                } catch { /* ignore storage write failure */ }
              }
              setIsPopoutChecking(false);
            })
            .catch(() => {
              setIsPopoutChecking(false);
            });
          return;
        }
      } catch { /* ignore popout window init error */ }
    }
    setIsPopoutChecking(false);
  }, [isPopout]);

  return {
    isPopout,
    popoutUrl,
    isPopoutChecking,
  };
}
