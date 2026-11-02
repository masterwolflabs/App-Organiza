'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlignLeft, ArrowUpRight, Bold, CircleDot, Clock, Eraser, FileText, GripVertical, Italic, LayoutGrid, Plus, Table2, Trash2, Type } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm';
import { useDocStore as useTableViewsStore } from '@/components/daily/docStore';
import type { Entity } from '@/components/calendar/EntityPicker';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { PeopleCell } from '@/components/daily/DailyView';
import { newId } from '@/utils/daily';
import { HOW_COLORS, HOW_DEFAULT, HOW_KEY, type HowCard, type HowColumn, type HowDoc, type HowRow } from '@/utils/howWeWork';
import './how.css';

/**
 * 📖 Cómo trabajamos (Emanuel, 2026-10-31): the look of his Notion "Paso a Paso Claude", under the Daily
 * (table and board). Every text edits in place, the words can be colored with the selection bar, each
 * column has its own color and the cards move by their handle. Data: see utils/howWeWork.
 */

/** Keeps pasted content from running scripts or handlers when shown inline. */
const clean = (html: string) =>
  html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '');
const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : HOW_COLORS[0]);

/** Text that edits in place. While it has the focus, what's saved from elsewhere doesn't overwrite it. */
const Rich: React.FC<{ value: string; onChange: (v: string) => void; line?: boolean; placeholder?: string; className?: string }> = ({ value, onChange, line, placeholder, className = '' }) => {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el && document.activeElement !== el && el.innerHTML !== value) el.innerHTML = clean(value);
  }, [value]);
  return (
    <div
      ref={box}
      data-how-rich=""
      data-empty={placeholder}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onKeyDown={(e) => {
        if (line && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const next = clean(e.currentTarget.innerHTML === '<br>' ? '' : e.currentTarget.innerHTML);
        if (next !== value) onChange(next);
      }}
      className={`how-rich ${className}`}
    />
  );
};

/** The bar over selected text: bold, italic and the columns' colors. */
const SelectionBar: React.FC<{ columns: HowColumn[] }> = ({ columns }) => {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onSelect = () => {
      const s = document.getSelection();
      const node = s?.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      if (!s || s.isCollapsed || !el?.closest('[data-how-rich]')) return setAt(null);
      const r = s.getRangeAt(0).getBoundingClientRect();
      setAt({ x: Math.max(8, Math.min(r.left + r.width / 2 - 110, window.innerWidth - 228)), y: Math.max(8, r.top - 44) });
    };
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);
  if (!at) return null;
  const paint = (tag: string, id: string) => document.execCommand('insertHTML', false, `<${tag} data-col="${id}">${escape(document.getSelection()?.toString() ?? '')}</${tag}>`);
  const btn = 'flex h-7 w-7 items-center justify-center rounded-md text-zinc-200 hover:bg-white/10';
  return (
    <BodyPortal lockScroll={false}>
      <div onMouseDown={(e) => e.preventDefault()} style={{ left: at.x, top: at.y }} className="theme-fixed fixed z-[120] flex items-center gap-1 rounded-lg border border-white/15 bg-[#1f2128] p-1 shadow-xl">
        <button type="button" data-help="Negrita" onClick={() => document.execCommand('bold')} className={btn}><Bold className="h-3.5 w-3.5" /></button>
        <button type="button" data-help="Cursiva" onClick={() => document.execCommand('italic')} className={btn}><Italic className="h-3.5 w-3.5" /></button>
        <span className="mx-0.5 h-4 w-px bg-white/15" />
        {columns.map((c) => (
          <button key={c.id} type="button" data-help={`Color de ${c.title}`} onClick={() => paint('b', c.id)} className={btn}>
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: hex(c.color) }} />
          </button>
        ))}
        <button type="button" data-help="Gris cursiva" onClick={() => paint('i', 'muted')} className={btn}><span className="h-3.5 w-3.5 rounded-full bg-zinc-500" /></button>
        <button type="button" data-help="Quitar formato" onClick={() => document.execCommand('insertText', false, document.getSelection()?.toString() ?? '')} className={btn}><Eraser className="h-3.5 w-3.5" /></button>
      </div>
    </BodyPortal>
  );
};

