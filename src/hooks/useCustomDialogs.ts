import { useState, useEffect } from 'react';

export function useCustomDialogs() {
  const [customConfirm, setCustomConfirm] = useState<{
    message: string;
    title: string;
    kind?: 'info' | 'warning' | 'error';
    resolve: (value: boolean) => void;
  } | null>(null);

  const [customPrompt, setCustomPrompt] = useState<{
    message: string;
    title: string;
    defaultValue: string;
    resolve: (value: string | null) => void;
  } | null>(null);

  useEffect(() => {
    (window as any).__customConfirmHandler = (message: string, options?: any) => {
      return new Promise<boolean>((resolve) => {
        setCustomConfirm({
          message,
          title: options?.title || 'CONFIRMATION REQUIRED',
          kind: options?.kind || 'warning',
          resolve
        });
      });
    };

    (window as any).__customPromptHandler = (message: string, defaultValue: string = '', options?: any) => {
      return new Promise<string | null>((resolve) => {
        setCustomPrompt({
          message,
          defaultValue,
          title: options?.title || 'INPUT DIRECTIVE',
          resolve
        });
      });
    };

    return () => {
      delete (window as any).__customConfirmHandler;
      delete (window as any).__customPromptHandler;
    };
  }, []);

  return {
    customConfirm,
    setCustomConfirm,
    customPrompt,
    setCustomPrompt,
  };
}


export type UseCustomDialogsReturn = ReturnType<typeof useCustomDialogs>;
