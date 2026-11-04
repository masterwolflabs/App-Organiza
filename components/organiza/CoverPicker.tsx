'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, Mic, PenLine, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { MicButton, useDictation } from '@/components/organiza/DayAdjust';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { cloudAI } from '@/lib/aiClient';
import { APP } from '@/app.config';
import { useSpace } from '@/components/organiza/space';
import { compressImageForNote } from '@/utils/image';
import { COVERS, RANKS } from '@/components/organiza/model';
import { useUnsaved } from '@/components/organiza/UnsavedGuard';

/**
 * Portadas (Emanuel, 2026-11-03) — el sistema de portadas de todo el ecosistema, partiendo en Organiza:
 * ✨ crea tu portada con IA (con o sin tu avatar, en un estilo) · 🌈 degradado propio (automático o
 * manual) · 🎨 colores (pocos) · 📷 tu foto. Las de IA y el avatar viven en App Master Cloud.
 */
type Tab = 'colores' | 'degradado' | 'ia' | 'foto';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ia', label: '✨ Crea la tuya' },
  { id: 'degradado', label: '🌈 Degradado' },
  { id: 'colores', label: '🎨 Colores' },
  { id: 'foto', label: '📷 Tu foto' },
];

export const CoverPicker: React.FC<{ value: string | null; rank: number; title?: string; onPick: (cover: string | null) => void }> = ({ value, rank, title = '', onPick }) => {
  const [tab, setTab] = useState<Tab>('ia');
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex-1 shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${tab === t.id ? 'bg-white/[0.12] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'colores' && <Colors value={value} rank={rank} onPick={onPick} />}
      {tab === 'degradado' && <Gradient onPick={onPick} />}
      {tab === 'ia' && <AICover title={title} onPick={onPick} />}
      {tab === 'foto' && <Photo onPick={onPick} />}
      {value && <button type="button" onClick={() => onPick(null)} className="text-sm font-semibold text-zinc-400 hover:text-white">Quitar portada</button>}
    </div>
  );
};

/* ── 🎨 Colores: dos listos + los que se ganan en la Ruta ─────────────── */

const Colors: React.FC<{ value: string | null; rank: number; onPick: (c: string) => void }> = ({ value, rank, onPick }) => {
  const base = COVERS.filter((c) => c.rank === 0).slice(0, 2);
  const earned = COVERS.filter((c) => c.rank > 0);
  const swatch = (c: (typeof COVERS)[number]) => {
    const locked = c.rank > rank;
    return (
      <button key={c.id} type="button" disabled={locked} onClick={() => onPick(c.id)} data-help={locked ? `Se gana en rango ${RANKS[c.rank].name}` : undefined} className={`relative flex h-14 items-end rounded-xl p-2 text-left text-xs font-semibold text-[#fff] ${value === c.id ? 'ring-2 ring-white' : ''} ${locked ? 'opacity-40' : ''}`} style={{ background: c.css }}>
        {c.label}
        {locked && <Lock className="absolute right-2 top-2 h-3.5 w-3.5" />}
      </button>
    );
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">{base.map(swatch)}</div>
      <p className="text-xs font-semibold text-zinc-500">Las que ganas en tu Ruta</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{earned.map(swatch)}</div>
    </div>
  );
};

