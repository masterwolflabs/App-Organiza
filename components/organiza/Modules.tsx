'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { DatabaseTable } from '@/components/databases/DatabaseTable';
import { useDatabaseStore } from '@/utils/useDatabases';
import { createFromTemplate } from '@/components/databases/DatabasesView';
import { DB_TEMPLATES } from '@/utils/databases';
import type { UserDatabase } from '@/utils/databases';
import { iso, refOf, type Item, type Module } from '@/components/organiza/model';
import { fmtSeconds, parseYouTube, toSeconds } from '@/components/organiza/YouTubeList';
import type { useChecks } from '@/components/organiza/useHorario';

type Props = { item: Item; modules: Module[]; checks: ReturnType<typeof useChecks>; onChange: (m: Module[]) => void };
const input = 'w-full min-w-0 rounded-md bg-transparent px-1.5 py-1 text-sm text-white outline-none focus:bg-white/[0.06]';

/** El mundo de una tarea: cada bloque se agrega, se renombra y se borra. */
export const Modules: React.FC<Props> = ({ item, modules, checks, onChange }) => {
  const patch = (id: string, p: Partial<Module>) => onChange(modules.map((m) => (m.id === id ? { ...m, ...p } : m)));
  return (
    <div className="mt-3 space-y-3">
      {modules.map((m) => (
        <article key={m.id} className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/10">
          <div className="mb-2 flex items-center gap-2">
            <input key={m.id} defaultValue={m.title} aria-label="Nombre del bloque" onBlur={(e) => e.target.value.trim() && patch(m.id, { title: e.target.value.trim() })} className={`${input} font-semibold`} />
            <button type="button" aria-label={`Quitar ${m.title}`} onClick={() => onChange(modules.filter((x) => x.id !== m.id))} className="rounded p-1 text-zinc-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
          </div>
          {(m.type === 'habitos' || m.type === 'reglas') && <Habits item={item} m={m} checks={checks} patch={(p) => patch(m.id, p)} />}
          {m.type === 'sueno' && <Sleep item={item} checks={checks} />}
          {m.type === 'youtube' && <YouTubeEditor m={m} patch={(p) => patch(m.id, p)} />}
          {m.type === 'tabla' && <Grid m={m} patch={(p) => patch(m.id, p)} />}
          {m.type === 'base' && <Base m={m} patch={(p) => patch(m.id, p)} />}
        </article>
      ))}
    </div>
  );
};

