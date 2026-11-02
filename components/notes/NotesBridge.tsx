'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Note, NoteLinkType, NoteRole, NoteShareRole } from '@/types/notes';
import { colorOf, formatCardDate, noteMatches } from '@/utils/notes';
import { Eye, Loader2, Pencil, Search, StickyNote, X } from 'lucide-react';

export interface NoteCardInfo {
  note: Note;
  role: NoteRole | null;
}

/**
 * Lets Comunidad (chat panes rendered in three different shells: embedded,
 * floating, side panel) attach and open notes without threading props
 * through every wrapper. Provided once by app/page.tsx.
 */
export interface NotesBridgeValue {
  pickableNotes: Note[];
  resolveNote: (noteId: string) => Promise<NoteCardInfo | null>;
  openNote: (noteId: string) => void;
  sendNote: (conversationId: string, noteId: string, role: NoteShareRole) => void;
  /** A presupuesto / proyecto's own note (Emanuel, 2026-10-21): the one linked to it, if any. */
  projectNote?: (projectId: string) => Note | null;
  /** Opens it, or starts it linked to the project (text = the old plain "Notas" to carry over). */
  openProjectNote?: (projectId: string, label: string, text?: string) => void;
  /** Any record's own note (a Pendientes task…): the note linked to {type, id}, if any. */
  linkedNote?: (type: NoteLinkType, id: string) => Note | null;
  /** Opens it, or starts it linked to the record in the given category. */
  openLinkedNote?: (type: NoteLinkType, id: string, label: string, category: string, text?: string, backLabel?: string, start?: { html?: string; color?: string }) => void;
  /** The record's name and its note's are one: saves the title and the name the link remembers. */
  renameLinked?: (noteId: string, title: string, linkId: string) => void;
  /** What shows under the title of the notes linked to this type (a Daily task's properties). */
  linkPanel?: (type: NoteLinkType, panel: React.ComponentType<{ id: string }>, footer?: React.ComponentType<{ id: string; onClose: () => void }>, template?: { label: string; html: string }) => void;
}

const NotesBridgeContext = createContext<NotesBridgeValue | null>(null);
export const NotesBridgeProvider = NotesBridgeContext.Provider;
export const useNotesBridge = () => useContext(NotesBridgeContext);

/** The card a chat shows for a shared note — the same note object, never a copy. */
export const NoteMessageCard: React.FC<{ noteId: string; own: boolean }> = ({ noteId, own }) => {
  const bridge = useNotesBridge();
  const [info, setInfo] = useState<NoteCardInfo | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!bridge) return;
    bridge.resolveNote(noteId).then((r) => {
      if (!cancelled) setInfo(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  if (info === undefined) {
    return (
      <div className="flex w-64 items-center gap-2 rounded-2xl border border-white/10 bg-[#16171c] px-4 py-3 text-xs text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando nota…
      </div>
    );
  }
  if (!info) {
    return (
      <div className="w-64 rounded-2xl border border-white/10 bg-[#16171c] px-4 py-3 text-xs text-zinc-500">
        <StickyNote className="mb-1 h-4 w-4" />
        Esta nota ya no está disponible.
      </div>
    );
  }
  const { note, role } = info;
  const canEdit = role === 'owner' || role === 'editor';
  return (
    <div
      className={`theme-fixed w-64 overflow-hidden text-zinc-900 ${
        note.linkedMovementId
          ? 'note-dark rounded-2xl border border-white/10 bg-[#16171b]'
          : `rounded-[4px] shadow-[0_10px_20px_-10px_rgba(0,0,0,0.7)] ${colorOf(note.color).bg}`
      }`}
    >
      <div className="px-4 pb-3 pt-3.5">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-900/55">
          <StickyNote className="h-3 w-3" /> Nota
          {note.category && <span className="ml-auto normal-case tracking-normal text-zinc-900/70">{note.category}</span>}
        </p>
        <p className="mt-1.5 line-clamp-2 text-sm font-bold">{note.title.trim() || 'Sin título'}</p>
        {note.body.trim() && <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-zinc-900/75">{note.body}</p>}
        <p className="mt-2 text-[10px] text-zinc-900/55">
          {note.createdByName ? `${note.createdByName} · ` : ''}
          {formatCardDate(note.updatedAt)}
        </p>
      </div>
      <div className="flex border-t border-black/10">
        <button
          onClick={() => bridge?.openNote(note.id)}
          className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold text-zinc-900/80 hover:bg-black/10"
        >
          {canEdit ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {canEdit ? 'Editar nota' : 'Ver nota'}
        </button>
      </div>
    </div>
  );
};

/** "Adjuntar → Nota": pick one of your notes and the permission the chat gets. */
export const NotePickerDialog: React.FC<{ conversationId: string; isDm: boolean; onClose: () => void }> = ({ conversationId, isDm, onClose }) => {
  const bridge = useNotesBridge();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<NoteShareRole>('viewer');
  const notes = useMemo(
    () =>
      (bridge?.pickableNotes ?? [])
        .filter((n) => !n.deletedAt && noteMatches(n, query))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [bridge, query]
  );
  if (!bridge) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl border border-white/10 bg-[#121317] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h3 className="text-sm font-semibold text-white">Adjuntar nota</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nota"
              className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none"
            />
          </div>
          {isDm && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[11px] text-zinc-500">La otra persona</span>
              <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5">
                {(['viewer', 'editor'] as NoteShareRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${role === r ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
                  >
                    {r === 'viewer' ? 'Puede ver' : 'Puede editar'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {notes.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-zinc-500">No hay notas para adjuntar.</p>
          ) : (
            notes.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  bridge.sendNote(conversationId, n.id, role);
                  onClose();
                }}
                className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-white/5"
              >
                <span className={`mt-0.5 h-8 w-8 shrink-0 rounded-lg border border-white/10 ${colorOf(n.color).bg}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-zinc-100">{n.title.trim() || 'Sin título'}</span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {n.category ? `${n.category} · ` : ''}
                    {n.body.trim() || formatCardDate(n.updatedAt)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
