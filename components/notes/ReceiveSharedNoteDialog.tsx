'use client';

import React, { useState } from 'react';
import type { SharedLinkNote } from '@/utils/useNotes';
import { Copy, Loader2, Users, X } from 'lucide-react';

interface ReceiveSharedNoteDialogProps {
  note: SharedLinkNote;
  onKeepShared: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onOpenMine: () => void;
  onClose: () => void;
}

/** Shown after opening a share link while signed in: keep the collaborative note, or take an independent copy. */
export const ReceiveSharedNoteDialog: React.FC<ReceiveSharedNoteDialogProps> = ({ note, onKeepShared, onDuplicate, onOpenMine, onClose }) => {
  const [busy, setBusy] = useState<null | 'keep' | 'dup'>(null);
  const run = async (kind: 'keep' | 'dup') => {
    setBusy(kind);
    try {
      await (kind === 'keep' ? onKeepShared() : onDuplicate());
    } finally {
      setBusy(null);
    }
  };

  const option = (kind: 'keep' | 'dup', Icon: typeof Users, title: string, text: string) => (
    <button
      disabled={busy !== null}
      onClick={() => run(kind)}
      className="flex w-full items-start gap-3 rounded-xl border border-white/10 p-4 text-left transition-colors hover:border-sky-500/40 hover:bg-sky-500/[0.04] disabled:opacity-60"
    >
      {busy === kind ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-sky-400" /> : <Icon className="mt-0.5 h-4 w-4 text-sky-400" />}
      <span>
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{text}</span>
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-2xl border border-white/10 bg-[#121317] p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">{note.isMine ? 'Esta nota ya es tuya' : 'Te compartieron una nota'}</h3>
            <p className="truncate text-xs text-zinc-500">
              {note.title || 'Sin título'}
              {note.createdByName ? ` · de ${note.createdByName}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        {note.isMine ? (
          <button onClick={onOpenMine} className="mt-5 w-full rounded-xl bg-sky-600 py-2.5 text-xs font-semibold text-white hover:bg-sky-500">
            Abrir nota
          </button>
        ) : (
          <div className="mt-5 space-y-2.5">
            {option(
              'keep',
              Users,
              'Mantener nota compartida',
              `Sigue siendo una sola nota. Los cambios se sincronizan para todos. Aparecerá en "Compartidas conmigo" (${
                note.shareRole === 'editor' ? 'puedes editar' : 'solo lectura'
              }).`
            )}
            {option('dup', Copy, 'Duplicar para mí', 'Una copia independiente, 100% tuya. Ya no se sincroniza con la original.')}
          </div>
        )}
      </div>
    </div>
  );
};
