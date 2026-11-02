'use client';

import { useEffect, useRef } from 'react';

/**
 * Una nota abierta es una página (Emanuel, 2026-11-02): tiene su link (?note=<id>), su título en la pestaña,
 * Atrás vuelve al sistema y Adelante la reabre. Una nota nueva recibe su link cuando se guarda por primera vez.
 */
const noteInUrl = () => new URLSearchParams(window.location.search).get('note');
const urlWith = (id: string | null) => {
  const params = new URLSearchParams(window.location.search);
  if (id) params.set('note', id);
  else params.delete('note');
  const rest = params.toString();
  return `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`;
};

export function useNoteUrl(noteId: string | null, title: string, open: (id: string) => void, close: () => void) {
  const cbs = useRef({ open, close, noteId });
  cbs.current = { open, close, noteId };

  // Sin una nota abierta antes, no hay nada que cerrar: un link recién llegado todavía se está abriendo.
  const before = useRef<string | null>(null);
  const leaving = useRef(false);
  useEffect(() => {
    const was = before.current;
    before.current = noteId;
    const inUrl = noteInUrl();
    if (noteId === inUrl || (!noteId && !was)) return;
    if (noteId) {
      const entry = { ...window.history.state, mwNote: noteId };
      if (inUrl) window.history.replaceState(entry, '', urlWith(noteId));
      else window.history.pushState(entry, '', urlWith(noteId));
    } else if (inUrl && window.history.state?.mwNote === inUrl) {
      leaving.current = true;
      window.history.back();
    }
    else if (inUrl) window.history.replaceState(window.history.state, '', urlWith(null));
  }, [noteId]);

  useEffect(() => {
    const onPop = () => {
      const id = noteInUrl();
      // Closing with the note's button only leaves it: never reopens one from the entry behind.
      if (leaving.current) {
        leaving.current = false;
        if (id) window.history.replaceState(window.history.state, '', urlWith(null));
        return;
      }
      if (id && id !== cbs.current.noteId) cbs.current.open(id);
      else if (!id && cbs.current.noteId) cbs.current.close();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const label = noteId ? title.trim() || 'Nota' : '';
  useEffect(() => {
    if (!label) return;
    const page = document.title;
    document.title = label;
    return () => {
      document.title = page;
    };
  }, [label]);
}
