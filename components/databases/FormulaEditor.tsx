'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Lock, Search, Sigma, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { FORMULA_FUNCTIONS, compileFormula, type FnDoc } from '@/utils/notionFormula';

/**
 * Notion-style formula editor (Emanuel, 2026-10-16): big code box, the
 * columns of the table (click → prop("Nombre")), the function catalog with
 * description + example, and a live preview on a real row.
 */
export const FormulaEditor: React.FC<{
  columnName: string;
  value: string;
  /** Column names of the table (custom + built-in). */
  propNames: string[];
  /** Result on a sample row: text to show, or the error. */
  preview: (formula: string) => { text: string; error?: string; sample?: string };
  readOnly?: boolean;
  onSave: (formula: string) => void;
  onClose: () => void;
}> = ({ columnName, value, propNames, preview, readOnly, onSave, onClose }) => {
  const [text, setText] = useState(value);
  const [q, setQ] = useState('');
  const [doc, setDoc] = useState<FnDoc | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const syntax = compileFormula(text.trim() ? text : '0');
  const res = text.trim() ? preview(text) : { text: '' };
  const error = syntax.error ?? res.error;

  const insert = (snippet: string, caretBack = 0) => {
    if (readOnly) return;
    const el = area.current;
    const s = el?.selectionStart ?? text.length;
    const e = el?.selectionEnd ?? text.length;
    const next = text.slice(0, s) + snippet + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = s + snippet.length - caretBack;
      el?.setSelectionRange(pos, pos);
    });
  };

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const groups = useMemo(() => {
    const nq = norm(q.trim());
    const list = FORMULA_FUNCTIONS.filter((f) => f.name !== 'prop' && (!nq || norm(`${f.name} ${f.desc} ${f.group}`).includes(nq)));
    const out = new Map<string, FnDoc[]>();
    for (const f of list) out.set(f.group, [...(out.get(f.group) ?? []), f]);
    return [...out];
  }, [q]);
  const props = propNames.filter((n) => !q.trim() || norm(n).includes(norm(q.trim())));

  const save = () => {
    if (readOnly || syntax.error) return;
    onSave(text.trim());
    onClose();
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onMouseDown={onClose}>
        <div
          role="dialog"
          aria-label={`Fórmula de ${columnName}`}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#13161d] shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-3">
            <Sigma className="h-4 w-4 text-sky-300" />
            <h3 className="text-sm font-semibold text-white">Fórmula · {columnName}</h3>
            {readOnly && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                <Lock className="h-3 w-3" /> Base bloqueada · solo lectura
              </span>
            )}
            <button type="button" onClick={onClose} className="ml-auto rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-white/[0.08] px-5 py-4">
            <textarea
              ref={area}
              autoFocus={!readOnly}
              readOnly={readOnly}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
                if (e.key === 'Escape') onClose();
              }}
              spellCheck={false}
              rows={4}
              placeholder={'Ej: if(prop("Monto") > 1000000, "Grande", "Normal")'}
              className="w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-white placeholder:text-zinc-600 focus:border-sky-500/60 focus:outline-none"
            />
            <div className="mt-2 flex min-h-[20px] items-center gap-2 text-xs">
              {!text.trim() ? (
                <span className="text-zinc-500">Escribe una fórmula o elige una columna / función de abajo.</span>
              ) : error ? (
                <span className="text-rose-300">⚠︎ {error}</span>
              ) : (
                <span className="text-emerald-300">
                  ✓ Resultado{res.sample ? ` en “${res.sample}”` : ''}: <span className="font-mono text-white">{res.text || '(vacío)'}</span>
                </span>
              )}
              <span className="ml-auto hidden text-zinc-600 sm:inline">⌘/Ctrl + Enter para guardar</span>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[1fr_1.1fr]">
            <div className="min-h-0 overflow-y-auto border-white/[0.08] p-3 sm:border-r">
              <label className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-zinc-500" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar columna o función" className="w-full bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none" />
              </label>
              {props.length > 0 && (
                <>
                  <p className="px-1 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Columnas</p>
                  {props.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => insert(`prop("${n}")`)}
                      onMouseEnter={() => setDoc({ name: n, group: 'Columna', sig: `prop("${n}")`, desc: 'El valor de esta columna en la misma fila.', ex: `prop("${n}")` })}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                    >
                      <span className="rounded bg-sky-500/15 px-1 font-mono text-[10px] text-sky-300">prop</span> {n}
                    </button>
                  ))}
                </>
              )}
              {groups.map(([g, fns]) => (
                <div key={g}>
                  <p className="px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{g}</p>
                  {fns.map((f) => (
                    <button
                      key={f.name + f.sig}
                      type="button"
                      onClick={() => insert(`${f.name}()`, 1)}
                      onMouseEnter={() => setDoc(f)}
                      onFocus={() => setDoc(f)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left font-mono text-xs text-zinc-200 hover:bg-white/[0.06]"
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="min-h-0 overflow-y-auto p-4 text-xs text-zinc-300">
              {doc ? (
                <div className="space-y-3">
                  <p className="font-mono text-sm text-white">{doc.sig}</p>
                  <p className="leading-relaxed text-zinc-400">{doc.desc}</p>
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Ejemplo</p>
                    <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/40 px-3 py-2 font-mono text-[12px] text-sky-200">{doc.ex}</pre>
                    {!readOnly && (
                      <button type="button" onClick={() => insert(doc.ex)} className="mt-2 text-[11px] font-semibold text-sky-300 hover:text-sky-200">
                        Insertar ejemplo
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 leading-relaxed text-zinc-400">
                  <p className="text-sm font-semibold text-white">Mismo lenguaje de fórmulas que Notion</p>
                  <p>
                    Usa <span className="font-mono text-sky-200">prop(&quot;Columna&quot;)</span> para leer otra columna de la fila, operadores
                    <span className="font-mono text-sky-200"> + − * / % ^</span>, comparaciones <span className="font-mono text-sky-200">== != &gt; &lt;</span>,
                    <span className="font-mono text-sky-200"> and / or / not</span> y funciones como <span className="font-mono text-sky-200">if()</span>,
                    <span className="font-mono text-sky-200"> dateBetween()</span> o <span className="font-mono text-sky-200">round()</span>.
                  </p>
                  <p>
                    También el estilo con punto: <span className="font-mono text-sky-200">prop(&quot;Monto&quot;).round()</span>. Pasa el mouse por una función
                    para ver qué hace.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] px-5 py-3">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-white">
              {readOnly ? 'Cerrar' : 'Cancelar'}
            </button>
            {!readOnly && (
              <button type="button" onClick={save} disabled={!!syntax.error} className="rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-40">
                Guardar fórmula
              </button>
            )}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};
