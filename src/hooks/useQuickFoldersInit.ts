import { useEffect, useRef } from 'react';
import { isTauri } from '../utils/videoUtils';

interface QuickFolder {
  id: string;
  name: string;
  path: string;
}

export function useQuickFoldersInit(
  quickFolders: QuickFolder[] | undefined,
  setQuickFolders: (folders: QuickFolder[]) => void
) {
  const hasCheckedQuickFolders = useRef(false);

  useEffect(() => {
    if (hasCheckedQuickFolders.current) return;
    if (!quickFolders || quickFolders.length === 0) return;
    hasCheckedQuickFolders.current = true;

    if (isTauri()) {
      import('@tauri-apps/api/path').then(({ appDataDir, pictureDir, videoDir }) => {
        appDataDir().then(dir => {
          localStorage.setItem('cosmo-app-data-dir', dir);
        }).catch(err => console.error("Failed to get appDataDir:", err));

        (async () => {
          try {
            const nextFolders = [...quickFolders];
            let modified = false;

            for (let i = 0; i < nextFolders.length; i++) {
              const folder = nextFolders[i];
              if (folder.id === 'demo-pictures' && folder.path.startsWith('G:\\')) {
                const picPath = await pictureDir();
                if (picPath) {
                  nextFolders[i] = { ...folder, path: picPath };
                  modified = true;
                }
              } else if (folder.id === 'demo-videos' && folder.path.startsWith('G:\\')) {
                const vidPath = await videoDir();
                if (vidPath) {
                  nextFolders[i] = { ...folder, path: vidPath };
                  modified = true;
                }
              }
            }

            if (modified) {
              setQuickFolders(nextFolders);
            }
          } catch (err) {
            console.error("Failed to initialize default quick folders:", err);
          }
        })();

      }).catch(err => console.error("Failed to import @tauri-apps/api/path:", err));
    }
  }, [quickFolders, setQuickFolders]);
}