const Habits: React.FC<{ item: Item; m: Module; checks: Props['checks']; patch: (p: Partial<Module>) => void }> = ({ item, m, checks, patch }) => {
  const [text, setText] = useState('');
  const today = iso(new Date());
  const ref = refOf(item.title);
  const check = checks.checks.find((c) => c.ref === ref && c.day === today);
  // Paso a paso: lo que hiciste hoy. Reglas: las que respetaste hoy.
  const key = m.type === 'reglas' ? 'rules' : 'habits';
  const doneList = check?.value[key] ?? [];
  const habits = m.habits ?? [];
  const toggle = (h: string) => {
    const habitsDone = doneList.includes(h) ? doneList.filter((x) => x !== h) : [...doneList, h];
    // Paso a paso completo → la acción queda hecha sola.
    const complete = key === 'habits' && habits.length > 0 && habits.every((x) => habitsDone.includes(x));
    checks.mark(item.title, today, complete || (check?.done ?? false), { ...check?.value, [key]: habitsDone });
  };
  // Cambiar el texto: el paso conserva su lugar y, si ya estaba marcado hoy, sigue marcado.
  const rename = (from: string, to: string) => {
    const t = to.trim();
    if (!t || t === from || habits.includes(t)) return;
    patch({ habits: habits.map((x) => (x === from ? t : x)) });
    if (doneList.includes(from)) checks.mark(item.title, today, check?.done ?? false, { ...check?.value, [key]: doneList.map((x) => (x === from ? t : x)) });
  };
  // Mover: se arrastra desde la manija ⋮⋮ (mouse o dedo) y se suelta en su nuevo lugar.
  const list = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const startDrag = (e: React.PointerEvent, from: number) => {
    e.preventDefault();
    let to = from;
    setDrag({ from, to });
    const move = (ev: PointerEvent) => {
      const rows = Array.from(list.current?.children ?? []) as HTMLElement[];
      const at = rows.findIndex((r) => ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
      to = at === -1 ? rows.length - 1 : at > from ? at - 1 : at;
      setDrag({ from, to });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (to !== from) {
        const next = [...habits];
        const [it] = next.splice(from, 1);
        next.splice(to, 0, it);
        patch({ habits: next });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const shown = drag ? (() => { const n = [...habits]; const [it] = n.splice(drag.from, 1); n.splice(drag.to, 0, it); return n; })() : habits;
  return (
    <>
      <ul ref={list} className="space-y-1">
        {shown.map((h) => (
          <li key={h} className={`group/step flex items-center gap-2 rounded-lg ${drag && habits[drag.from] === h ? 'bg-white/[0.06] ring-1 ring-sky-400/40' : ''}`}>
            <button type="button" aria-label={`Mover ${h}`} data-help="Arrastra para mover" onPointerDown={(e) => startDrag(e, habits.indexOf(h))} className="cursor-grab touch-none p-0.5 text-zinc-600 opacity-60 hover:text-zinc-300 group-hover/step:opacity-100 active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button>
            <button type="button" role="checkbox" aria-checked={doneList.includes(h)} aria-label={h} onClick={() => toggle(h)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ring-1 ${doneList.includes(h) ? 'bg-emerald-500 text-[#fff] ring-emerald-400' : 'ring-white/20'}`}>{doneList.includes(h) && <Check className="h-3.5 w-3.5" />}</button>
            <input key={h} defaultValue={h} aria-label="Editar paso" onBlur={(e) => rename(h, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = h; e.currentTarget.blur(); } }} className={`${input} text-zinc-200`} />
            <button type="button" aria-label={`Quitar ${h}`} onClick={() => patch({ habits: habits.filter((x) => x !== h) })} className="p-1 text-zinc-600 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      <form className="mt-2" onSubmit={(e) => { e.preventDefault(); if (text.trim() && !habits.includes(text.trim())) { patch({ habits: [...habits, text.trim()] }); setText(''); } }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={m.type === 'reglas' ? 'Agregar regla' : 'Agregar paso'} className={`${input} text-zinc-300`} />
      </form>
    </>
  );
};

const hours = (bed?: string, wake?: string) => {
  if (!bed || !wake) return null;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.round((((m(wake) - m(bed) + 1440) % 1440) / 60) * 10) / 10;
};

const Sleep: React.FC<{ item: Item; checks: Props['checks'] }> = ({ item, checks }) => {
  const today = iso(new Date());
  const ref = refOf(item.title);
  const mine = checks.checks.filter((c) => c.ref === ref && c.value.bed && c.value.wake).sort((a, b) => a.day.localeCompare(b.day)).slice(-14);
  const check = checks.checks.find((c) => c.ref === ref && c.day === today);
  const set = (p: { bed?: string; wake?: string }) => checks.mark(item.title, today, check?.done ?? false, { ...check?.value, ...p });
  const avg = mine.length ? Math.round((mine.reduce((s, c) => s + (hours(c.value.bed, c.value.wake) ?? 0), 0) / mine.length) * 10) / 10 : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-400">Me acosté<input type="time" value={check?.value.bed ?? ''} onChange={(e) => set({ bed: e.target.value })} className="mt-1 w-full rounded-lg bg-white/[0.05] px-2 py-1.5 text-sm text-white ring-1 ring-white/10" /></label>
        <label className="text-xs text-zinc-400">Me levanté<input type="time" value={check?.value.wake ?? ''} onChange={(e) => set({ wake: e.target.value })} className="mt-1 w-full rounded-lg bg-white/[0.05] px-2 py-1.5 text-sm text-white ring-1 ring-white/10" /></label>
      </div>
      {mine.length > 0 && (
        <>
          <div className="mt-3 flex h-16 items-end gap-1" aria-label={`Promedio ${avg} horas`}>
            {mine.map((c) => {
              const h = hours(c.value.bed, c.value.wake) ?? 0;
              return <span key={c.day} title={`${c.day}: ${h} h`} className="flex-1 rounded-t bg-sky-400/70" style={{ height: `${Math.min(100, (h / 10) * 100)}%` }} />;
            })}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Promedio: {avg} horas por noche</p>
        </>
      )}
    </>
  );
};

const Grid: React.FC<{ m: Module; patch: (p: Partial<Module>) => void }> = ({ m, patch }) => {
  const columns = m.columns ?? [];
  const rows = m.rows ?? [];
  const cell = (r: number, c: number, v: string) => patch({ rows: rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className="border-b border-white/10 text-left font-medium">
                  <input defaultValue={c} aria-label={`Columna ${i + 1}`} onBlur={(e) => patch({ columns: columns.map((x, j) => (j === i ? e.target.value : x)) })} className={`${input} text-xs text-zinc-400`} />
                </th>
              ))}
              <th className="w-7 border-b border-white/10"><button type="button" aria-label="Agregar columna" onClick={() => patch({ columns: [...columns, 'Columna'], rows: rows.map((r) => [...r, '']) })} className="p-1 text-zinc-500 hover:text-white"><Plus className="h-3.5 w-3.5" /></button></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-white/5">
                {columns.map((_, j) => <td key={j}><input value={r[j] ?? ''} aria-label={`${columns[j]}, fila ${i + 1}`} onChange={(e) => cell(i, j, e.target.value)} className={input} /></td>)}
                <td><button type="button" aria-label={`Quitar fila ${i + 1}`} onClick={() => patch({ rows: rows.filter((_, k) => k !== i) })} className="p-1 text-zinc-600 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => patch({ rows: [...rows, columns.map(() => '')] })} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white"><Plus className="h-3.5 w-3.5" /> Agregar fila</button>
    </>
  );
};

const Base: React.FC<{ m: Module; patch: (p: Partial<Module>) => void }> = ({ m, patch }) => {
  const store = useDatabaseStore();
  const [list, setList] = useState<UserDatabase[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    store?.list().then(setList);
  }, [store]);
  if (!store) return null;
  if (m.databaseId) return <div className="overflow-x-auto"><DatabaseTable databaseId={m.databaseId} embedded onOpenFull={() => { window.location.hash = 'bases'; }} /></div>;
  const create = async () => {
    setBusy(true);
    const made = await createFromTemplate(store, DB_TEMPLATES.find((t) => t.key === 'blank') ?? DB_TEMPLATES[0], m.title);
    if (made) patch({ databaseId: made.id });
    setBusy(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={create} className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-semibold text-[#fff] disabled:opacity-50">Crear base nueva</button>
      {list.length > 0 && (
        <select aria-label="Usar una base existente" value="" onChange={(e) => e.target.value && patch({ databaseId: e.target.value })} className="rounded-xl bg-white/[0.05] px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-white/10">
          <option value="" className="bg-zinc-900">Usar una que ya tengo</option>
          {list.map((d) => <option key={d.id} value={d.id} className="bg-zinc-900">{d.title}</option>)}
        </select>
      )}
    </div>
  );
};

/** Lista de YouTube: links de videos (con desde/hasta) o de una playlist. Suena sola en el modo focus. */
const YouTubeEditor: React.FC<{ m: Module; patch: (p: Partial<Module>) => void }> = ({ m, patch }) => {
  const videos = m.videos ?? [];
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const set = (i: number, p: Partial<NonNullable<Module['videos']>[number]>) => patch({ videos: videos.map((v, j) => (j === i ? { ...v, ...p } : v)) });
  return (
    <div className="space-y-2">
      {videos.map((v, i) => {
        const p = parseYouTube(v.url);
        return (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-1.5">
            {p?.video ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`https://i.ytimg.com/vi/${p.video}/default.jpg`} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[10px] text-zinc-400">Lista</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-zinc-300">{i + 1}. {v.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
              {p?.video && (
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                  desde <input defaultValue={fmtSeconds(v.from)} placeholder="0:00" onBlur={(e) => set(i, { from: toSeconds(e.target.value) })} className="w-12 rounded bg-white/[0.05] px-1 text-zinc-200 outline-none" />
                  hasta <input defaultValue={fmtSeconds(v.to)} placeholder="fin" onBlur={(e) => set(i, { to: toSeconds(e.target.value) })} className="w-12 rounded bg-white/[0.05] px-1 text-zinc-200 outline-none" />
                </span>
              )}
            </span>
            <button type="button" aria-label="Quitar video" onClick={() => patch({ videos: videos.filter((_, j) => j !== i) })} className="p-1 text-zinc-600 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>
          </div>
        );
      })}
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (!parseYouTube(url)) return setError('Ese link no es de YouTube.'); setError(''); patch({ videos: [...videos, { url: url.trim() }] }); setUrl(''); }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pega un link de YouTube (video o playlist)" className={`${input} text-zinc-300`} />
        <button type="submit" className="rounded-md px-2 text-sm font-semibold text-sky-300 hover:bg-white/[0.06]"><Plus className="h-4 w-4" /></button>
      </form>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <p className="text-[11px] text-zinc-500">Suenan solos, uno tras otro, cuando empiezas el modo focus.</p>
    </div>
  );
};