/* ── 🌈 Degradado: automático (un color) o manual (2 a 4 colores y ángulo) ── */

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(Math.min(90, Math.max(8, l)))}%)`;
/** Del color elegido salen los otros: se corre el tono y se oscurece, como en Canva. */
const autoGradient = (hex: string) => {
  const [h, s, l] = hexToHsl(hex);
  return `linear-gradient(135deg, ${hex}, ${hsl(h + 18, s, l - 12)} 55%, ${hsl(h + 36, s * 0.9, l - 28)})`;
};

const Gradient: React.FC<{ onPick: (c: string) => void }> = ({ onPick }) => {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [one, setOne] = useState('#f97316');
  const [stops, setStops] = useState(['#0ea5e9', '#7c3aed']);
  const [angle, setAngle] = useState(135);
  const css = mode === 'auto' ? autoGradient(one) : `linear-gradient(${angle}deg, ${stops.join(', ')})`;
  // Si armaste un degradado y cierras sin «Usar», la ventana pregunta si lo guardas.
  const [touched, setTouched] = useState(false);
  useUnsaved(touched, () => onPick(css));
  return (
    <div className="space-y-3" onChangeCapture={() => setTouched(true)} onClickCapture={(e) => (e.target as HTMLElement).closest('button')?.textContent?.includes('Color') && setTouched(true)}>
      <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10">
        {(['auto', 'manual'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold ${mode === m ? 'bg-white/[0.12] text-white' : 'text-zinc-400'}`}>{m === 'auto' ? 'Automático' : 'Manual'}</button>
        ))}
      </div>
      <div className="h-20 rounded-xl ring-1 ring-white/10" style={{ background: css }} />
      {mode === 'auto' ? (
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input type="color" value={one} onChange={(e) => setOne(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg bg-transparent" />
          Elige un color y la app arma el degradado.
        </label>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {stops.map((c, i) => (
              <span key={i} className="relative">
                <input type="color" value={c} onChange={(e) => setStops((s) => s.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Color ${i + 1}`} className="h-10 w-12 cursor-pointer rounded-lg bg-transparent" />
                {stops.length > 2 && <button type="button" aria-label="Quitar color" onClick={() => setStops((s) => s.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-700 p-0.5 text-[#fff]"><X className="h-3 w-3" /></button>}
              </span>
            ))}
            {stops.length < 4 && <button type="button" onClick={() => setStops((s) => [...s, '#22c55e'])} className="inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-sky-300 ring-1 ring-white/10 hover:bg-white/[0.05]"><Plus className="h-4 w-4" /> Color</button>}
          </div>
          <label className="flex items-center gap-3 text-xs text-zinc-400">Ángulo <input type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="flex-1 accent-sky-500" /> {angle}°</label>
        </div>
      )}
      <button type="button" onClick={() => { setTouched(false); onPick(css); }} className="w-full rounded-xl bg-sky-600 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500">Usar este degradado</button>
    </div>
  );
};

/* ── ✨ Portada con IA (con o sin avatar) ─────────────────────────────── */

const STYLES = [
  { id: 'minecraft', label: '🧱 Minecraft' },
  { id: 'realista', label: '📸 Realista exitoso' },
  { id: 'militar', label: '🎖️ Militar' },
  { id: 'anime', label: '🌸 Anime' },
  { id: 'animado', label: '🎬 Animado 3D' },
  { id: 'acuarela', label: '🖌️ Acuarela' },
];

type Quota = { used: number; limit: number; avatar: number };

const AICover: React.FC<{ title: string; onPick: (c: string) => void }> = ({ title, onPick }) => {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [withAvatar, setWithAvatar] = useState<boolean | null>(null);
  const [settingAvatar, setSettingAvatar] = useState(false);
  const [style, setStyle] = useState('minecraft');
  const [what, setWhat] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  // «Modificar» (Emanuel, 2026-11-04): pedir un cambio a la portada recién creada, escrito o hablado.
  const [editing, setEditing] = useState(false);
  const [change, setChange] = useState('');
  const mic = useDictation((t) => setChange((x) => (x.trim() ? `${x.trim()} ${t}` : t)));

  const load = useCallback(async () => {
    try {
      const res = await authFetch(cloudAI('/api/organiza/cover'));
      if (res.ok) setQuota(await res.json());
    } catch {
      /* sin conexión: se ve al intentar crear */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const left = quota ? Math.max(0, quota.limit - quota.used) : null;
  const create = async (edit?: { from: string; change: string }) => {
    setBusy(true);
    setError('');
    if (!edit) setResult(null);
    try {
      const res = await authFetch(cloudAI('/api/organiza/cover'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: APP.slug, title: what, style, withAvatar: withAvatar === true, ...(edit ? { editFrom: edit.from, change: edit.change } : {}) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la portada.');
      setResult(data.url);
      if (edit) {
        setEditing(false);
        setChange('');
      }
      setQuota((q) => (q ? { ...q, used: data.used ?? q.used + 1 } : q));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la portada.');
    } finally {
      setBusy(false);
    }
  };

  if (settingAvatar) return <AvatarSetup onDone={() => { setSettingAvatar(false); load(); }} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-amber-500/15 to-fuchsia-500/15 px-3 py-2 ring-1 ring-amber-400/25">
        <span className="text-sm font-semibold text-amber-200"><Sparkles className="mr-1 inline h-4 w-4" />Versión Pro · pruébala</span>
        <span className="text-xs text-zinc-300">{left === null ? '…' : `Te quedan ${left} de ${quota!.limit} este mes`}</span>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-400">¿Con tu avatar?</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setWithAvatar(true); if (quota && !quota.avatar) setSettingAvatar(true); }} className={`rounded-xl p-3 text-left ring-1 ${withAvatar === true ? 'bg-sky-600/20 ring-sky-400/60' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.07]'}`}>
            <b className="block text-sm font-semibold text-white">🧑 Con mi avatar</b>
            <span className="text-xs text-zinc-400">{quota?.avatar ? `Usa tus ${quota.avatar} fotos` : 'Sube tus fotos una vez'}</span>
          </button>
          <button type="button" onClick={() => setWithAvatar(false)} className={`rounded-xl p-3 text-left ring-1 ${withAvatar === false ? 'bg-sky-600/20 ring-sky-400/60' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.07]'}`}>
            <b className="block text-sm font-semibold text-white">🎨 Sin avatar</b>
            <span className="text-xs text-zinc-400">Una persona cualquiera</span>
          </button>
        </div>
        {withAvatar === true && quota?.avatar ? <button type="button" onClick={() => setSettingAvatar(true)} className="mt-1.5 text-xs font-semibold text-sky-300 hover:text-sky-200">Cambiar mis fotos</button> : null}
      </div>

      {withAvatar !== null && (
        <>
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-400">Elige el estilo</p>
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((s) => (
                <button key={s.id} type="button" onClick={() => setStyle(s.id)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${style === s.id ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`}>{s.label}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-400">¿Qué se ve en la portada?</span>
            <div className="relative">
              <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Ej.: levantándome temprano con el sol" className="w-full rounded-lg bg-white/[0.05] py-1.5 pl-2.5 pr-10 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50" />
              <MicButton onText={(t) => setWhat((x) => (x.trim() ? `${x.trim()} ${t}` : t))} className="absolute right-1 top-1/2 -translate-y-1/2" />
            </div>
          </label>
          <button type="button" disabled={busy || left === 0} onClick={() => create()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-fuchsia-500 py-2.5 text-sm font-semibold text-[#fff] disabled:opacity-50">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando tu portada… (unos 30 segundos)</> : <><Sparkles className="h-4 w-4" /> Crear portada</>}
          </button>
        </>
      )}

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {result && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="relative">
            <img src={result} alt="Portada creada" className={`aspect-[3/2] w-full rounded-xl object-cover ring-1 ring-white/10 transition ${busy ? 'opacity-50 blur-[2px]' : ''}`} />
            {busy && <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-[#fff]"><Loader2 className="h-5 w-5 animate-spin" /> Aplicando tu cambio…</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => onPick(result)} className="flex-1 rounded-xl bg-sky-600 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-50">Usar esta</button>
            <button type="button" disabled={busy || left === 0} onClick={() => setEditing((v) => !v)} aria-pressed={editing} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold ring-1 disabled:opacity-50 ${editing ? 'bg-fuchsia-600 text-[#fff] ring-fuchsia-500' : 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/30 hover:bg-fuchsia-500/25'}`}><PenLine className="h-4 w-4" /> Modificar</button>
            <button type="button" disabled={busy || left === 0} onClick={() => create()} className="flex-1 rounded-xl bg-white/[0.06] py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 disabled:opacity-50">Crear otra</button>
          </div>
          {editing && (
            <div className="space-y-2 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-fuchsia-400/25">
              <textarea autoFocus value={change} onChange={(e) => setChange(e.target.value)} rows={2} placeholder="¿Qué le cambio? Ej.: que sea de noche, agrega mi perro, que tenga lentes" className="w-full resize-none rounded-lg bg-white/[0.05] px-2.5 py-2 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-fuchsia-400/50" />
              <div className="flex gap-2">
                {mic.ok && <button type="button" onClick={mic.toggle} aria-pressed={mic.on} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${mic.on ? 'animate-pulse bg-rose-600 text-[#fff]' : 'bg-white/[0.08] text-zinc-200 hover:bg-white/[0.14]'}`}><Mic className="h-4 w-4" /> {mic.on ? 'Escuchando…' : 'Hablar'}</button>}
                <button type="button" disabled={busy || !change.trim()} onClick={() => create({ from: result, change: change.trim() })} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-fuchsia-500 py-1.5 text-sm font-semibold text-[#fff] disabled:opacity-50"><Sparkles className="h-4 w-4" /> Aplicar cambio</button>
              </div>
              <p className="text-[11px] text-zinc-500">Cuenta como 1 portada del mes.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Avatar: hasta 5 fotos en la nube, privadas (carpeta ai-avatars/<tu id>/). Sirven en todas las apps. */
const AvatarSetup: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { userId } = useSpace();
  const [photos, setPhotos] = useState<{ name: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.storage.from('ai-avatars').list(userId, { limit: 5 });
    const files = (data ?? []).filter((f) => !f.name.startsWith('.'));
    const signed = await Promise.all(files.map(async (f) => ({ name: f.name, url: (await supabase.storage.from('ai-avatars').createSignedUrl(`${userId}/${f.name}`, 600)).data?.signedUrl ?? '' })));
    setPhotos(signed);
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (files: FileList) => {
    if (!userId) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, 5 - photos.length))) {
        const { blob, ext } = await compressImageForNote(file, 1024);
        const { error: up } = await supabase.storage.from('ai-avatars').upload(`${userId}/${Date.now()}.${ext}`, blob, { contentType: blob.type });
        if (up) throw up;
      }
      await load();
    } catch {
      setError('No se pudo subir una foto. Inténtalo otra vez.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (name: string) => {
    if (!userId) return;
    await supabase.storage.from('ai-avatars').remove([`${userId}/${name}`]);
    await load();
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-semibold text-white">🧑 Tu avatar</h4>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">Sube hasta <b className="text-zinc-200">5 fotos tuyas</b>: cara bien visible, buena luz, distintos ángulos. Se guardan <b className="text-zinc-200">en la nube y privadas</b> (solo tú las ves) y sirven para tus portadas en todas las apps.</p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {photos.map((p) => (
          <span key={p.name} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="Foto del avatar" className="aspect-square w-full rounded-lg object-cover ring-1 ring-white/10" />
            <button type="button" aria-label="Quitar foto" onClick={() => remove(p.name)} className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-700 p-0.5 text-[#fff] hover:bg-rose-500"><Trash2 className="h-3 w-3" /></button>
          </span>
        ))}
        {photos.length < 5 && (
          <label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/20 text-zinc-400 hover:bg-white/[0.05]">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
          </label>
        )}
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button type="button" disabled={!photos.length} onClick={onDone} className="w-full rounded-xl bg-sky-600 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-50">Listo, sincronizado con la nube</button>
    </div>
  );
};

/* ── 📷 Tu foto ───────────────────────────────────────────────────────── */

const Photo: React.FC<{ onPick: (c: string) => void }> = ({ onPick }) => {
  const { userId } = useSpace();
  const [error, setError] = useState('');
  const upload = async (file: File) => {
    setError('');
    if (!userId) return;
    try {
      const { blob, ext } = await compressImageForNote(file, 1600);
      const path = `${userId}/organiza/${Date.now()}.${ext}`;
      const { error: up } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type });
      if (up) throw up;
      onPick(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
    } catch {
      setError('No se pudo subir la foto. Inténtalo otra vez.');
    }
  };
  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl bg-white/[0.04] px-3 py-6 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.07]">
        <Upload className="h-5 w-5" /> Subir una foto
        <span className="text-xs font-normal text-zinc-500">Se recorta sola para la portada</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
};
