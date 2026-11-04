'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Sparkles, Upload } from 'lucide-react';
import { APP } from '@/app.config';
import { authFetch } from '@/lib/authFetch';
import { cloudAI } from '@/lib/aiClient';
import { supabase } from '@/lib/supabaseClient';
import { useSpace } from '@/components/organiza/space';
import { compressImageForNote } from '@/utils/image';
import { MicButton } from '@/components/organiza/DayAdjust';

/**
 * Ícono de una acción (Emanuel, 2026-11-04): TODOS los emojis (en Mac/iPhone se ven como los de
 * Apple), un ícono creado por la IA (ej. «logo de Claude») o una imagen propia. Si es imagen, el
 * campo `icon` guarda su enlace y `ItemIcon` la dibuja del tamaño de un emoji.
 */
export const isImageIcon = (v?: string | null) => !!v && /^https?:\/\//.test(v);
/** Para textos (notificaciones): el emoji, o nada si el ícono es una imagen. */
export const iconText = (v?: string | null) => (isImageIcon(v) ? '' : v ?? '');

export const ItemIcon: React.FC<{ value?: string | null; className?: string }> = ({ value, className = '' }) =>
  isImageIcon(value) ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={value!} alt="" className={`inline-block h-[1.15em] w-[1.15em] rounded-[22%] object-cover align-[-0.2em] ${className}`} />
  ) : (
    <span className={className}>{value}</span>
  );

const SUGGESTED: { label: string; list: string[] }[] = [
  { label: 'Rutina', list: ['🌅', '😴', '🚿', '🪥', '🛏️', '☕', '🍳', '🍽️', '💧', '💊', '🧹', '🧺'] },
  { label: 'Cuerpo', list: ['🏋️', '🏃', '🚶', '🚴', '🏊', '🧘', '⚽', '🥊', '🤸', '🥗', '🍎', '❤️'] },
  { label: 'Mente', list: ['📖', '📚', '✍️', '🙏', '🧠', '🎯', '🗓️', '📝', '🎧', '🎵', '🎨', '✨'] },
  { label: 'Trabajo', list: ['💼', '💻', '📧', '👥', '📞', '📊', '💰', '🚀', '🛠️', '📦', '🏢', '🔥'] },
  { label: 'Vida', list: ['👨‍👩‍👧', '🫂', '🐶', '🛒', '🚗', '✈️', '📺', '🎮', '🌳', '🏖️', '🎉', '⭐'] },
];
const GROUPS: { id: number; label: string; emoji: string }[] = [
  { id: 0, label: 'Caritas', emoji: '😀' },
  { id: 1, label: 'Personas', emoji: '🧑' },
  { id: 3, label: 'Animales y naturaleza', emoji: '🐶' },
  { id: 4, label: 'Comida', emoji: '🍔' },
  { id: 5, label: 'Viajes y lugares', emoji: '✈️' },
  { id: 6, label: 'Actividades', emoji: '⚽' },
  { id: 7, label: 'Objetos', emoji: '💡' },
  { id: 8, label: 'Símbolos', emoji: '❤️' },
  { id: 9, label: 'Banderas', emoji: '🏳️' },
];
type Emoji = { unicode: string; label: string; tags?: string[]; group?: number; order?: number };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Los ~1.900 emojis con nombre en español: se cargan recién al abrir el selector. */
let cache: Emoji[] | null = null;
function useAllEmojis() {
  const [list, setList] = useState<Emoji[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    import('emojibase-data/es/compact.json').then((m) => {
      cache = (m.default as Emoji[]).filter((e) => e.group !== undefined && e.group !== 2).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setList(cache);
    });
  }, []);
  return list;
}

const EmojiTab: React.FC<{ value: string; onPick: (e: string) => void }> = ({ value, onPick }) => {
  const all = useAllEmojis();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<number | 'sug'>('sug');
  const shown = useMemo(() => {
    if (!all) return [];
    const n = norm(q);
    if (n) return all.filter((e) => norm(e.label).includes(n) || e.tags?.some((t) => norm(t).includes(n))).slice(0, 240);
    return group === 'sug' ? [] : all.filter((e) => e.group === group);
  }, [all, q, group]);
  const cell = (e: string, label?: string) => (
    <button key={e} type="button" title={label} onClick={() => onPick(e)} className={`rounded-lg py-1 text-xl leading-none hover:bg-white/[0.08] ${e === value ? 'bg-white/[0.1]' : ''}`}>{e}</button>
  );
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1.5 ring-1 ring-white/10 focus-within:ring-sky-400/50">
        <Search className="h-4 w-4 text-zinc-500" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: ducha, ropa, cohete…" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500" />
      </label>
      {!q && (
        <div className="flex gap-0.5 overflow-x-auto pb-0.5">
          <button type="button" onClick={() => setGroup('sug')} data-help="Sugeridos" className={`shrink-0 rounded-lg px-1.5 py-1 text-base ${group === 'sug' ? 'bg-white/[0.12]' : 'hover:bg-white/[0.06]'}`}>⭐</button>
          {GROUPS.map((g) => <button key={g.id} type="button" onClick={() => setGroup(g.id)} data-help={g.label} className={`shrink-0 rounded-lg px-1.5 py-1 text-base ${group === g.id ? 'bg-white/[0.12]' : 'hover:bg-white/[0.06]'}`}>{g.emoji}</button>)}
        </div>
      )}
      <div className="max-h-64 overflow-y-auto pr-0.5">
        {!q && group === 'sug' ? (
          SUGGESTED.map((g) => (
            <div key={g.label} className="mb-1.5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.label}</p>
              <div className="grid grid-cols-7 gap-0.5">{g.list.map((e) => cell(e))}</div>
            </div>
          ))
        ) : !all ? (
          <p className="flex items-center gap-2 py-6 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Cargando todos los emojis…</p>
        ) : shown.length ? (
          <>
            {!q && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{GROUPS.find((g) => g.id === group)?.label}</p>}
            <div className="grid grid-cols-7 gap-0.5">{shown.map((e) => cell(e.unicode, e.label))}</div>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-zinc-400">No encontré «{q}». Prueba otra palabra o créalo con IA ✨</p>
        )}
      </div>
    </div>
  );
};

