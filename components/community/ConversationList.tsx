'use client';

import React, { useMemo, useState } from 'react';
import { Conversation, ConversationKind } from '@/types/community';
import { Avatar } from '@/components/community/Avatar';
import { EmptyState } from '@/components/community/EmptyState';
import { Search, SquarePen, BellDot, Star, Archive, Pin, HardDrive, Sparkles } from 'lucide-react';
import { useGroupsBridge } from '@/components/community/GroupsBridge';

type KindFilter = 'all' | ConversationKind | 'support';
type QuickFilter = 'none' | 'unread' | 'favorite' | 'archived' | 'starred';

const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'dm', label: 'Personas' },
  { key: 'group', label: 'Grupos' },
  { key: 'channel', label: 'Canales' },
  { key: 'support', label: 'Soporte' },
];

function formatListDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86_400_000);
  if (diffDays <= 0) return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) {
    const w = d.toLocaleDateString('es-CL', { weekday: 'short' });
    return w.charAt(0).toUpperCase() + w.slice(1).replace('.', '');
  }
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  /** Opens "Almacenamiento del chat". */
  onOpenStorage?: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({ conversations, selectedId, onSelect, onNewChat, onOpenStorage }) => {
  const bridge = useGroupsBridge();
  const starred = bridge?.starred ?? [];
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('none');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => (quickFilter === 'archived' ? c.archived : !c.archived))
      .filter((c) => kindFilter === 'all' || (kindFilter === 'support' ? !!c.support : c.kind === kindFilter && !c.support))
      .filter((c) => {
        if (quickFilter === 'unread') return c.unreadCount > 0;
        if (quickFilter === 'favorite') return c.favorite;
        return true;
      })
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.lastMessagePreview.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });
  }, [conversations, kindFilter, quickFilter, query]);

  const quickBtn = (key: QuickFilter, Icon: typeof BellDot, title: string) => (
    <button
      onClick={() => setQuickFilter((f) => (f === key ? 'none' : key))}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
        quickFilter === key ? 'bg-sky-500/20 text-sky-400' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-r border-zinc-800">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h2 className="text-xl font-bold tracking-tight text-white">Chats</h2>
        <div className="flex items-center gap-1">
          {quickBtn('unread', BellDot, 'No leídos')}
          {quickBtn('favorite', Star, 'Chats favoritos')}
          {quickBtn('starred', Sparkles, 'Mensajes destacados')}
          {quickBtn('archived', Archive, 'Archivados')}
          {onOpenStorage && (
            <button onClick={onOpenStorage} title="Almacenamiento del chat" className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
              <HardDrive className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onNewChat}
            title="Nuevo chat"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-sky-400 hover:bg-sky-500/10"
          >
            <SquarePen className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar chats, personas o canales..."
            className="w-full rounded-xl border border-zinc-800 bg-[#18181b] py-2.5 pl-9 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto px-4 pt-3 [scrollbar-width:none]">
        {KIND_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setKindFilter(t.key)}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              kindFilter === t.key ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-3">
        {quickFilter === 'starred' ? (
          starred.length === 0 ? (
            <EmptyState title="Sin mensajes destacados." subtitle="Pasa el mouse sobre un mensaje y toca la estrella para destacarlo." />
          ) : (
            starred
              .filter((x) => !query.trim() || x.preview.toLowerCase().includes(query.trim().toLowerCase()))
              .map((x) => {
                const c = conversations.find((cc) => cc.id === x.conversation_key);
                return (
                  <button
                    key={x.id}
                    onClick={() => c && onSelect(c.id)}
                    disabled={!c}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-zinc-900/60 disabled:opacity-50"
                  >
                    <Star className="mt-1 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-zinc-300">
                          {x.sender_name} · {c?.name ?? 'Chat no disponible'}
                        </span>
                        {x.message_at && <span className="shrink-0 text-[10px] text-zinc-500">{formatListDate(x.message_at)}</span>}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-zinc-100">{x.preview}</p>
                    </div>
                  </button>
                );
              })
          )
        ) : visible.length === 0 ? (
          <EmptyState
            title={conversations.length === 0 ? 'Todavía no tienes conversaciones.' : 'Nada por aquí.'}
            subtitle={
              conversations.length === 0
                ? 'Cuando conectes con otras personas, tus conversaciones aparecerán aquí.'
                : 'Prueba con otro filtro o búsqueda.'
            }
            action={
              conversations.length === 0 && (
                <button
                  onClick={onNewChat}
                  className="mt-1 flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  <SquarePen className="h-3.5 w-3.5" />
                  Nuevo chat
                </button>
              )
            }
          />
        ) : (
          visible.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                selectedId === c.id ? 'bg-sky-500/10' : 'hover:bg-zinc-900/60'
              }`}
            >
              <Avatar name={c.name} color={c.color} emoji={c.emoji} kind={c.kind} brand={!!c.support} src={c.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-white">
                    {c.pinned && <Pin className="h-2.5 w-2.5 shrink-0 rotate-45 text-zinc-500" />}
                    <span className="truncate">
                      {c.name}
                      {c.emoji ? ` ${c.emoji}` : ''}
                    </span>
                    {c.support && <span className="shrink-0 rounded-md bg-sky-500/15 px-1.5 py-px text-[9px] font-semibold text-sky-300">Soporte</span>}
                  </span>
                  <span className="shrink-0 text-[10px] text-zinc-500">{formatListDate(c.lastMessageAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-zinc-500">
                    {c.support && <span className="text-zinc-400">{c.support.code} · </span>}
                    {c.lastMessagePreview}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="flex h-4.5 min-w-[18px] shrink-0 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
