'use client';

import React, { useRef, useState } from 'react';
import { FileUp, Loader2, Trash2, X } from 'lucide-react';
import { APP } from '@/app.config';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { byTime, WEEK } from '@/components/organiza/model';
import { authFetch } from '@/lib/authFetch';
import { cloudAI } from '@/lib/aiClient';
import { prepareFile, type Prepared } from '@/utils/importFile';

export type ImportedItem = { weekday: number; time: string; minutes: number; title: string; icon: string; description: string };
type Question = { question: string; options: string[] };
type Result = { name: string; items: ImportedItem[]; questions: Question[]; unmatched: string };

/**
 * Importar un horario (Emanuel, 2026-11-02): foto, PDF, Excel, CSV, Markdown, texto o el ZIP de Notion.
 * La IA lo lee y pregunta lo que no esté claro; nada se crea hasta confirmar la vista previa, y nace en borrador.
 */
export const ImportHorario: React.FC<{ onClose: () => void; onCreate: (name: string, items: ImportedItem[]) => Promise<unknown> }> = ({ onClose, onCreate }) => {
  const [source, setSource] = useState<Prepared | null>(null);
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<{ question: string; answer: string }[]>([]);
  const [hover, setHover] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const read = async (prepared: Prepared, given: { question: string; answer: string }[]) => {
    setBusy(true);
    setError('');
    try {
      const res = await authFetch(cloudAI('/api/organiza/import-schedule'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...prepared, answers: given, app: APP.slug }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No pude leer ese horario. Intenta de nuevo.');
      setResult(data as Result);
      setAnswers({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude leer ese horario.');
    } finally {
      setBusy(false);
    }
  };
  const takeFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError('');
    setFileName(file.name);
    try {
      const prepared = await prepareFile(file);
      setSource(prepared);
      await read(prepared, []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude abrir ese archivo.');
      setBusy(false);
    }
  };
  const readText = () => {
    const prepared = { text };
    setSource(prepared);
    read(prepared, []);
  };
  const answerAll = () => {
    if (!result || !source) return;
    const given = [...saved, ...result.questions.map((q) => ({ question: q.question, answer: answers[q.question] ?? '' }))];
    setSaved(given);
    read(source, given);
  };
  const patch = (p: Partial<Result>) => setResult((r) => (r ? { ...r, ...p } : r));
  const create = async () => {
    if (!result) return;
    setBusy(true);
    await onCreate(result.name.trim() || 'Horario importado', result.items);
    setBusy(false);
    onClose();
  };

  const pending = result?.questions ?? [];
  const ready = pending.every((q) => (answers[q.question] ?? '').trim());
  const field = 'w-full rounded-xl bg-black/30 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-sky-500/60';

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="theme-fixed flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[#14161b] text-white ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="text-lg font-semibold">Importar horario</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {error && <p className="mb-3 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>}
            {busy && !result && (
              <p className="flex items-center gap-2 py-10 text-sm text-zinc-300"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo {fileName || 'tu horario'}…</p>
            )}
            {!busy && !result && (
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHover(true);
                  }}
                  onDragLeave={() => setHover(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setHover(false);
                    takeFile(e.dataTransfer.files[0]);
                  }}
                  onClick={() => input.current?.click()}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-10 text-center transition ${hover ? 'border-sky-400 bg-sky-500/10' : 'border-white/20 hover:bg-white/[0.04]'}`}
                >
                  <FileUp className="h-6 w-6 text-zinc-400" />
                  <p className="text-sm font-semibold">Arrastra tu horario aquí o haz clic para elegirlo</p>
                  <p className="text-xs text-zinc-500">Foto, PDF, Excel, CSV, Markdown, texto o el ZIP que exporta Notion</p>
                </div>
                <input ref={input} type="file" hidden onChange={(e) => takeFile(e.target.files?.[0])} />
                <p className="mb-1.5 mt-5 text-xs font-semibold text-zinc-400">O pégalo aquí</p>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Lunes 7:00 gimnasio, 9:00 trabajo…" className={field} />
                <button type="button" disabled={!text.trim()} onClick={readText} className="mt-3 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-40">Leer horario</button>
              </>
            )}
            {result && pending.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-300">Antes de importarlo, necesito aclarar esto:</p>
                {pending.map((q) => (
                  <div key={q.question}>
                    <p className="mb-2 text-sm font-semibold">{q.question}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {q.options.map((o) => (
                        <button key={o} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.question]: o }))} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${answers[q.question] === o ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`}>{o}</button>
                      ))}
                    </div>
                    <input value={q.options.includes(answers[q.question] ?? '') ? '' : (answers[q.question] ?? '')} onChange={(e) => setAnswers((a) => ({ ...a, [q.question]: e.target.value }))} placeholder="O escríbelo aquí" className={`${field} mt-2`} />
                  </div>
                ))}
              </div>
            )}
            {result && !pending.length && (
              <>
                <input value={result.name} onChange={(e) => patch({ name: e.target.value })} aria-label="Nombre del horario" placeholder="Nombre del horario" className={field} />
                {result.unmatched && <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">No pude leer esto: {result.unmatched}</p>}
                {result.items.length === 0 && <p className="mt-4 text-sm text-zinc-400">No encontré actividades con hora. Prueba con otra foto o archivo.</p>}
                {WEEK.map((day, d) => {
                  const list = result.items.filter((i) => i.weekday === d).sort((a, b) => byTime(a as never, b as never));
                  if (!list.length) return null;
                  return (
                    <div key={day} className="mt-4">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{day}</p>
                      {list.map((i) => (
                        <div key={`${i.weekday}${i.time}${i.title}`} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-white/[0.04]">
                          <span className="w-12 shrink-0 font-mono text-xs text-zinc-400">{i.time}</span>
                          <span className="shrink-0">{i.icon}</span>
                          <span className="min-w-0 flex-1 truncate">{i.title}</span>
                          <span className="shrink-0 text-xs text-zinc-500">{i.minutes} min</span>
                          <button type="button" aria-label={`Quitar ${i.title}`} onClick={() => patch({ items: result.items.filter((x) => x !== i) })} className="rounded p-1 text-zinc-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
          {result && (
            <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
              <button type="button" onClick={() => { setResult(null); setSource(null); setSaved([]); setFileName(''); }} className="rounded-xl px-3 py-2 text-sm font-semibold text-zinc-400 hover:text-white">Empezar de nuevo</button>
              {pending.length > 0 ? (
                <button type="button" disabled={!ready || busy} onClick={answerAll} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Continuar</button>
              ) : (
                <button type="button" disabled={!result.items.length || busy} onClick={create} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear en vista previa</button>
              )}
            </div>
          )}
        </div>
      </div>
    </BodyPortal>
  );
};
