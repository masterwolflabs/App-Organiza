'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Database, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { SectionHeader, SectionShell } from '@/components/dashboard/DashboardUI';
import { DatabaseTable } from '@/components/databases/DatabaseTable';
import { DB_TEMPLATES, DbTemplate, UserDatabase } from '@/utils/databases';
import { useDatabaseStore } from '@/utils/useDatabases';

/**
 * "Bases de datos" section (Emanuel, 2026-10-15): your databases as cards +
 * "Nueva base de datos" from a template; opening one shows the full
 * DatabaseTable. The open id lives in app/page.tsx so a note's embed and the
 * global search can open one directly.
 */

/** Template picker, shared with the note embed ("Insertar base de datos"). */
export const TemplatePicker: React.FC<{ onPick: (t: DbTemplate) => void; busy?: boolean }> = ({ onPick, busy }) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {DB_TEMPLATES.map((t) => (
      <button
        key={t.key}
        type="button"
        disabled={busy}
        onClick={() => onPick(t)}
        className="flex flex-col items-start gap-2 rounded-2xl border border-white/[0.09] bg-[#141922]/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#409FFE]/50 disabled:opacity-50"
      >
        <span className="text-2xl">{t.icon}</span>
        <span className="font-semibold text-white">{t.title}</span>
        <span className="text-xs leading-snug text-zinc-400">{t.description}</span>
      </button>
    ))}
  </div>
);

export async function createFromTemplate(store: NonNullable<ReturnType<typeof useDatabaseStore>>, t: DbTemplate, title?: string) {
  const { properties, rows } = t.build();
  return store.create({ title: title ?? (t.key === 'blank' ? 'Nueva base de datos' : t.title), icon: t.icon, properties, rows });
}

export const DatabasesView: React.FC<{ openId: string | null; onOpenChange: (id: string | null) => void }> = ({ openId, onOpenChange }) => {
  const store = useDatabaseStore();
  const [list, setList] = useState<UserDatabase[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!store) return;
    store.list().then(setList);
  }, [store]);
  useEffect(() => {
    if (!openId) reload();
  }, [openId, reload]);

  const create = async (t: DbTemplate) => {
    if (!store) return;
    setCreating(true);
    setError(null);
    const db = await createFromTemplate(store, t);
    setCreating(false);
    if (!db) return setError('No se pudo crear la base de datos (¿falta aplicar la migración en Supabase?).');
    onOpenChange(db.id);
  };

  if (openId) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => onOpenChange(null)} className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Bases de datos
        </button>
        <DatabaseTable databaseId={openId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionShell variant="glass">
        <SectionHeader title="Bases de datos" description="Tablas a tu medida, como en Notion: texto, números, etiquetas, fechas, casillas y fórmulas." />
        {list === null ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : list.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
            <Database className="h-8 w-8 text-sky-300" />
            <p className="mt-3 font-semibold text-white">Todavía no tienes bases de datos</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-400">Crea la primera con una plantilla de abajo. También puedes insertar una dentro de cualquier nota.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((d) => (
              <div key={d.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onOpenChange(d.id)}
                  className="flex w-full flex-col items-start gap-2 rounded-2xl border border-white/[0.09] bg-[#141922]/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#409FFE]/50"
                >
                  <span className="text-2xl">{d.icon || '📄'}</span>
                  <span className="w-full truncate font-semibold text-white">{d.title}</span>
                  <span className="text-xs text-zinc-500">
                    {d.properties.length} columnas · editada {new Date(d.updatedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMenuFor(menuFor === d.id ? null : d.id)}
                  className="absolute right-2 top-2 rounded-lg p-1.5 text-zinc-500 opacity-0 hover:bg-white/[0.06] hover:text-white group-hover:opacity-100"
                  aria-label="Opciones"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuFor === d.id && (
                  <div className="absolute right-2 top-10 z-20 rounded-xl border border-white/10 bg-[#151922] p-1 shadow-2xl">
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuFor(null);
                        if (!store || !window.confirm(`¿Eliminar “${d.title}”?`)) return;
                        await store.remove(d.id);
                        reload();
                      }}
                      className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell variant="glass">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-sky-300" />
          <h3 className="text-xl font-bold tracking-tight text-white">Nueva base de datos</h3>
          {creating && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        </div>
        <p className="mt-1 text-sm text-zinc-400">Parte de una plantilla y cámbiala a tu gusto.</p>
        <div className="mt-5">
          <TemplatePicker onPick={create} busy={creating} />
        </div>
        {error && <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
      </SectionShell>
    </div>
  );
};
