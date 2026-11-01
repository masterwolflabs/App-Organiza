'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { AccountProfile, CommunityMessage } from '@/types/community';
import type { StarredMessage } from '@/utils/useChatPrefs';
import { Avatar } from '@/components/community/Avatar';

// Lets the group details panel (embedded or popped-out chat) add/remove
// members and leave a real group without threading props through every shell.
export interface GroupsBridge {
  accounts: AccountProfile[];
  isAdmin: (conversationId: string) => boolean;
  addMembers: (conversationId: string, userIds: string[], withHistory?: boolean) => Promise<boolean>;
  /** Group/channel description (admins for real groups). */
  setDescription?: (conversationId: string, text: string) => Promise<boolean>;
  /** Group/channel photo (null removes it) and name — admins only for real groups. */
  setPhoto?: (conversationId: string, file: File | null) => Promise<boolean>;
  rename?: (conversationId: string, name: string) => Promise<boolean>;
  toggleFavorite?: (conversationId: string) => void;
  toggleStar?: (conversationId: string, message: CommunityMessage) => void;
  starred?: StarredMessage[];
  removeMember: (conversationId: string, userId: string) => Promise<void>;
  leave: (conversationId: string) => Promise<void>;
  /** Chat-wide (DMs and groups): the conversation is on screen → mark its messages as read. */
  markSeen?: (conversationId: string) => void;
}
const Ctx = createContext<GroupsBridge | null>(null);
export const GroupsBridgeProvider = Ctx.Provider;
export const useGroupsBridge = () => useContext(Ctx);

/** Searchable multi-select of registered accounts (WhatsApp-style "Agregar participantes"). */
export const AccountPicker: React.FC<{
  accounts: AccountProfile[];
  exclude?: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
}> = ({ accounts, exclude = [], selected, onChange }) => {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return accounts.filter((a) => !exclude.includes(a.id) && (!q || n(`${a.displayName} ${a.email}`).includes(n(q))));
  }, [accounts, exclude, q]);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar personas"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-2 pl-8 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {list.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-zinc-500">{accounts.length ? 'No hay más personas para agregar.' : 'Todavía no hay otras cuentas registradas.'}</p>
        ) : (
          list.map((a) => {
            const on = selected.includes(a.id);
            return (
              <button key={a.id} type="button" onClick={() => toggle(a.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-zinc-900">
                <Avatar name={a.displayName} color="bg-sky-600" size="sm" src={a.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{a.displayName}</p>
                  {a.email && <p className="truncate text-[11px] text-zinc-500">{a.email}</p>}
                </div>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-sky-500 bg-sky-500 text-white' : 'border-zinc-600'}`}>
                  {on && <Check className="h-3 w-3" />}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
