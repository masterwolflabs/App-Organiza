'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, PenLine, Send, Undo2 } from 'lucide-react';
import { APP } from '@/app.config';
import { authFetch } from '@/lib/authFetch';
import { cloudAI } from '@/lib/aiClient';
import { toMinutes, type Item } from '@/components/organiza/model';
import type { DayPlan, Extra, Moves } from '@/components/organiza/dayPlan';

/**
 * Después de reacomodar un día (Emanuel, 2026-11-04): «¿Te gustó el cambio?». Me gusta lo cierra,
 * Deshacer vuelve atrás y Modificar abre un cuadro para escribir o dictar lo que falta
 * («me falta bañarme y elegir la ropa») y la IA rehace el día.
 */
export type Line = { text: string; tone: 'move' | 'off' | 'lock' | 'add' };
type Occ = { ev: { title: string; all_day: boolean }; start: Date; end: Date };

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Le pide a la IA el día rehecho y lo devuelve listo para guardar en el plan de ese día. */
export async function adjustDayAI(args: { dayLabel: string; items: Item[]; events: Occ[]; plan: DayPlan | null; request: string }) {
  const { items, events, plan } = args;
  const extras = plan?.extras ?? [];
  const now = (i: Item) => plan?.moves?.[i.id]?.time ?? i.time;
  const res = await authFetch(cloudAI('/api/organiza/adjust-day'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app: APP.slug,
      dayLabel: args.dayLabel,
      request: args.request,
      events: events.filter((e) => !e.ev.all_day).map((e) => ({ title: e.ev.title, start: hhmm(e.start), end: hhmm(e.end) })),
      items: [
        ...items.map((i) => ({ id: i.id, title: i.title, time: now(i), minutes: i.minutes, flex: i.flex, off: !!plan?.moves?.[i.id]?.off })),
        ...extras.map((x) => ({ id: x.id, title: x.title, time: x.time, minutes: x.minutes, flex: 'flexible', off: false })),
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No pude rehacer el día. Intenta de nuevo.');
  const out = data as { items: { id: string; time: string; off: boolean }[]; extras: { title: string; time: string; minutes: number }[]; summary: string };

  const moves: Moves = {};
  const lines: Line[] = [];
  for (const i of items) {
    const r = out.items.find((x) => x.id === i.id);
    if (!r) {
      if (plan?.moves?.[i.id]) moves[i.id] = plan.moves[i.id];
      continue;
    }
    if (r.off) moves[i.id] = { off: true };
    else if (r.time !== i.time) moves[i.id] = { time: r.time };
    const was = plan?.moves?.[i.id];
    if (r.off && !was?.off) lines.push({ text: `${i.title}: se aplaza este día`, tone: 'off' });
    else if (!r.off && r.time !== now(i)) lines.push({ text: `${i.title} → ${r.time}`, tone: 'move' });
  }
  const kept: Extra[] = [];
  for (const x of extras) {
    const r = out.items.find((y) => y.id === x.id);
    if (r?.off) lines.push({ text: `${x.title}: se quita`, tone: 'off' });
    else kept.push(r ? { ...x, time: r.time } : x);
  }
  for (const x of out.extras) {
    kept.push({ id: `x:${crypto.randomUUID()}`, ...x });
    lines.push({ text: `${x.title} a las ${x.time} (${x.minutes} min)`, tone: 'add' });
  }
  kept.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  return { moves, extras: kept, lines, summary: out.summary };
}

/** Dictado con el micrófono del navegador (es-CL). `null` si el navegador no lo tiene. */
export function useDictation(onText: (t: string) => void) {
  const rec = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [on, setOn] = useState(false);
  const [ok, setOk] = useState(false);
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => {
    const W = window as unknown as Record<string, unknown>;
    const SR = (W.SpeechRecognition || W.webkitSpeechRecognition) as (new () => Record<string, unknown> & { start: () => void; stop: () => void }) | undefined;
    if (!SR) return;
    const r = new SR();
    r.lang = 'es-CL';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => {
      let t = '';
      for (let k = e.resultIndex; k < e.results.length; k++) if (e.results[k].isFinal) t += e.results[k][0].transcript;
      if (t.trim()) cb.current(t.trim());
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    setOk(true);
    return () => r.stop();
  }, []);
  const toggle = () => {
    if (!rec.current) return;
    if (on) rec.current.stop();
    else {
      rec.current.start();
      setOn(true);
    }
  };
  return { ok, on, toggle };
}

export const AdjustBox: React.FC<{ title: string; lines: Line[]; summary?: string; onLike: () => void; onUndo: () => void; onSend: (text: string) => Promise<void> }> = ({ title, lines, summary, onLike, onUndo, onSend }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mic = useDictation((t) => setText((x) => (x.trim() ? `${x.trim()} ${t}` : t)));
  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSend(text.trim());
      setText('');
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude rehacer el día.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-xl bg-[#17191f] p-2.5 text-xs ring-1 ring-sky-400/40">
      <p className="font-semibold text-white">{title}</p>
      {summary && <p className="text-zinc-300">{summary}</p>}
      {lines.length ? (
        <div className="space-y-0.5">
          {lines.map((l, k) => <p key={k} className={l.tone === 'lock' ? 'text-rose-200' : l.tone === 'off' ? 'text-zinc-400' : l.tone === 'add' ? 'text-emerald-200' : 'text-sky-200'}>{l.tone === 'lock' ? '🔒' : l.tone === 'off' ? '⏸️' : l.tone === 'add' ? '✨' : '↪'} {l.text}</p>)}
        </div>
      ) : null}
      <p className="pt-1 text-sm font-semibold text-white">¿Te gustó el cambio?</p>
      <div className="flex gap-1.5">
        <button type="button" onClick={onLike} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-1.5 font-semibold text-[#fff] hover:bg-emerald-500"><Check className="h-3.5 w-3.5" /> Me gusta</button>
        <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-sky-600 py-1.5 font-semibold text-[#fff] hover:bg-sky-500"><PenLine className="h-3.5 w-3.5" /> Modificar</button>
        <button type="button" onClick={onUndo} data-help="Vuelve a como estaba" aria-label="Deshacer" className="inline-flex items-center justify-center rounded-lg bg-white/[0.08] px-2 py-1.5 font-semibold text-zinc-200 hover:bg-white/[0.14]"><Undo2 className="h-3.5 w-3.5" /></button>
      </div>
      {editing && (
        <div className="space-y-1.5 pt-1">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send()}
            rows={3}
            placeholder="Ej: me falta bañarme y elegir la ropa, media hora antes de salir"
            className="w-full resize-none rounded-lg bg-white/[0.05] px-2.5 py-2 text-sm text-white ring-1 ring-white/10 placeholder:text-zinc-500 focus:outline-none focus:ring-sky-400/60"
          />
          <div className="flex gap-1.5">
            {mic.ok && (
              <button type="button" onClick={mic.toggle} aria-pressed={mic.on} data-help={mic.on ? 'Toca para dejar de escuchar' : 'Dícelo con tu voz'} className={`inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold ${mic.on ? 'animate-pulse bg-rose-600 text-[#fff]' : 'bg-white/[0.08] text-zinc-200 hover:bg-white/[0.14]'}`}>
                <Mic className="h-3.5 w-3.5" /> {mic.on ? 'Escuchando…' : 'Hablar'}
              </button>
            )}
            <button type="button" onClick={send} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-violet-600 py-1.5 font-semibold text-[#fff] hover:bg-violet-500 disabled:opacity-60">
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Rehaciendo…</> : <><Send className="h-3.5 w-3.5" /> Rehacer con IA</>}
            </button>
          </div>
          {error && <p className="text-rose-300">{error}</p>}
        </div>
      )}
    </div>
  );
};

/** Botón 🎤 para dictar dentro de un campo (se agrega a lo escrito). No aparece si el navegador no dicta. */
export const MicButton: React.FC<{ onText: (t: string) => void; className?: string }> = ({ onText, className = '' }) => {
  const mic = useDictation(onText);
  if (!mic.ok) return null;
  return (
    <button type="button" onClick={mic.toggle} aria-pressed={mic.on} aria-label={mic.on ? 'Dejar de escuchar' : 'Dictar con la voz'} data-help={mic.on ? 'Escuchando… toca para terminar' : 'Dícelo con tu voz'} className={`rounded-md p-1.5 ${mic.on ? 'animate-pulse bg-rose-600 text-[#fff]' : 'text-zinc-400 hover:bg-white/10 hover:text-white'} ${className}`}>
      <Mic className="h-4 w-4" />
    </button>
  );
};
