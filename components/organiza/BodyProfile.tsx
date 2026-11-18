'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, Camera, Eye, EyeOff, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { askNotifications, notify } from '@/components/organiza/notify';
import {
  fmt, fmtDay, isoDay, METRICS, nextCheck, photoUrls, useBodyLogs, VIEWS,
  type BodyApi, type BodyCheck, type BodyLog, type Draft, type Metric, type View,
} from '@/components/organiza/bodyData';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';

/**
 * 📏 Perfil físico de Workout Pro (Emanuel, 2026-11-18): registrar medidas y 3 fotos cada 15 días o cada mes,
 * ver el historial y comparar dos fechas. Las fotos son privadas y se muestran tapadas hasta que tocas «Ver».
 * Datos en `bodyData.ts`. Todavía no alimenta el modelo 3D ni analiza fotos.
 */

const field = 'w-full rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-red-400/60';
const KEY_METRICS: Metric[] = ['weight', 'waist', 'body_fat', 'muscle_mass', 'chest', 'arm', 'leg', 'hip'];

/* ── Foto privada ─────────────────────────────────────────────────────────────────── */

const Photo: React.FC<{ path?: string; local?: string | null; show: boolean; label: string; className?: string }> = ({ path, local, show, label, className = '' }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    if (path && show && !local) photoUrls([path]).then((u) => on && setUrl(u[path] ?? null));
    return () => { on = false; };
  }, [path, show, local]);
  const src = local ?? url;
  return (
    <div className={`theme-fixed relative overflow-hidden rounded-xl bg-[#0b0c10] ring-1 ring-white/10 ${className}`}>
      {src && show ? (
        <img src={src} alt={`Foto ${label}`} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[11px] text-[#71717a]">
          {path || local ? <><Lock className="h-4 w-4" /> Privada</> : <><Camera className="h-4 w-4" /> Sin foto</>}
        </span>
      )}
      <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-px text-[10px] font-semibold text-[#fff]">{label}</span>
    </div>
  );
};

/* ── Bloque en Workout Pro ────────────────────────────────────────────────────────── */

export const BodyProfileBlock: React.FC = () => {
  const api = useBodyLogs();
  const [form, setForm] = useState<BodyLog | 'new' | null>(null);
  const [history, setHistory] = useState(false);
  const [settings, setSettings] = useState(false);
  const last = api.logs[0];
  const prev = api.logs[1];
  const nc = nextCheck(api.logs, api.check);
  const shown = KEY_METRICS.filter((m) => last?.[m] !== null && last?.[m] !== undefined).slice(0, 4);

  return (
    <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-display text-xl font-semibold text-white">📏 Tu perfil físico</h2>
        <button type="button" onClick={() => setSettings((v) => !v)} aria-label="Frecuencia y recordatorio" data-help="Frecuencia y recordatorio" className={`rounded-xl p-2 ring-1 ring-white/10 hover:bg-white/[0.08] ${settings ? 'bg-white/[0.08] text-white' : 'text-zinc-400'}`}>
          {api.check.remind ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => setForm('new')} className="inline-flex items-center gap-1 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold text-[#fff] hover:bg-red-400"><Plus className="h-3.5 w-3.5" /> Registrar</button>
      </div>

      {settings && <CheckSettings check={api.check} onSave={api.saveCheck} />}

      {!api.ready ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : !last ? (
        <button type="button" onClick={() => setForm('new')} className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center hover:bg-white/[0.03]">
          <span className="text-3xl">📸</span>
          <span className="text-sm font-semibold text-white">Haz tu primer registro</span>
          <span className="text-xs text-zinc-400">Peso, medidas y 3 fotos. Cada {api.check.every === 15 ? '15 días' : 'mes'} verás tu evolución.</span>
        </button>
      ) : (
        <>
          <div className={`mb-3 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ${nc.due ? 'bg-red-500/10 text-red-200 ring-red-400/40' : 'bg-white/[0.03] text-zinc-400 ring-white/10'}`}>
            {nc.due ? `📸 Te toca registrar (cada ${api.check.every === 15 ? '15 días' : 'mes'})` : `Próximo registro: ${nc.next!.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · en ${nc.days} ${nc.days === 1 ? 'día' : 'días'}`}
            <span className="font-normal opacity-80"> · último: {fmtDay(last.day)}</span>
          </div>
          {shown.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {shown.map((m) => {
                const meta = METRICS.find((x) => x.id === m)!;
                const now = last[m] as number;
                const before = prev?.[m];
                const diff = typeof before === 'number' ? +(now - before).toFixed(1) : null;
                return (
                  <div key={m} className="rounded-xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/10">
                    <p className="text-[11px] text-zinc-400">{meta.label}</p>
                    <p className="font-display text-lg font-semibold text-white">{fmt(now, meta.unit)}</p>
                    {diff !== null && diff !== 0 && <p className="text-[11px] tabular-nums text-zinc-400">{diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff), meta.unit)} vs anterior</p>}
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" onClick={() => setHistory(true)} className="w-full rounded-xl bg-white/[0.06] py-2 text-xs font-bold text-zinc-100 ring-1 ring-white/10 hover:bg-white/[0.1]">📜 Historial y comparar ({api.logs.length} {api.logs.length === 1 ? 'registro' : 'registros'})</button>
        </>
      )}

      {form && <LogForm api={api} log={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {history && <History api={api} onEdit={(l) => { setHistory(false); setForm(l); }} onClose={() => setHistory(false)} />}
    </section>
  );
};

const CheckSettings: React.FC<{ check: BodyCheck; onSave: (c: BodyCheck) => void }> = ({ check, onSave }) => (
  <div className="mb-3 space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
    <p className="text-xs font-semibold text-zinc-300">¿Cada cuánto registras?</p>
    <div className="flex gap-2">
      {([15, 30] as const).map((n) => (
        <button key={n} type="button" onClick={() => onSave({ ...check, every: n })} className={`flex-1 rounded-xl py-2 text-sm font-semibold ring-1 ${check.every === n ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`}>{n === 15 ? 'Cada 15 días' : 'Mensual'}</button>
      ))}
    </div>
    <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
      Recordarme cuando toque
      <input type="checkbox" checked={check.remind} onChange={async (e) => { const on = e.target.checked; if (on) await askNotifications(); onSave({ ...check, remind: on }); }} className="h-4 w-4 accent-red-500" />
    </label>
    <p className="text-[11px] text-zinc-500">El aviso llega como notificación cuando abres Master Planner ese día, y aquí verás «Te toca registrar».</p>
  </div>
);

/* ── Registrar / corregir ─────────────────────────────────────────────────────────── */

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

const LogForm: React.FC<{ api: BodyApi; log: BodyLog | null; onClose: () => void }> = ({ api, log, onClose }) => {
  const last = api.logs[0];
  const [day, setDay] = useState(log?.day ?? isoDay());
  const [notes, setNotes] = useState(log?.notes ?? '');
  // Al registrar uno nuevo, la estatura y la edad vienen de tu registro anterior (son tuyas; puedes cambiarlas).
  const [vals, setVals] = useState<Partial<Record<Metric, string>>>(() =>
    Object.fromEntries(METRICS.map((m) => [m.id, log ? (log[m.id] ?? '') + '' : (m.id === 'height' || m.id === 'age') && last?.[m.id] != null ? String(last[m.id]) : ''])),
  );
  const [photos, setPhotos] = useState<Partial<Record<View, File | 'keep' | null>>>(() => Object.fromEntries(VIEWS.map((v) => [v.id, log?.photos?.[v.id] ? 'keep' : undefined])));
  const [local, setLocal] = useState<Partial<Record<View, string>>>({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputs = useRef<Partial<Record<View, HTMLInputElement | null>>>({});
  useEffect(() => () => Object.values(local).forEach((u) => u && URL.revokeObjectURL(u)), [local]);

  const bad = METRICS.filter((m) => {
    const n = num(vals[m.id] ?? '');
    return n !== null && (Number.isNaN(n) || n < m.min || n > m.max);
  });
  const hasData = METRICS.some((m) => num(vals[m.id] ?? '') !== null) || VIEWS.some((v) => photos[v.id] instanceof File || photos[v.id] === 'keep');

  const pick = (v: View, f: File | null) => {
    if (!f) return;
    setPhotos((p) => ({ ...p, [v]: f }));
    setLocal((l) => ({ ...l, [v]: URL.createObjectURL(f) }));
    setShow(true);
  };
  const save = async () => {
    setBusy(true);
    setErr('');
    const draft: Draft = { day, notes, values: Object.fromEntries(METRICS.map((m) => [m.id, num(vals[m.id] ?? '')])), photos };
    const e = await api.save(draft, log?.id);
    setBusy(false);
    if (e) setErr(e);
    else onClose();
  };

  const group = (g: 'base' | 'medidas' | 'composicion', title: string, sub?: string) => (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      {sub && <p className="text-[11px] text-zinc-500">{sub}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {METRICS.filter((m) => m.group === g).map((m) => {
          const wrong = bad.includes(m);
          const before = !log && last?.[m.id] != null && m.id !== 'height' && m.id !== 'age' ? `antes ${fmt(last[m.id] as number, m.unit)}` : '';
          return (
            <label key={m.id} className="block text-xs text-zinc-400" data-help={m.help}>
              {m.label}
              <span className="relative mt-1 block">
                <input inputMode="decimal" value={vals[m.id] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [m.id]: e.target.value }))} placeholder={before || '—'} aria-label={`${m.label} (${m.unit})`} className={`${field} pr-12 ${wrong ? 'ring-rose-400/70' : ''}`} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">{m.unit}</span>
              </span>
              {m.help && <span className="mt-0.5 block text-[10px] text-zinc-600">{m.help}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
        <div role="dialog" aria-label={log ? 'Corregir registro' : 'Nuevo registro'} onClick={(e) => e.stopPropagation()} className="flex h-full w-full flex-col overflow-hidden bg-[#14161b] ring-1 ring-white/10 sm:h-auto sm:max-h-[94vh] sm:max-w-2xl sm:rounded-3xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <p className="flex-1 font-display text-lg font-semibold text-white">{log ? '✏️ Corregir registro' : '📏 Nuevo registro'}</p>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <label className="block max-w-[220px] text-xs text-zinc-400">Fecha<input type="date" value={day} max={isoDay()} onChange={(e) => setDay(e.target.value || isoDay())} className={`${field} mt-1`} /></label>
            {group('base', 'Datos básicos', !log && last ? 'Estatura y edad vienen de tu registro anterior; cámbialas si corresponde.' : undefined)}
            {group('medidas', 'Medidas', 'Con huincha, en centímetros. Todas opcionales.')}
            {group('composicion', 'Composición corporal (opcional)', 'Solo si tienes una medición. Si no, déjalo vacío: no se estima nada.')}
            <div>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-semibold text-white">📸 Fotos</p>
                <button type="button" onClick={() => setShow((s) => !s)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-400 hover:bg-white/[0.06]">{show ? <><EyeOff className="h-3.5 w-3.5" /> Tapar</> : <><Eye className="h-3.5 w-3.5" /> Ver</>}</button>
              </div>
              <p className="text-[11px] text-zinc-500">Privadas: solo tú las ves. Misma luz, misma distancia y misma pose cada vez para comparar mejor.</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {VIEWS.map((v) => {
                  const p = photos[v.id];
                  const has = p instanceof File || p === 'keep';
                  return (
                    <div key={v.id} className="space-y-1">
                      <button type="button" onClick={() => inputs.current[v.id]?.click()} className="block w-full" aria-label={`Foto ${v.label}`}>
                        <Photo path={p === 'keep' ? log?.photos?.[v.id] : undefined} local={p instanceof File ? local[v.id] : null} show={show} label={v.label} className="aspect-[3/4] w-full" />
                      </button>
                      <input ref={(el) => { inputs.current[v.id] = el; }} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(v.id, e.target.files?.[0] ?? null); e.target.value = ''; }} />
                      <div className="flex justify-center gap-1">
                        <button type="button" onClick={() => inputs.current[v.id]?.click()} className="rounded-lg px-2 py-0.5 text-[11px] font-semibold text-red-300 hover:bg-red-500/10">{has ? 'Cambiar' : '＋ Agregar'}</button>
                        {has && <button type="button" onClick={() => setPhotos((x) => ({ ...x, [v.id]: null }))} className="rounded-lg px-2 py-0.5 text-[11px] text-zinc-500 hover:text-rose-300">Quitar</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <label className="block text-xs text-zinc-400">Notas (opcional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ej.: medido en ayunas, después de una semana de vacaciones…" className={`${field} mt-1 resize-none`} /></label>
          </div>
          <div className="space-y-2 border-t border-white/10 px-4 py-3">
            {bad.length > 0 && <p className="text-xs text-amber-300">Revisa: {bad.map((m) => `${m.label} (${m.min}–${m.max} ${m.unit})`).join(', ')}</p>}
            {err && <p className="text-xs text-amber-300">{err}</p>}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-400 hover:bg-white/[0.06]">Cancelar</button>
              <span className="flex-1" />
              <button type="button" disabled={busy || !hasData || bad.length > 0} onClick={save} className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-[#fff] hover:bg-red-400 disabled:opacity-40">{busy ? 'Guardando…' : log ? 'Guardar cambios' : 'Guardar registro'}</button>
            </div>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Historial y comparar ─────────────────────────────────────────────────────────── */

const History: React.FC<{ api: BodyApi; onEdit: (l: BodyLog) => void; onClose: () => void }> = ({ api, onEdit, onClose }) => {
  const confirm = useConfirm();
  const logs = api.logs;
  const [a, setA] = useState(logs[logs.length - 1]?.id ?? '');
  const [b, setB] = useState(logs[0]?.id ?? '');
  const [show, setShow] = useState(false);
  const A = logs.find((l) => l.id === a);
  const B = logs.find((l) => l.id === b);
  const rows = useMemo(() => METRICS.filter((m) => A?.[m.id] != null || B?.[m.id] != null), [A, B]);
  const sel = (v: string, set: (s: string) => void, label: string) => (
    <label className="block flex-1 text-[11px] text-zinc-400">{label}
      <select value={v} onChange={(e) => set(e.target.value)} className={`${field} mt-1`}>
        {logs.map((l) => <option key={l.id} value={l.id}>{fmtDay(l.day)}</option>)}
      </select>
    </label>
  );
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
        <div role="dialog" aria-label="Historial del perfil físico" onClick={(e) => e.stopPropagation()} className="flex h-full w-full flex-col overflow-hidden bg-[#14161b] ring-1 ring-white/10 sm:h-auto sm:max-h-[94vh] sm:max-w-3xl sm:rounded-3xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <p className="flex-1 font-display text-lg font-semibold text-white">📜 Tu evolución</p>
            <button type="button" onClick={() => setShow((s) => !s)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/[0.06]">{show ? <><EyeOff className="h-3.5 w-3.5" /> Tapar fotos</> : <><Eye className="h-3.5 w-3.5" /> Ver fotos</>}</button>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {logs.length >= 2 ? (
              <section className="space-y-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold text-white">⚖️ Comparar dos fechas</p>
                <div className="flex gap-2">{sel(a, setA, 'Desde')}{sel(b, setB, 'Hasta')}</div>
                {A && B && (
                  <>
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] text-zinc-500"><th className="py-1 font-normal" /><th className="py-1 text-right font-normal">{fmtDay(A.day)}</th><th className="py-1 text-right font-normal">{fmtDay(B.day)}</th><th className="py-1 text-right font-normal">Cambio</th></tr></thead>
                      <tbody>
                        {rows.map((m) => {
                          const x = A[m.id];
                          const y = B[m.id];
                          const d = typeof x === 'number' && typeof y === 'number' ? +(y - x).toFixed(1) : null;
                          return (
                            <tr key={m.id} className="border-t border-white/5">
                              <td className="py-1.5 text-zinc-300">{m.label}</td>
                              <td className="py-1.5 text-right tabular-nums text-zinc-400">{fmt(x, m.unit)}</td>
                              <td className="py-1.5 text-right tabular-nums text-zinc-100">{fmt(y, m.unit)}</td>
                              <td className="py-1.5 text-right tabular-nums font-semibold text-zinc-200">{d === null ? '—' : d === 0 ? '=' : `${d > 0 ? '▲ +' : '▼ −'}${fmt(Math.abs(d), m.unit)}`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="space-y-2">
                      {VIEWS.filter((v) => A.photos?.[v.id] || B.photos?.[v.id]).map((v) => (
                        <div key={v.id} className="grid grid-cols-2 gap-2">
                          <Photo path={A.photos?.[v.id]} show={show} label={`${v.label} · ${fmtDay(A.day)}`} className="aspect-[3/4]" />
                          <Photo path={B.photos?.[v.id]} show={show} label={`${v.label} · ${fmtDay(B.day)}`} className="aspect-[3/4]" />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            ) : (
              <p className="rounded-2xl bg-white/[0.03] p-4 text-sm text-zinc-400 ring-1 ring-white/10">Con dos registros o más podrás comparar fechas aquí.</p>
            )}
            <section>
              <p className="mb-2 text-sm font-semibold text-white">Todos tus registros</p>
              <ul className="space-y-2">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{fmtDay(l.day, true)}</p>
                      <p className="truncate text-xs text-zinc-400">{METRICS.filter((m) => l[m.id] != null).map((m) => `${m.label} ${fmt(l[m.id] as number, m.unit)}`).join(' · ') || 'Solo fotos'}{Object.keys(l.photos ?? {}).length ? ` · 📸 ${Object.keys(l.photos).length}` : ''}</p>
                    </div>
                    <button type="button" aria-label="Corregir registro" onClick={() => onEdit(l)} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-200"><Pencil className="h-4 w-4" /></button>
                    <button type="button" aria-label="Borrar registro" onClick={async () => { if (await confirm({ title: `¿Borrar el registro del ${fmtDay(l.day)}?`, message: 'Se borran sus medidas y sus fotos. No se puede deshacer.', confirmLabel: 'Borrar', tone: 'danger' })) api.remove(l.id); }} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/[0.08] hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Recordatorio (montado en toda la app): una notificación el día que toca ─────────── */

export const BodyCheckReminder: React.FC = () => {
  const db = useDb();
  const { userId } = useSpace();
  useEffect(() => {
    if (!userId) return;
    const key = `wp-body-reminded:${userId}`;
    const today = isoDay();
    try {
      if (localStorage.getItem(key) === today) return;
    } catch {}
    (async () => {
      const [p] = await db.select<{ body_check?: Partial<BodyCheck> }>('organiza_prefs', { owner_id: userId });
      const check = { every: 15, remind: true, ...(p?.body_check ?? {}) } as BodyCheck;
      if (!check.remind) return;
      const logs = await db.select<BodyLog>('organiza_body_logs');
      if (!logs.length) return; // sin primer registro no se insiste: se invita en Workout Pro
      const nc = nextCheck(logs.sort((a, b) => (a.day < b.day ? 1 : -1)), check);
      if (!nc.due) return;
      try {
        localStorage.setItem(key, today);
      } catch {}
      notify('📏 Te toca registrar tu perfil físico', `Peso, medidas y fotos (cada ${check.every === 15 ? '15 días' : 'mes'}). Está en Workout Pro.`);
    })().catch(() => {});
  }, [db, userId]);
  return null;
};