const AITab: React.FC<{ title: string; onPick: (url: string) => void }> = ({ title, onPick }) => {
  const [what, setWhat] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    authFetch(cloudAI('/api/organiza/cover')).then(async (r) => {
      if (r.ok) {
        const q = await r.json();
        setLeft(Math.max(0, q.limit - q.used));
      }
    }).catch(() => {});
  }, []);
  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await authFetch(cloudAI('/api/organiza/cover'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: APP.slug, kind: 'icon', title: what }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el ícono.');
      setResult(data.url);
      setLeft(Math.max(0, data.limit - data.used));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el ícono.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">¿Qué ícono quieres?</span>
        <div className="relative">
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Ej.: logo de Claude, una pesa dorada" className="w-full rounded-lg bg-white/[0.05] py-1.5 pl-2.5 pr-10 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50" />
          <MicButton onText={(t) => setWhat((x) => (x.trim() ? `${x.trim()} ${t}` : t))} className="absolute right-1 top-1/2 -translate-y-1/2" />
        </div>
      </label>
      <button type="button" disabled={busy || !what.trim() || left === 0} onClick={create} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-fuchsia-500 py-2 text-sm font-semibold text-[#fff] disabled:opacity-50">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando… (unos 20 segundos)</> : <><Sparkles className="h-4 w-4" /> {result ? 'Crear otro' : 'Crear ícono'}</>}
      </button>
      {result && (
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2 ring-1 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result} alt="Ícono creado" className="h-16 w-16 rounded-2xl object-cover" />
          <button type="button" onClick={() => onPick(result)} className="flex-1 rounded-xl bg-sky-600 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500">Usar este</button>
        </div>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <p className="text-[11px] leading-snug text-zinc-500">Usa el mismo cupo que las portadas{left !== null ? ` (te quedan ${left} este mes)` : ''}. Los logos de marcas la IA los dibuja parecidos, no exactos: si quieres el original, súbelo en 📎.</p>
    </div>
  );
};

const UploadTab: React.FC<{ onPick: (url: string) => void }> = ({ onPick }) => {
  const { userId } = useSpace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file: File) => {
    if (!userId) return;
    setBusy(true);
    setError('');
    try {
      const { blob, ext } = await compressImageForNote(file, 256);
      const path = `${userId}/organiza/icons/${Date.now()}.${ext}`;
      const { error: up } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type });
      if (up) throw up;
      onPick(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
    } catch {
      setError('No se pudo subir la imagen. Inténtalo otra vez.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl bg-white/[0.04] px-3 py-6 text-center text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.07]">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />} Subir una imagen
        <span className="text-xs font-normal text-zinc-500">Un logo o dibujo; mejor si es cuadrado</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  );
};

/** Botón con el ícono de la acción; al tocarlo: Emojis · Crear con IA · Subir. */
export const IconPicker: React.FC<{ value: string; title: string; onChange: (v: string) => void }> = ({ value, title, onChange }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'emoji' | 'ia' | 'subir'>('emoji');
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Cambiar ícono" data-help="Cambiar ícono" className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white/[0.05] text-2xl ring-1 ring-white/10 transition hover:bg-white/[0.09]">
        <ItemIcon value={value} className={isImageIcon(value) ? '!h-9 !w-9' : ''} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-80 max-w-[calc(100vw-2rem)] space-y-2.5 rounded-2xl bg-[#1b1e24]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-white/10">
              {([['emoji', '😀 Emojis'], ['ia', '✨ Con IA'], ['subir', '📎 Subir']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-lg px-1.5 py-1.5 text-xs font-semibold ${tab === id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>{label}</button>
              ))}
            </div>
            {tab === 'emoji' && <EmojiTab value={value} onPick={pick} />}
            {tab === 'ia' && <AITab title={title} onPick={pick} />}
            {tab === 'subir' && <UploadTab onPick={pick} />}
          </div>
        </>
      )}
    </div>
  );
};
