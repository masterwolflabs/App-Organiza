'use client';

import React, { useMemo, useState } from 'react';
import { AIConversation, AIMode } from '@/lib/aiClient';
import { AIConversationsStore } from '@/utils/useAIConversations';
import { Popover, MenuItem, MenuDivider } from '@/components/notes/NoteMenus';
import { BarChart3, Dices, Folder, FolderPlus, MessageSquare, MoreHorizontal, Pencil, Search, Trash2, X } from 'lucide-react';

const MODE_ICON: Record<AIMode, React.ComponentType<{ className?: string }>> = { report: BarChart3, chat: MessageSquare, random: Dices };
const MODE_TONE: Record<AIMode, string> = { report: 'text-sky-300', chat: 'text-zinc-300', random: 'text-violet-300' };
type Tab = 'all' | AIMode | `folder:${string}`;

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

/** IA conversation history — auto-classified by mode, plus user folders. */
export const AIHistoryPanel: React.FC<{
  store: AIConversationsStore;
  activeId: string | null;
  onOpen: (c: AIConversation) => void;
  onClose: () => void;
}> = ({ store, activeId, onOpen, onClose }) => {
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.conversations.filter((c) => {
      if (q && !c.title.toLowerCase().includes(q)) return false;
      if (tab === 'all') return true;
      if (tab.startsWith('folder:')) return c.folder_id === tab.slice(7);
      return c.mode === tab;
    });
  }, [store.conversations, tab, query]);

  const tabBtn = (key: Tab, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${tab === key ? 'bg-sky-500/15 text-sky-300' : 'text-zinc-500 hover:text-zinc-300'}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onMouseDown={onClose} />
      <aside className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-sm flex-col border-l border-zinc-800 bg-[#0c0f16] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <p className="text-sm font-semibold">Historial</p>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 px-4 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conversación"
              className="w-full rounded-xl border border-zinc-800 bg-black/30 py-2 pl-8 pr-3 text-xs text-white placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
            {tabBtn('all', 'Todas')}
            {tabBtn('report', 'Reportes')}
            {tabBtn('chat', 'Chat abierto')}
            {tabBtn('random', 'Dato random')}
          </div>
          <div className="flex flex-wrap items-center gap-1 pb-2">
            {store.folders.map((f) => (
              <span key={f.id} className="group flex items-center">
                <button
                  onClick={() => setTab(`folder:${f.id}`)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] ${tab === `folder:${f.id}` ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  <Folder className="h-3 w-3" /> {f.name}
                </button>
                <button
                  onClick={() => window.confirm(`¿Eliminar la carpeta "${f.name}"? Las conversaciones no se borran.`) && store.deleteFolder(f.id)}
                  className="hidden rounded p-0.5 text-zinc-600 hover:text-rose-400 group-hover:block"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {newFolder !== null ? (
              <input
                autoFocus
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    await store.createFolder(newFolder);
                    setNewFolder(null);
                  }
                  if (e.key === 'Escape') setNewFolder(null);
                }}
                onBlur={() => setNewFolder(null)}
                placeholder="Nombre de carpeta"
                className="w-32 rounded-lg border border-zinc-700 bg-black/30 px-2 py-1 text-[11px] text-white focus:outline-none"
              />
            ) : (
              <button onClick={() => setNewFolder('')} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300">
                <FolderPlus className="h-3 w-3" /> Carpeta
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-800/60 px-2 py-2">
          {store.loading ? (
            <p className="px-3 py-6 text-center text-xs text-zinc-600">Cargando…</p>
          ) : list.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-zinc-600">No hay conversaciones aquí todavía.</p>
          ) : (
            list.map((c) => {
              const Icon = MODE_ICON[c.mode];
              return (
                <div key={c.id} className={`group flex items-center gap-2 rounded-xl px-2 py-2 ${c.id === activeId ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${MODE_TONE[c.mode]}`} />
                  {renaming === c.id ? (
                    <input
                      autoFocus
                      defaultValue={c.title}
                      onBlur={(e) => {
                        store.rename(c.id, e.target.value);
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      className="min-w-0 flex-1 rounded-md bg-black/40 px-2 py-1 text-xs text-white focus:outline-none"
                    />
                  ) : (
                    <button onClick={() => onOpen(c)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-xs text-zinc-200">{c.title}</span>
                      <span className="block text-[10px] text-zinc-600">
                        {when(c.last_activity_at)}
                        {c.folder_id && store.folders.find((f) => f.id === c.folder_id) ? ` · ${store.folders.find((f) => f.id === c.folder_id)!.name}` : ''}
                      </span>
                    </button>
                  )}
                  <Popover
                    open={menu === c.id}
                    onClose={() => setMenu(null)}
                    width="w-52"
                    anchor={
                      <button onClick={() => setMenu(menu === c.id ? null : c.id)} className="rounded-md p-1 text-zinc-500 opacity-100 hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    }
                  >
                    <MenuItem
                      icon={Pencil}
                      label="Renombrar"
                      onClick={() => {
                        setMenu(null);
                        setRenaming(c.id);
                      }}
                    />
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Mover a carpeta</p>
                    <MenuItem
                      icon={Folder}
                      label="Sin carpeta"
                      onClick={() => {
                        setMenu(null);
                        store.moveToFolder(c.id, null);
                      }}
                    />
                    {store.folders.map((f) => (
                      <MenuItem
                        key={f.id}
                        icon={Folder}
                        label={f.name}
                        hint={c.folder_id === f.id ? '✓' : undefined}
                        onClick={() => {
                          setMenu(null);
                          store.moveToFolder(c.id, f.id);
                        }}
                      />
                    ))}
                    <MenuDivider />
                    <MenuItem
                      icon={Trash2}
                      label="Eliminar"
                      danger
                      onClick={() => {
                        setMenu(null);
                        if (window.confirm('¿Eliminar esta conversación?')) store.remove(c.id);
                      }}
                    />
                  </Popover>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
