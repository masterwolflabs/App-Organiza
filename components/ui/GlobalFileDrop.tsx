'use client';

import { useEffect } from 'react';
import { dropFile } from '@/utils/fileDrop';

/** Whole app: dropping a file never makes the browser open it. Whoever handled the drop already called preventDefault. */
export function GlobalFileDrop() {
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) dropFile(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return null;
}