/** A small menu opened from a button, drawn over everything. */
const Pop: React.FC<{ anchor: DOMRect; onClose: () => void; children: React.ReactNode }> = ({ anchor, onClose, children }) => (
  <BodyPortal lockScroll={false}>
    <div className="fixed inset-0 z-[110]" onClick={onClose} />
    <div style={{ left: Math.max(8, Math.min(anchor.left, window.innerWidth - 248)), top: Math.min(anchor.bottom + 6, window.innerHeight - 260) }} className="theme-fixed fixed z-[111] w-60 rounded-xl border border-white/15 bg-[#1f2128] p-2.5 text-zinc-200 shadow-xl">
      {children}
    </div>
  </BodyPortal>
);

const Chip: React.FC<{ column: HowColumn; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; help?: string }> = ({ column, onClick, help }) => (
  <button type="button" onClick={onClick} data-help={help} style={{ '--c': hex(column.color) } as React.CSSProperties} className="how-chip">
    {column.title}
  </button>
);

const ColumnMenu: React.FC<{ column: HowColumn; onPatch: (p: Partial<HowColumn>) => void; onDelete: () => void; onClose: () => void; anchor: DOMRect }> = ({ column, onPatch, onDelete, onClose, anchor }) => (
  <Pop anchor={anchor} onClose={onClose}>
    <input
      defaultValue={column.title}
      autoFocus
      onBlur={(e) => e.target.value.trim() && onPatch({ title: e.target.value.trim() })}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-full rounded-lg border border-white/15 bg-[#14161b] px-2.5 py-1.5 text-sm text-white outline-none focus:border-sky-400/60"
    />
    <p className="mb-1.5 mt-3 text-[11px] font-semibold text-zinc-400">Color</p>
    <div className="flex flex-wrap items-center gap-1.5">
      {HOW_COLORS.map((c) => (
        <button key={c} type="button" aria-label={c} onClick={() => onPatch({ color: c })} style={{ background: c }} className={`h-6 w-6 rounded-full ${c === column.color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1f2128]' : ''}`} />
      ))}
      <input type="color" value={hex(column.color)} onChange={(e) => onPatch({ color: e.target.value })} data-help="Cualquier otro color" className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
    </div>
    <button type="button" onClick={onDelete} className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-rose-300 hover:bg-white/[0.06]">
      <Trash2 className="h-3.5 w-3.5" /> Borrar columna
    </button>
  </Pop>
);

export const DailyManual: React.FC<{ entities: Entity[]; photoOf: (name: string) => string | null; onCreatePerson: (name: string) => Promise<string | null> }> = ({ entities, photoOf, onCreatePerson }) => {
  const store = useTableViewsStore();
  const confirm = useConfirm();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [menu, setMenu] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const [stateOf, setStateOf] = useState<{ card: string; anchor: DOMRect } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const saved = store?.ready ? (store.get(HOW_KEY) as HowDoc | null) : null;
  const doc = saved?.columns ? saved : HOW_DEFAULT;
  // The first time it's saved, so Claude can read it from the database too.
  useEffect(() => {
    if (store?.ready && !saved?.columns) store.set(HOW_KEY, HOW_DEFAULT);
  }, [store, saved]);
  // Someone else may have edited it: bring it in when coming back to the tab.
  useEffect(() => {
    if (!store?.reload) return;
    const pull = () => store.reload!(HOW_KEY);
    window.addEventListener('focus', pull);
    return () => window.removeEventListener('focus', pull);
  }, [store]);

  // Always build on the latest saved manual (a page left open must not undo edits made meanwhile).
  const update = (fn: (d: HowDoc) => HowDoc) => store?.set(HOW_KEY, fn((store.get(HOW_KEY) as HowDoc | null) ?? doc));
  const setColumns = (fn: (c: HowColumn[]) => HowColumn[]) => update((d) => ({ ...d, columns: fn(d.columns) }));
  const patchColumn = (id: string, p: Partial<HowColumn>) => setColumns((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const patchCard = (id: string, p: Partial<HowCard>) => setColumns((cs) => cs.map((c) => ({ ...c, cards: c.cards.map((x) => (x.id === id ? { ...x, ...p } : x)) })));
  const patchRow = (id: string, p: Partial<HowRow>) => update((d) => ({ ...d, schedule: d.schedule.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  const addCard = (column: string) => setColumns((cs) => cs.map((c) => (c.id === column ? { ...c, cards: [...c.cards, { id: newId(), title: '', html: '' }] } : c)));
  const removeCard = async (card: HowCard) => {
    if (await confirm({ title: '¿Borrar esta tarjeta?', message: card.title || 'Tarjeta sin título' })) setColumns((cs) => cs.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== card.id) })));
  };
  const removeRow = async (row: HowRow) => {
    if (await confirm({ title: '¿Borrar esta fila?', message: row.name })) update((d) => ({ ...d, schedule: d.schedule.filter((r) => r.id !== row.id) }));
  };
  const removeColumn = async (column: HowColumn) => {
    setMenu(null);
    if (await confirm({ title: `¿Borrar la columna ${column.title}?`, message: 'Se borran también sus tarjetas.' })) setColumns((cs) => cs.filter((c) => c.id !== column.id));
  };
  /** Moves a card to a column, before `before` (or at its end). */
  const move = (id: string, column: string, before?: string) =>
    setColumns((cs) => {
      const card = cs.flatMap((c) => c.cards).find((x) => x.id === id);
      if (!card || id === before) return cs;
      return cs.map((c) => {
        const rest = c.cards.filter((x) => x.id !== id);
        if (c.id !== column) return { ...c, cards: rest };
        const at = before ? rest.findIndex((x) => x.id === before) : -1;
        return { ...c, cards: at < 0 ? [...rest, card] : [...rest.slice(0, at), card, ...rest.slice(at)] };
      });
    });
  const drop = (e: React.DragEvent, column: string, before?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (drag) move(drag, column, before);
    setDrag(null);
    setOver(null);
  };

  const menuColumn = doc.columns.find((c) => c.id === menu?.id);
  const colorRules = doc.columns.map((c) => `.how [data-col="${c.id.replace(/[^\w-]/g, '')}"]{color:${hex(c.color)}}`).join('');

  return (
    <section id="como-trabajamos" className="how mt-10 min-w-0">
      <style>{colorRules}</style>
      <SelectionBar columns={doc.columns} />
      <Rich line value={doc.page} onChange={(page) => update((d) => ({ ...d, page }))} className="how-page" />

      <div className="how-callout">
        <Rich line value={doc.heading} onChange={(heading) => update((d) => ({ ...d, heading }))} className="how-h1" />
        <Rich line value={doc.scheduleTitle} onChange={(scheduleTitle) => update((d) => ({ ...d, scheduleTitle }))} className="how-h2 mt-7" />
        <div className="how-scroll mt-2">
          <table className="how-table min-w-[900px]">
            <thead>
              <tr>
                <th className="w-[23%]"><Type /> Nombre</th>
                <th className="w-[10%]"><Clock /> Hora</th>
                <th className="w-[20%]"><AlignLeft /> Que implica</th>
                <th><AlignLeft /> Objetivo y c/ Etapa</th>
                <th className="w-[17%]"><ArrowUpRight /> RRHH</th>
              </tr>
            </thead>
            <tbody>
              {doc.schedule.map((r) => (
                <tr key={r.id} className="group">
                  <td>
                    <div className="flex items-start gap-1.5">
                      <FileText className="how-ico mt-0.5" />
                      <Rich line value={r.name} onChange={(name) => patchRow(r.id, { name })} placeholder="Sin título" className="flex-1 font-semibold" />
                      <button type="button" aria-label="Borrar fila" onClick={() => removeRow(r)} className="how-del"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                  <td><Rich line value={r.hour} onChange={(hour) => patchRow(r.id, { hour })} /></td>
                  <td><Rich value={r.implies} onChange={(implies) => patchRow(r.id, { implies })} /></td>
                  <td><Rich value={r.goal} onChange={(goal) => patchRow(r.id, { goal })} /></td>
                  <td><PeopleCell value={r.people} entities={entities} photoOf={photoOf} onChange={(people) => patchRow(r.id, { people })} onCreate={onCreatePerson} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => update((d) => ({ ...d, schedule: [...d.schedule, { id: newId(), name: '', hour: '', implies: '', goal: '', people: [] }] }))} className="how-add mt-1">
          <Plus className="h-4 w-4" /> Nueva página
        </button>
      </div>

      <Rich line value={doc.detailsTitle} onChange={(detailsTitle) => update((d) => ({ ...d, detailsTitle }))} className="how-h2 mt-9" />
      <div className="mt-2 flex gap-1">
        {([['board', 'Tablero', LayoutGrid], ['table', 'Tabla', Table2]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={`how-tab ${view === id ? 'how-tab-on' : ''}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {view === 'board' ? (
        <div className="how-scroll mt-3 flex items-start gap-3 pb-2">
          {doc.columns.map((c) => (
            <div
              key={c.id}
              style={{ '--c': hex(c.color) } as React.CSSProperties}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c.id);
              }}
              onDrop={(e) => drop(e, c.id)}
              className={`how-col ${over === c.id ? 'how-col-over' : ''}`}
            >
              <div className="flex items-center gap-2 px-1 pb-2 pt-1">
                <Chip column={c} help="Cambia el nombre o el color de la columna" onClick={(e) => setMenu({ id: c.id, anchor: e.currentTarget.getBoundingClientRect() })} />
                <span className="how-count">{c.cards.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {c.cards.map((card) => (
                  <article
                    key={card.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOver(c.id);
                    }}
                    onDrop={(e) => drop(e, c.id, card.id)}
                    className={`how-card group ${drag === card.id ? 'opacity-40' : ''}`}
                  >
                    <div className="how-tools">
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/how-card', card.id);
                          const box = e.currentTarget.closest('article');
                          if (box) e.dataTransfer.setDragImage(box, 12, 12);
                          setDrag(card.id);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setOver(null);
                        }}
                        data-help="Arrastra para mover la tarjeta"
                        className="cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                      <button type="button" aria-label="Borrar tarjeta" onClick={() => removeCard(card)}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {(card.title || card.html === '') && <Rich line value={card.title} onChange={(title) => patchCard(card.id, { title })} placeholder="Sin título" className="how-card-title" />}
                    <Rich value={card.html} onChange={(html) => patchCard(card.id, { html })} placeholder="Escribe aquí…" className="how-card-body" />
                  </article>
                ))}
              </div>
              <button type="button" onClick={() => addCard(c.id)} className="how-add mt-1 w-full">
                <Plus className="h-4 w-4" /> Nueva página
              </button>
            </div>
          ))}
          <button type="button" aria-label="Nueva columna" data-help="Nueva columna" onClick={() => setColumns((cs) => [...cs, { id: newId(), title: 'Nueva columna', color: HOW_COLORS[0], cards: [] }])} className="how-add mt-1 shrink-0">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="how-scroll mt-3">
          <table className="how-table min-w-[720px]">
            <thead>
              <tr>
                <th className="w-[26%]"><Type /> Nombre</th>
                <th className="w-[18%]"><CircleDot /> Estado</th>
                <th><AlignLeft /> Texto</th>
              </tr>
            </thead>
            <tbody>
              {doc.columns.flatMap((c) =>
                c.cards.map((card) => (
                  <tr key={card.id} className="group">
                    <td>
                      <div className="flex items-start gap-1.5">
                        <Rich line value={card.title} onChange={(title) => patchCard(card.id, { title })} placeholder="Sin título" className="flex-1 font-semibold" />
                        <button type="button" aria-label="Borrar tarjeta" onClick={() => removeCard(card)} className="how-del"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                    <td><Chip column={c} help="Cambia su estado" onClick={(e) => setStateOf({ card: card.id, anchor: e.currentTarget.getBoundingClientRect() })} /></td>
                    <td><Rich value={card.html} onChange={(html) => patchCard(card.id, { html })} placeholder="Escribe aquí…" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {menu && menuColumn && <ColumnMenu column={menuColumn} anchor={menu.anchor} onClose={() => setMenu(null)} onPatch={(p) => patchColumn(menuColumn.id, p)} onDelete={() => removeColumn(menuColumn)} />}
      {stateOf && (
        <Pop anchor={stateOf.anchor} onClose={() => setStateOf(null)}>
          <div className="flex flex-col items-start gap-1.5">
            {doc.columns.map((c) => (
              <Chip
                key={c.id}
                column={c}
                onClick={() => {
                  move(stateOf.card, c.id);
                  setStateOf(null);
                }}
              />
            ))}
          </div>
        </Pop>
      )}
    </section>
  );
};
