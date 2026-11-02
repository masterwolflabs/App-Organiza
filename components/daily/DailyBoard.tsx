'use client';

import React, { useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { McAvatar } from '@/components/calendar/McAvatar';
import { useAsk } from '@/components/ui/confirm';
import { LANES, STATUS_INFO, TAG_INFO, laneOf, moveToLane, priorityOf, type DailyLane, type DailyTask } from '@/utils/daily';

/**
 * Tablero de la Daily (Emanuel, 2026-10-28) — under the table, like Notion's "Tablero": one column per
 * "who does it" (Juntos · Emanuel / Moisés · Claude Work · Faltan Permisos) + ✅ Completo (done and approved).
 * Drag a card to another column to change who does it (or to Completo to close it); click it to open its page.
 * Archived tasks aren't shown.
 */
export const DailyBoard: React.FC<{
  tasks: DailyTask[];
  now: number;
  photoOf: (name: string) => string | null;
  onPatch: (id: string, p: Partial<DailyTask>) => void;
  onAdd: (p: Partial<DailyTask>) => void;
  renderOpen: (t: DailyTask, children: React.ReactNode) => React.ReactNode;
}> = ({ tasks, now, photoOf, onPatch, onAdd, renderOpen }) => {
  const ask = useAsk();
  const [over, setOver] = useState<DailyLane | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const askPermission = (current?: string | null) =>
    ask({
      title: '¿Qué permiso le falta a Claude?',
      message: 'Lo que tienes que aprobar o darle para que termine. Queda escrito en la tarjeta.',
      input: { label: 'Permiso', placeholder: 'Ej. correr la migración en Supabase, la llave de la pasarela…' },
      confirmLabel: 'Guardar',
    }).then((v) => (v === null ? null : v.trim() || current || 'Tu aprobación'));

  const drop = async (lane: DailyLane, id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || laneOf(t) === lane) return;
    if (lane === 'permiso') {
      const permission = await askPermission(t.permission);
      if (permission === null) return;
      onPatch(t.id, { executors: ['Claude'], permission, ...(t.status === 'listo' ? { status: 'en_curso' as const } : {}) });
    } else onPatch(t.id, moveToLane(t, lane));
  };
  const addIn = async (lane: DailyLane) => {
    if (lane === 'permiso') {
      const permission = await askPermission();
      if (permission === null) return;
      return onAdd({ executors: ['Claude'], permission });
    }
    onAdd(moveToLane({ executors: [] }, lane));
  };

  const open = tasks.filter((t) => !t.archived);
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xs text-zinc-500">Arrastra una tarjeta para cambiar quién la hace · clic para abrir su página.</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {LANES.map((lane) => {
          const cards = open.filter((t) => laneOf(t) === lane.id);
          return (
            <div
              key={lane.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(lane.id);
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                setDragging(null);
                const id = e.dataTransfer.getData('text/daily-task');
                if (id) drop(lane.id, id);
              }}
              className={`flex w-[290px] shrink-0 flex-col gap-2 rounded-2xl p-2.5 ring-1 transition xl:w-auto xl:min-w-0 xl:flex-1 ${lane.col} ${over === lane.id ? 'ring-2 ring-sky-400/60' : ''}`}
            >
              <div className="flex items-center gap-2 px-1 pt-0.5" data-help={lane.hint}>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${lane.head}`}>
                  <span className={`h-2 w-2 rounded-full ${lane.dot}`} />
                  {lane.title}
                </span>
                <span className="text-sm font-semibold text-zinc-500">{cards.length}</span>
              </div>
              {cards.map((t) => {
                const p = priorityOf(t, now);
                const tone = { ok: 'text-emerald-300', soon: 'text-amber-300', late: 'text-rose-300', done: 'text-zinc-400', none: 'text-zinc-500' }[p.tone];
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/daily-task', t.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragging(t.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={`cursor-grab rounded-xl border border-white/10 bg-[#15171c] shadow-sm transition hover:border-white/25 active:cursor-grabbing ${dragging === t.id ? 'opacity-40' : lane.id === 'listo' ? 'opacity-70 hover:opacity-100' : ''}`}
                  >
                    {renderOpen(
                      t,
                      <div className="space-y-2 px-3 py-2.5 text-left">
                        <p className="line-clamp-3 text-sm font-semibold leading-snug text-white">{t.title}</p>
                        <div className="flex flex-wrap gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${TAG_INFO[t.tag].cls}`}>{TAG_INFO[t.tag].label}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_INFO[t.status].cls}`}>{STATUS_INFO[t.status].label}</span>
                        </div>
                        {t.permission?.trim() && lane.id === 'permiso' && (
                          <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
                            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span><b>Falta:</b> {t.permission}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className={`font-semibold ${tone}`}>{p.text}</span>
                          <span className="text-zinc-500">{t.app}</span>
                        </div>
                        {t.executors.length > 0 && (
                          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                            {t.executors.map((n) => (
                              <span key={n} className="inline-flex items-center gap-1">
                                <McAvatar name={n} url={photoOf(n)} size={16} />
                                <b className="text-xs font-semibold text-zinc-200">{n.split(' ')[0]}</b>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {lane.id !== 'listo' && lane.id !== 'revision' && (
                <button
                  type="button"
                  onClick={() => addIn(lane.id)}
                  className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                >
                  <Plus className="h-4 w-4" /> Nueva tarea
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
