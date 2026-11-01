'use client';

import React, { useMemo, useState } from 'react';
import { BarChart3, Dices, FolderOpen, MessageSquare, PanelLeftClose, Search, SquarePen } from 'lucide-react';
import { AIConversation, AIMode } from '@/lib/aiClient';
import { agentById } from '@/utils/aiCatalog';

const MODE_ICON: Record<AIMode, React.ComponentType<{ className?: string }>> = { report: BarChart3, chat: MessageSquare, random: Dices };

function bucket(iso: string): string {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = (start.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000;
  if (diff <= 0) return 'Hoy';
  if (diff <= 1) return 'Ayer';
  if (diff <= 7) return 'Últimos 7 días';
  if (diff <= 30) return 'Últimos 30 días';
  return 'Anteriores';
}

/** ChatGPT-style left rail: new chat, search and conversations grouped by date (desktop). */
export const ChatSidebar: React.FC<{
  conversations: AIConversation[];
  activeId: string | null;
  onOpen: (c: AIConversation) => void;
  onNew: () => void;
  onCollapse: () => void;
  onOpenLibrary: () => void;
}> = ({ conversations, activeId, onOpen, onNew, onCollapse, onOpenLibrary }) => {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { label: string; items: AIConversation[] }[] = [];
    for (const c of conversations) {
      if (q && !c.title.toLowerCase().includes(q)) continue;
      const label = bucket(c.last_activity_at);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [conversations, query]);

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-zinc-800/80 bg-[#060709]">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <button onClick={onCollapse} title="Cerrar barra lateral" className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white">
          <PanelLeftClose className="h-5 w-5" />
        </button>
        <button onClick={onNew} title="Nuevo chat" className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white">
          <SquarePen className="h-5 w-5" />
        </button>
      </div>
      <div className="px-3">
        <button onClick={onNew} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.06]">
          <SquarePen className="h-4 w-4" /> Nuevo chat
        </button>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar chats"
            className="w-full rounded-xl bg-transparent py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 hover:bg-white/[0.04] focus:bg-white/[0.06] focus:outline-none"
          />
        </div>
        <button onClick={onOpenLibrary} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.06]">
          <FolderOpen className="h-4 w-4" /> Carpetas e historial
        </button>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {groups.length === 0 && <p className="px-3 py-4 text-xs text-zinc-600">{query ? 'Sin resultados.' : 'Aún no tienes conversaciones.'}</p>}
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            <p className="px-3 pb-1 text-[11px] font-medium text-zinc-500">{g.label}</p>
            {g.items.map((c) => {
              const Icon = MODE_ICON[c.mode];
              const emoji = c.mode === 'chat' && c.metadata?.agent ? agentById(c.metadata.agent).emoji : null;
              return (
                <button
                  key={c.id}
                  onClick={() => onOpen(c)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    c.id === activeId ? 'bg-white/[0.09] text-white' : 'text-zinc-300 hover:bg-white/[0.05]'
                  }`}
                >
                  {emoji ? <span className="w-4 shrink-0 text-center text-xs">{emoji}</span> : <Icon className={`h-3.5 w-3.5 shrink-0 ${c.mode === 'random' ? 'text-violet-300' : c.mode === 'report' ? 'text-sky-300' : 'text-zinc-500'}`} />}
                  <span className="truncate">{c.title}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
};
