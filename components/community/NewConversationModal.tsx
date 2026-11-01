'use client';

import React, { useState } from 'react';
import { AccountProfile, ConversationKind } from '@/types/community';
import { Avatar } from '@/components/community/Avatar';
import { EmptyState } from '@/components/community/EmptyState';
import { AccountPicker } from '@/components/community/GroupsBridge';
import { Hash, MessageCircle, Users, X } from 'lucide-react';

interface NewConversationModalProps {
  accounts: AccountProfile[];
  onClose: () => void;
  onCreate: (kind: ConversationKind, name: string, memberIds?: string[], description?: string) => void;
  onSelectAccount: (userId: string) => void;
}

const OPTIONS: { kind: ConversationKind; icon: typeof MessageCircle; title: string; subtitle: string }[] = [
  { kind: 'dm', icon: MessageCircle, title: 'Nuevo chat', subtitle: 'Escríbele a otra cuenta de Master Wolf Finance.' },
  { kind: 'group', icon: Users, title: 'Nuevo grupo', subtitle: 'Crea un grupo con otras cuentas.' },
  { kind: 'channel', icon: Hash, title: 'Nuevo canal', subtitle: 'Crea o explora un canal de información.' },
];

export const NewConversationModal: React.FC<NewConversationModalProps> = ({ accounts, onClose, onCreate, onSelectAccount }) => {
  const [kind, setKind] = useState<ConversationKind | null>(null);
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [description, setDescription] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind || kind === 'dm' || !name.trim()) return;
    onCreate(kind, name.trim(), kind === 'group' ? memberIds : undefined, description.trim() || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl border border-zinc-800 bg-[#18181b] p-5 shadow-2xl">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h3 className="text-base font-bold text-white">{kind ? OPTIONS.find((o) => o.kind === kind)?.title : 'Nuevo chat'}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {!kind ? (
          <div className="space-y-1.5 overflow-y-auto">
            {OPTIONS.map((o) => (
              <button
                key={o.kind}
                onClick={() => setKind(o.kind)}
                className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-zinc-900"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
                  <o.icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{o.title}</p>
                  <p className="text-xs text-zinc-500">{o.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        ) : kind === 'dm' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {accounts.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title="Todavía no hay otras cuentas registradas."
                subtitle="Cuando alguien más entre a Master Wolf Finance, aparecerá aquí."
              />
            ) : (
              <div className="space-y-1">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      onSelectAccount(a.id);
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-zinc-900"
                  >
                    <Avatar name={a.displayName} color="bg-sky-600" src={a.avatarUrl} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{a.displayName}</p>
                      {a.email && <p className="truncate text-xs text-zinc-500">{a.email}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setKind(null)} className="mt-3 rounded-xl px-3.5 py-2 text-xs text-zinc-400 hover:bg-zinc-800">
              Atrás
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-col space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                {kind === 'group' ? 'Nombre del grupo' : 'Nombre del canal'}
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === 'group' ? 'Ej: Viaje de fin de año' : 'Ej: Mercados y análisis'}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
              />
              <label className="mb-1 mt-3 block text-xs font-medium text-zinc-400">Descripción (opcional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder={kind === 'group' ? 'De qué se trata este grupo' : 'Qué se publica en este canal'}
                className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
              />
              {kind === 'channel' && (
                <p className="mt-2 text-[11px] text-zinc-500">Por ahora esto crea un canal de demostración — los canales reales llegan más adelante.</p>
              )}
            </div>
            {kind === 'group' && (
              <div className="flex max-h-64 flex-col">
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  Participantes {memberIds.length ? `(${memberIds.length})` : '(opcional, puedes agregar después)'}
                </label>
                <AccountPicker accounts={accounts} selected={memberIds} onChange={setMemberIds} />
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setKind(null)} className="rounded-xl px-3.5 py-2 text-xs text-zinc-400 hover:bg-zinc-800">
                Atrás
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Crear
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
