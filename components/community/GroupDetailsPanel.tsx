'use client';

import React, { useRef, useState } from 'react';
import { Conversation } from '@/types/community';
import { Avatar } from '@/components/community/Avatar';
import { AccountPicker, useGroupsBridge } from '@/components/community/GroupsBridge';
import { GROUP_PREFIX } from '@/utils/useChatGroups';
import {
  Bell,
  Calendar,
  ChevronRight,
  FolderOpen,
  Loader2,
  LogOut,
  Camera,
  Pencil,
  Shield,
  Star,
  UserMinus,
  MoreHorizontal,
  Receipt,
  Search,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';

interface GroupDetailsPanelProps {
  conversation: Conversation;
  onClose: () => void;
}

const PREPARED_ACTIONS = [
  { icon: Receipt, label: 'Gastos del grupo' },
  { icon: FolderOpen, label: 'Archivos compartidos' },
  { icon: Calendar, label: 'Calendario' },
  { icon: Wallet, label: 'Resumen de cuentas' },
];

export const GroupDetailsPanel: React.FC<GroupDetailsPanelProps> = ({ conversation, onClose }) => {
  const isGroup = conversation.kind === 'group';
  const bridge = useGroupsBridge();
  const real = Boolean(bridge) && conversation.id.startsWith(GROUP_PREFIX);
  const admin = real && bridge!.isAdmin(conversation.id);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Asked after picking people: can they read what was said before they joined?
  const [askHistory, setAskHistory] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(conversation.description ?? '');
  const canEditDesc = Boolean(bridge?.setDescription) && conversation.kind !== 'dm' && !conversation.support && (real ? admin : true);
  // Photo and name: only the group's admin (its creator); demo channels/groups are local.
  const canManage = conversation.kind !== 'dm' && !conversation.support && (real ? admin : Boolean(bridge));
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(conversation.name);
  const changePhoto = async (file: File | null) => {
    if (!bridge?.setPhoto) return;
    setPhotoBusy(true);
    const ok = await bridge.setPhoto(conversation.id, file);
    setPhotoBusy(false);
    if (!ok) setMsg('No se pudo cambiar la foto. Intenta de nuevo.');
  };
  const starredHere = (bridge?.starred ?? []).filter((x) => x.conversation_key === conversation.id);
  const files = conversation.messages.filter((m) => m.attachment || m.audioPath).length;

  const confirmAdd = async (withHistory: boolean) => {
    if (!bridge) return;
    setBusy(true);
    const ok = await bridge.addMembers(conversation.id, picked, withHistory);
    setBusy(false);
    setAskHistory(false);
    setAdding(false);
    setMsg(
      ok
        ? `${picked.length === 1 ? 'Se agregó 1 persona' : `Se agregaron ${picked.length} personas`} al grupo${withHistory ? ' con acceso al historial' : ' (solo verá los mensajes nuevos)'}.`
        : 'No se pudo agregar. Intenta de nuevo.'
    );
  };

  const onAgregar = () => {
    if (!real) return setMsg('Este grupo es de demostración. Crea un grupo nuevo para agregar personas.');
    if (!admin) return setMsg('Solo los administradores del grupo pueden agregar personas.');
    setPicked([]);
    setAdding(true);
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-zinc-800 bg-[#0c0c0f]">
      <div className="flex items-center justify-between px-4 py-3.5">
        <h3 className="text-sm font-bold text-white">{isGroup ? 'Detalles del grupo' : 'Detalles'}</h3>
        <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <div className="relative">
            <Avatar name={conversation.name} color={conversation.color} emoji={conversation.emoji} kind={conversation.kind} size="lg" src={conversation.avatarUrl} />
            {canManage && bridge?.setPhoto && (
              <>
                <button
                  onClick={() => photoInput.current?.click()}
                  disabled={photoBusy}
                  title="Cambiar foto"
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0c0c0f] bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-60"
                >
                  {photoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                </button>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) changePhoto(f);
                  }}
                />
              </>
            )}
          </div>
          {canManage && conversation.avatarUrl && bridge?.setPhoto && (
            <button onClick={() => changePhoto(null)} className="text-[11px] text-zinc-500 hover:text-rose-400">
              Quitar foto
            </button>
          )}
          {editingName ? (
            <div className="flex w-full items-center gap-1.5">
              <input
                autoFocus
                value={nameDraft}
                maxLength={60}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Escape') setEditingName(false);
                  if (e.key === 'Enter' && nameDraft.trim()) {
                    const ok = await bridge!.rename!(conversation.id, nameDraft.trim());
                    setEditingName(false);
                    if (!ok) setMsg('No se pudo cambiar el nombre.');
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-center text-sm text-white focus:border-sky-500 focus:outline-none"
              />
              <button
                disabled={!nameDraft.trim()}
                onClick={async () => {
                  const ok = await bridge!.rename!(conversation.id, nameDraft.trim());
                  setEditingName(false);
                  if (!ok) setMsg('No se pudo cambiar el nombre.');
                }}
                className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
              >
                Guardar
              </button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-base font-bold text-white">
              {conversation.name}
              {conversation.emoji ? ` ${conversation.emoji}` : ''}
              {canManage && bridge?.rename && (
                <button onClick={() => (setNameDraft(conversation.name), setEditingName(true))} title="Cambiar nombre" className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </p>
          )}
          {isGroup && <p className="text-xs text-zinc-500">{conversation.members?.length ?? 0} miembros</p>}
        </div>

        {conversation.kind !== 'dm' && !conversation.support && (
          <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Descripción</p>
              {canEditDesc && !editingDesc && (
                <button onClick={() => (setDesc(conversation.description ?? ''), setEditingDesc(true))} title="Editar descripción" className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
            {editingDesc ? (
              <div>
                <textarea
                  autoFocus
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  maxLength={300}
                  className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => setEditingDesc(false)} className="rounded-lg px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800">
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await bridge!.setDescription!(conversation.id, desc.trim());
                      setEditingDesc(false);
                      if (!ok) setMsg('No se pudo guardar la descripción.');
                    }}
                    className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-500"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-zinc-300">{conversation.description || <span className="text-zinc-600">Sin descripción.</span>}</p>
            )}
          </div>
        )}

        {real && (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-zinc-900/70 px-3 py-2 text-[11px] text-zinc-400">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
            {admin
              ? 'Eres el administrador: solo tú puedes cambiar la foto, el nombre y la descripción, y agregar o expulsar personas.'
              : 'Solo el administrador (quien creó el grupo) puede cambiar la foto, el nombre y la descripción, y agregar o expulsar personas.'}
          </p>
        )}

        {isGroup && (
          <div className={`mb-5 grid gap-2 text-center ${real && !admin ? 'grid-cols-3' : 'grid-cols-4'}`}>
            {[
              ...(real && !admin ? [] : [{ icon: UserPlus, label: 'Agregar' }]),
              { icon: Search, label: 'Buscar' },
              { icon: Bell, label: 'Notificaciones' },
              { icon: MoreHorizontal, label: 'Más' },
            ].map((a) => (
              <button
                key={a.label}
                onClick={a.label === 'Agregar' ? onAgregar : undefined}
                title={a.label === 'Agregar' ? 'Agregar personas' : 'Próximamente'}
                className={`flex flex-col items-center gap-1.5 rounded-xl py-2 hover:bg-zinc-900 ${a.label === 'Agregar' ? 'text-sky-400 hover:text-sky-300' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900">
                  <a.icon className="h-4 w-4" />
                </span>
                <span className="text-[10px]">{a.label}</span>
              </button>
            ))}
          </div>
        )}

        {msg && <p className="mb-4 rounded-lg bg-zinc-900 px-3 py-2 text-[11px] text-zinc-400">{msg}</p>}

        {adding && bridge && (
          <div className="mb-5 flex max-h-80 flex-col rounded-xl border border-sky-500/30 bg-zinc-950 p-3">
            <p className="mb-2 text-xs font-semibold text-white">Agregar participantes</p>
            {askHistory && (
              <div className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
                <p className="text-sm font-semibold text-white">¿Quieres que {picked.length === 1 ? 'esta persona vea' : 'estas personas vean'} los mensajes anteriores?</p>
                <p className="mt-1 text-[11px] text-zinc-400">Si dices que no, solo verán lo que se escriba desde ahora.</p>
                <div className="mt-3 flex flex-col gap-1.5">
                  <button disabled={busy} onClick={() => confirmAdd(true)} className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40">
                    {busy && <Loader2 className="h-3 w-3 animate-spin" />} Sí, que vean el historial
                  </button>
                  <button disabled={busy} onClick={() => confirmAdd(false)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40">
                    No, solo los mensajes nuevos
                  </button>
                </div>
              </div>
            )}
            <AccountPicker accounts={bridge.accounts} exclude={(conversation.members ?? []).map((m) => m.id)} selected={picked} onChange={setPicked} />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800">
                Cancelar
              </button>
              <button
                disabled={!picked.length || busy}
                onClick={() => setAskHistory(true)}
                className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />} Agregar{picked.length ? ` (${picked.length})` : ''}
              </button>
            </div>
          </div>
        )}

        {isGroup && (
          <div className="mb-5 overflow-hidden rounded-xl border border-zinc-800">
            {PREPARED_ACTIONS.map((a, i) => (
              <button
                key={a.label}
                title="Próximamente"
                className={`flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm text-zinc-300 hover:bg-zinc-900 ${
                  i > 0 ? 'border-t border-zinc-800' : ''
                }`}
              >
                <a.icon className="h-4 w-4 text-zinc-500" />
                <span className="flex-1">{a.label}</span>
                {a.label === 'Archivos compartidos' && files > 0 && <span className="text-xs text-zinc-500">{files}</span>}
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
              </button>
            ))}
          </div>
        )}

        {starredHere.length > 0 && (
          <div className="mb-5">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> Mensajes destacados
            </h4>
            <div className="space-y-1.5">
              {starredHere.map((x) => {
                const m = conversation.messages.find((mm) => mm.id === x.message_id);
                return (
                  <div key={x.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-zinc-400">{x.sender_name}</span>
                      {m && (
                        <button title="Quitar de destacados" onClick={() => bridge?.toggleStar?.(conversation.id, m)} className="text-amber-400 hover:text-zinc-400">
                          <Star className="h-3 w-3 fill-current" />
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-3 text-xs text-zinc-200">{x.preview}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isGroup && conversation.members && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Miembros</h4>
              {admin && (
                <button onClick={onAgregar} className="text-xs font-medium text-sky-400 hover:text-sky-300">
                  + Agregar
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {conversation.members.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-zinc-900">
                  <Avatar name={m.name} color={m.color} size="sm" src={m.avatarUrl} />
                  <span className="flex-1 text-sm text-zinc-200">{m.name}</span>
                  {m.isAdmin && (
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400">Admin</span>
                  )}
                  {admin && !m.isAdmin && (
                    <button
                      title="Expulsar del grupo"
                      onClick={() => window.confirm(`¿Expulsar a ${m.name} del grupo?`) && bridge!.removeMember(conversation.id, m.id)}
                      className="rounded-md p-1 text-zinc-600 hover:bg-zinc-800 hover:text-rose-400"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {real && !admin && (
              <button
                onClick={() => window.confirm('¿Salir del grupo? Dejarás de ver sus mensajes.') && bridge!.leave(conversation.id).then(onClose)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10"
              >
                <LogOut className="h-3.5 w-3.5" /> Salir del grupo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
