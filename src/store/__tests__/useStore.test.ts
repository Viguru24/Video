import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  };
}

describe('useStore core actions', () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    vi.resetModules();
    storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toggles auto-sync folders case- and slash-insensitively and persists to localStorage', async () => {
    const { useStore } = await import('../useStore');

    useStore.getState().toggleAutoSyncFolder('C:\\Media\\Clips\\');
    expect(useStore.getState().autoSyncFolders).toEqual(['C:\\Media\\Clips\\']);
    expect(JSON.parse(storage.getItem('cosmo-auto-sync-folders') || '[]')).toEqual([
      'C:\\Media\\Clips\\',
    ]);

    // Same folder normalized with forward slashes & different casing toggles it off
    useStore.getState().toggleAutoSyncFolder('c:/media/clips');
    expect(useStore.getState().autoSyncFolders).toEqual([]);
  });

  it('clears activeLayoutPresetId when zoom diverges from the active preset', async () => {
    const { useStore } = await import('../useStore');

    useStore.getState().setActiveLayoutPresetId('studio-3x3');
    useStore.getState().setZoom(3);
    expect(useStore.getState().activeLayoutPresetId).toBe('studio-3x3');

    useStore.getState().setZoom(5);
    expect(useStore.getState().zoom).toBe(5);
    expect(useStore.getState().activeLayoutPresetId).toBeNull();
  });

  it('persists mediaMode and updates colorTagFilter', async () => {
    const { useStore } = await import('../useStore');

    useStore.getState().setMediaMode('picture');
    expect(useStore.getState().mediaMode).toBe('picture');
    expect(storage.getItem('cosmo-media-mode')).toBe('picture');

    useStore.getState().setColorTagFilter('green');
    expect(useStore.getState().colorTagFilter).toBe('green');
  });
});
