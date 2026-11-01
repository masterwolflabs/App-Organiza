'use client';

import React, { useState } from 'react';
import { NoteMember, NoteShareLink, NoteShareRole } from '@/types/notes';
import { AccountProfile } from '@/types/community';
import { initialsOf, peerColor } from '@/components/notes/NoteMenus';
import { Check, Copy, Link2, Loader2, UserPlus, X } from 'lucide-react';

interface ShareNoteDialogProps {
  noteTitle: string;
  ownerName: string;
  links: NoteShareLink[];
  members: NoteMember[];
  accounts: AccountProfile[];
  onEnsureLink: (role: NoteShareRole) => Promise<NoteShareLink | null>;
  onRevokeLink: (linkId: string) => Promise<void>;
  onSetMember: (userId: string, role: NoteShareRole) => Promise<boolean>;
  onRemoveMember: (userId: string) => Promise<void>;
  onClose: () => void;
}

export function shareUrlFor(token: string): string {
  return `${window.location.origin}/n/${token}`;
}

export const ShareNoteDialog: React.FC<ShareNoteDialogProps> = ({
  noteTitle,
  ownerName,
  links,
  members,
  accounts,
  onEnsureLink,
  onRevokeLink,
  onSetMember,
  onRemoveMember,
  onClose,
}) => {
  const [role, setRole] = useState<NoteShareRole>('viewer');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState<NoteShareRole>('viewer');

  const link = links.find((l) => l.role === role && !l.revoked) ?? null;
  const nameOf = (userId: string) => accounts.find((a) => a.id === userId)?.displayName ?? 'Cuenta';
  const addable = accounts.filter((a) => !members.some((m) => m.userId === a.id));

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('No se pudo copiar. Selecciona el link y cópialo manualmente.');
    }
  };

  const createLink = async () => {
    setBusy(true);
    setError('');
    const created = await onEnsureLink(role);
    setBusy(false);
    if (!created) {
      setError('No se pudo crear el link. Revisa que la migración de Notas esté aplicada.');
      return;
    }
    copy(shareUrlFor(created.token));
  };

  const addMember = async () => {
    if (!addUserId) return;
    setBusy(true);
    const ok = await onSetMember(addUserId, addRole);
    setBusy(false);
    if (!ok) setError('No se pudo agregar a esa persona.');
    else setAddUserId('');
  };

  const seg = (value: NoteShareRole, label: string) => (
    <button
      type="button"
      onClick={() => {
        setRole(value);
        setCopied(false);
      }}
      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
        role === value ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-white/10 bg-[#121317] p-5 text-zinc-200 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">Compartir nota</h3>
            <p className="truncate text-xs text-zinc-500">{noteTitle || 'Sin título'}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Link */}
        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Compartir por link</p>
          <div className="mt-2 flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
            {seg('viewer', 'Puede ver')}
            {seg('editor', 'Puede editar')}
          </div>
          {link ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrlFor(link.token)}
                  onFocus={(e) => e.target.select()}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 font-mono text-[11px] text-zinc-300 focus:outline-none"
                />
                <button
                  onClick={() => copy(shareUrlFor(link.token))}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <button onClick={() => onRevokeLink(link.id)} className="text-[11px] text-zinc-500 hover:text-rose-400">
                Desactivar este link
              </button>
            </div>
          ) : (
            <button
              onClick={createLink}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 py-2.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/15 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Crear link y copiar
            </button>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Cualquier persona con el link puede abrirla, aunque no tenga cuenta en Master Finanzas.
          </p>
        </div>

        {/* People */}
        <div className="mt-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Personas con acceso</p>
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2.5 py-1.5">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white ${peerColor(ownerName)}`}>
                {initialsOf(ownerName)}
              </span>
              <span className="flex-1 truncate text-xs text-zinc-200">{ownerName} (tú)</span>
              <span className="text-[11px] text-zinc-500">Propietario</span>
            </div>
            {members.map((m) => {
              const name = nameOf(m.userId);
              return (
                <div key={m.id} className="flex items-center gap-2.5 py-1.5">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white ${peerColor(name)}`}>
                    {initialsOf(name)}
                  </span>
                  <span className="flex-1 truncate text-xs text-zinc-200">{name}</span>
                  <select
                    value={m.role}
                    onChange={(e) => onSetMember(m.userId, e.target.value as NoteShareRole)}
                    className="rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none"
                  >
                    <option value="viewer">Puede ver</option>
                    <option value="editor">Puede editar</option>
                  </select>
                  <button onClick={() => onRemoveMember(m.userId)} title="Quitar acceso" className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-rose-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {addable.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <select
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-zinc-300 focus:outline-none"
              >
                <option value="">Agregar persona de Master Finanzas…</option>
                {addable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
              </select>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as NoteShareRole)}
                className="rounded-lg border border-white/10 bg-black/30 px-1.5 py-2 text-xs text-zinc-300 focus:outline-none"
              >
                <option value="viewer">Ver</option>
                <option value="editor">Editar</option>
              </select>
              <button
                onClick={addMember}
                disabled={!addUserId || busy}
                title="Agregar"
                className="rounded-lg bg-white/10 p-2 text-zinc-200 hover:bg-white/15 disabled:opacity-40"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
};
