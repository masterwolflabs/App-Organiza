'use client';

import React, { useMemo, useState } from 'react';
import { FileText, Film, HardDrive, Image as ImageIcon, Mic, Music, Trash2, X } from 'lucide-react';
import { Conversation } from '@/types/community';

// "Almacenamiento del chat": every photo/video/audio/file/voice note YOU sent
// in real chats, with sizes, grouped totals and delete (deleting removes the
// message and its file for everyone — same as deleting it from the chat).
const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

type Kind = 'foto' | 'video' | 'audio' | 'voz' | 'archivo';
const KIND_META: Record<Kind, { label: string; icon: React.ElementType }> = {
  foto: { label: 'Fotos', icon: ImageIcon },
  video: { label: 'Videos', icon: Film },
  audio: { label: 'Audios', icon: Music },
  voz: { label: 'Notas de voz', icon: Mic },
  archivo: { label: 'Archivos', icon: FileText },
};

export const ChatStoragePanel: React.FC<{
  conversations: Conversation[];
  onDelete: (conversationId: string, messageId: string) => void;
  onClose: () => void;
}> = ({ conversations, onDelete, onClose }) => {
  const [filter, setFilter] = useState<Kind | 'todo'>('todo');
  const items = useMemo(() => {
    const out: { convId: string; convName: string; id: string; name: string; kind: Kind; size: number | null; at: string }[] = [];
    for (const c of conversations) {
      if (!(c.id.startsWith('real-dm-') || c.id.startsWith('group-'))) continue;
      for (const m of c.messages) {
        if (m.senderId !== 'me') continue;
        if (m.attachment) {
          const mime = m.attachment.mime;
          const kind: Kind = mime.startsWith('image/') ? 'foto' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'archivo';
          out.push({ convId: c.id, convName: c.name, id: m.id, name: m.attachment.name, kind, size: m.attachment.size, at: m.createdAt });
        } else if (m.audioPath) {
          out.push({ convId: c.id, convName: c.name, id: m.id, name: `Nota de voz${m.audioDuration ? ` · ${m.audioDuration}s` : ''}`, kind: 'voz', size: null, at: m.createdAt });
        }
      }
    }
    return out.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  }, [conversations]);

  const total = items.reduce((s, x) => s + (x.size ?? 0), 0);
  const byKind = (Object.keys(KIND_META) as Kind[]).map((k) => ({ k, n: items.filter((x) => x.kind === k).length, size: items.filter((x) => x.kind === k).reduce((s, x) => s + (x.size ?? 0), 0) }));
  const visible = filter === 'todo' ? items : items.filter((x) => x.kind === filter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-800 bg-[#121215] shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-white">
              <HardDrive className="h-4 w-4 text-sky-400" /> Almacenamiento del chat
            </h3>
            <p className="text-xs text-zinc-500">
              {items.length} elemento{items.length === 1 ? ' enviado' : 's enviados'} por ti · {fmtSize(total)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 px-5 pt-4">
          <button onClick={() => setFilter('todo')} className={`rounded-lg px-2.5 py-1 text-xs ${filter === 'todo' ? 'bg-sky-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}>
            Todo
          </button>
          {byKind
            .filter((x) => x.n > 0)
            .map(({ k, n, size }) => {
              const I = KIND_META[k].icon;
              return (
                <button key={k} onClick={() => setFilter(k)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ${filter === k ? 'bg-sky-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}>
                  <I className="h-3 w-3" /> {KIND_META[k].label} ({n}){size ? ` · ${fmtSize(size)}` : ''}
                </button>
              );
            })}
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {visible.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-zinc-500">No has enviado archivos en tus chats.</p>
          ) : (
            visible.map((x) => {
              const I = KIND_META[x.kind].icon;
              return (
                <div key={x.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-zinc-900">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-400">
                    <I className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-100">{x.name}</p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {x.convName} · {new Date(x.at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                      {x.size ? ` · ${fmtSize(x.size)}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => window.confirm(`¿Eliminar "${x.name}"? Se borrará del chat para todos.`) && onDelete(x.convId, x.id)}
                    title="Eliminar"
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
