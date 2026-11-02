'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ArrowUpRight, PanelLeft, Plus, Trash2 } from 'lucide-react';
import { dailyPageHtml } from '@/utils/dailyPages';
import { supabase } from '@/lib/supabaseClient';
import { DataTable, type Col, type ViewDef } from '@/components/tables/table';
import { Editable } from '@/components/tables/editable';
import { Section } from '@/components/tables/section';
import { useConfirm } from '@/components/ui/confirm';
import { McAvatar } from '@/components/calendar/McAvatar';
import { EntityMenu, type Entity } from '@/components/calendar/EntityPicker';
import { DailyBoard } from '@/components/daily/DailyBoard';
import { DailyManual } from '@/components/daily/DailyManual';
import { DocStoreProvider, useDocStore } from '@/components/daily/docStore';
import { useTableViewsStore } from '@/components/tables/viewsStore';
import { useNotesBridge } from '@/components/notes/NotesBridge';
import { LABS_EMAIL, useSpace } from '@/components/organiza/space';
import { HOW_KEY } from '@/utils/howWeWork';
import {
  DEFAULT_APPS,
  ECOSYSTEM,
  DEFAULT_PEOPLE,
  isClaude,
  STATUS_INFO,
  TAG_INFO,
  newId,
  priorityOf,
  showDate,
  starterDaily,
  todayISO,
  type DailyDoc,
  type DailyStatus,
  type DailyTag,
  type DailyTask,
} from '@/utils/daily';

/**
 * Daily: vino de la Mente Maestra de la nube, con el formato del Notion "Daily - Pendientes".
 * La cuenta de Master Wolf Labs ve la del equipo (table_views 'daily', la misma de scripts/daily.sh);
 * cualquier otra cuenta tiene una por base (Persona / Empresa), suya para cambiarla entera.
 */

/** "Moisés Montano" → "moises montano" (first two words, no accents) to match a profile. */
const nameKey = (n: string) =>
  n
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');

// The table's own id (its views / columns / relations) must NOT be the data key — they'd overwrite each other.
const TABLE = 'daily-tabla';
const VIEWS: ViewDef[] = [
  { name: 'Pendientes', filters: [{ col: 'estado', op: 'no_es', value: 'Listo' }] },
  { name: 'Galería', type: 'gallery', filters: [{ col: 'estado', op: 'no_es', value: 'Listo' }], card: { size: 'm', layout: 'list' } },
  { name: 'Cronograma', type: 'timeline' },
  { name: 'Todas' },
  { name: 'Hechas', filters: [{ col: 'estado', op: 'es', value: 'Listo' }] },
];
const HELP: Record<string, string> = {
  nombre: 'La tarea. Clic para cambiarle el nombre.',
  ejecutor: 'Quién la hace. Pueden ser varios.',
  prioridad: 'Cuánto falta para la entrega. ✨ más de un día · 😱 menos de un día · 🔴 atrasada.',
  estado: 'Sin empezar → En curso → En revisión → Por aprobar → Listo. ✅ Aprobada para Claude = Claude la hace sin preguntar · ⏳ Esperando = Claude espera algo de Emanuel o Moisés.',
  app: 'Dónde se hace: 🌐 todo el ecosistema, Finanzas, la nube, la Plantilla o Project.',
  etiqueta: 'Qué va primero: 🔥 urgente e importante, ⭐ importante, ⚡ urgente o puede esperar.',
  empieza: 'Cuándo parte. Con la entrega arma la barra del cronograma.',
  entrega: 'Fecha de entrega (vence al final de ese día).',
  descripcion: 'Lo que hay que hacer, corto.',
};

const Pill: React.FC<{ cls: string; children: React.ReactNode }> = ({ cls, children }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}>{children}</span>
);

/** Ejecutor: photo + bold name for each person; click opens THE people menu (EntityMenu — the same one
 * as Closers / Clientes: directory link, search, + Nuevo, photos, roles), several people allowed. */
export const PeopleCell: React.FC<{ value: string[]; entities: Entity[]; photoOf: (name: string) => string | null; onChange: (v: string[]) => void; onCreate: (name: string) => Promise<string | null> }> = ({ value, entities, photoOf, onChange, onCreate }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button type="button" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())} className="flex min-w-0 flex-col items-start gap-1 rounded-md text-left hover:bg-white/[0.04]">
        {value.length ? (
          value.map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5">
              <McAvatar name={p} url={photoOf(p)} size={18} />
              <b className="truncate font-semibold text-white">{p}</b>
            </span>
          ))
        ) : (
          <span className="text-zinc-500">Sin ejecutor</span>
        )}
      </button>
      {anchor && (
        <EntityMenu
          anchor={anchor}
          items={entities}
          value={null}
          values={value}
          noneLabel="Sin ejecutor"
          newLabel="Nuevo ejecutor"
          directory={{ label: 'Ejecutores', tab: 'personal' }}
          onCreate={onCreate}
          onPick={(id) => onChange(id === null ? [] : value.includes(id) ? value.filter((x) => x !== id) : [...value, id])}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
};

/** A task's page = its own gray note (Sistema de Notas), started from the explanation in utils/dailyPages. */
type TaskActions = { onArchive: (t: DailyTask) => void; onDelete: (t: DailyTask) => Promise<boolean> };
type DailyMode = { docKey: string; labs: boolean; compact?: boolean };

const useTaskPage = (t: DailyTask) => {
  const bridge = useNotesBridge();
  if (!bridge?.openLinkedNote) return null;
  const id = `pendiente:${t.id}`;
  const note = bridge.linkedNote?.('task', id) ?? null;
  const open = () => {
    const extra = t.oldNote ? `<h2>📝 Nota anterior</h2><p>${t.oldNote.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : '';
    bridge.openLinkedNote!('task', id, t.title, 'Daily', undefined, `Daily · ${t.title}`, { html: dailyPageHtml(t) + extra, color: 'graphite' });
  };
  return { note, open };
};

/** Notion's "ABRIR" next to the name: opens the task's page (window modes: lateral, centro, flotante, completa). */
const OpenButton: React.FC<{ t: DailyTask }> = ({ t }) => {
  const page = useTaskPage(t);
  if (!page) return null;
  return (
    <button
      type="button"
      onClick={page.open}
      data-help="Abre la página de la tarea: qué hay que hacer, paso a paso, y espacio para tus notas y archivos."
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-[#1c1f26] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-200 opacity-0 shadow transition hover:bg-[#262a33] group-hover/row:opacity-100"
    >
      <PanelLeft className="h-3.5 w-3.5" /> Abrir
    </button>
  );
};

/** A board card opens the task's page on click (same page as ABRIR). */
const CardOpen: React.FC<{ t: DailyTask; children: React.ReactNode }> = ({ t, children }) => {
  const page = useTaskPage(t);
  return (
    <button type="button" onClick={page?.open} className="block w-full cursor-[inherit]">
      {children}
    </button>
  );
};

const Board: React.FC<DailyMode> = ({ docKey: KEY, labs, compact }) => {
  const store = useDocStore();
  const { name, space, userId } = useSpace();
  const views = useTableViewsStore();
  const confirm = useConfirm();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const raw = store?.ready ? (store.get(KEY) as DailyDoc | null) : null;
  const saved = raw && Array.isArray(raw.tasks) ? raw : null;
  // Cuenta nueva: parte con la Daily por defecto, y desde ahí es toda suya.
  useEffect(() => {
    if (!store?.ready || saved || labs) return;
    store.set(KEY, starterDaily(name, space));
  }, [store, saved, labs, KEY, name, space]);
  // The "Depende de" relation (this table → itself) that draws the timeline's arrows.
  useEffect(() => {
    if (!views?.ready) return;
    const cf = (views.get(`${TABLE}::campos`) as { fields?: { id: string; type: string; relation?: { table: string } }[]; values?: Record<string, unknown> } | null) ?? {};
    if ((cf.fields ?? []).some((f) => f.type === 'relation' && f.relation?.table === TABLE)) return;
    views.set(`${TABLE}::campos`, { ...cf, fields: [...(cf.fields ?? []), { id: 'dep', name: 'Depende de', type: 'relation', relation: { table: TABLE, reverseId: null } }], values: cf.values ?? {} });
  }, [views]);

  const doc: DailyDoc = saved ?? { tasks: [] };
  const people = Array.from(new Set([...(labs ? DEFAULT_PEOPLE : [name].filter(Boolean)), ...(doc.people ?? [])]));
  const apps = Array.from(new Set([...(labs ? DEFAULT_APPS : []), ...(doc.apps ?? []), ...doc.tasks.map((t) => t.app).filter(Boolean)]));
  // Always build on the latest saved list (a page left open must not undo edits made meanwhile).
  const fresh = (): DailyDoc => {
    const d = store?.get(KEY) as DailyDoc | null;
    return d && Array.isArray(d.tasks) ? d : doc;
  };
  const save = (tasks: DailyTask[], extra: Partial<DailyDoc> = {}) => store?.set(KEY, { ...fresh(), ...extra, tasks });
  // A team edit takes the 🤖 off (it only marks what Claude changed last).
  const patch = (id: string, p: Partial<DailyTask>) => save(fresh().tasks.map((t) => (t.id === id ? { ...t, ...p, by: null, byAt: null } : t)));
  // Claude writes the Daily from the terminal: bring its changes in when coming back to the tab and every 15 s.
  useEffect(() => {
    if (!store?.reload || !labs) return;
    const pull = () => document.visibilityState === 'visible' && store.reload!(KEY);
    const t = setInterval(pull, 15000);
    window.addEventListener('focus', pull);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', pull);
    };
  }, [store, labs, KEY]);
  const add = (p: Partial<DailyTask> = {}) =>
    save([...fresh().tasks, { id: newId(), title: 'Nueva tarea', executors: [], status: 'sin_empezar', app: labs ? ECOSYSTEM : (apps[0] ?? ''), tag: 'importante', start: todayISO(), due: null, description: '', order: Math.max(0, ...fresh().tasks.map((t) => t.order)) + 1, ...p }]);
  // Two confirmations: deleting is final (archiving is the soft option).
  const remove = async (t: DailyTask) => {
    if (!(await confirm({ title: `¿Borrar “${t.title}”?`, message: 'Se quita de la Daily para siempre. Si solo quieres sacarla de la vista, mejor archívala. Su página queda en Notas.', confirmLabel: 'Borrar', tone: 'danger' }))) return false;
    if (!(await confirm({ title: '¿Estás seguro?', message: 'No se puede deshacer.', confirmLabel: 'Sí, borrar', tone: 'danger' }))) return false;
    save(fresh().tasks.filter((x) => x.id !== t.id));
    return true;
  };
  const [showArchived, setShowArchived] = useState(false);
  // People = Recursos humanos of this account (mc_people: photo, roles) + Claude; photos also from profiles.
  const [staff, setStaff] = useState<{ name: string; avatar_url: string | null; roles: string[] }[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const loadStaff = React.useCallback(async () => {
    const [pp, pr] = await Promise.all([
      supabase.from('mc_people').select('name, avatar_url, roles').eq('owner_scope', userId ?? '').is('archived_at', null).order('name'),
      supabase.from('profiles').select('"displayName", "avatarUrl"').not('avatarUrl', 'is', null),
    ]);
    setStaff(((pp.data ?? []) as { name: string; avatar_url: string | null; roles: string[] | null }[]).map((x) => ({ ...x, roles: x.roles ?? [] })));
    const m: Record<string, string> = {};
    for (const x of (pr.data ?? []) as { displayName: string | null; avatarUrl: string | null }[]) if (x.displayName && x.avatarUrl) m[nameKey(x.displayName)] ??= x.avatarUrl;
    setPhotos(m);
  }, [userId]);
  useEffect(() => {
    loadStaff();
  }, [loadStaff]);
  const cap = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);
  const entities: Entity[] = [
    ...staff.map((x) => ({ id: x.name, name: x.name, avatar_url: x.avatar_url ?? photos[nameKey(x.name)] ?? null, sub: x.roles.map(cap).join(' · ') || null })),
    ...(labs ? [{ id: 'Claude', name: 'Claude', avatar_url: '/people/claude.svg', sub: 'Asistente IA' }] : []),
    ...people.filter((n) => n !== 'Claude' && !staff.some((x) => nameKey(x.name) === nameKey(n))).map((n) => ({ id: n, name: n, avatar_url: photos[nameKey(n)] ?? null, sub: null })),
  ];
  // "+ Nuevo ejecutor" = a new person in Recursos humanos (like "+ Nuevo closer").
  const createPerson = async (name: string) => {
    if (!userId) return null;
    const { error } = await supabase.from('mc_people').insert({ owner_scope: userId, name, roles: [] });
    if (error) return null;
    await loadStaff();
    return name;
  };
  const photoOf = (name: string) =>
    nameKey(name) === 'claude' ? '/people/claude.svg' : (staff.find((x) => nameKey(x.name) === nameKey(name))?.avatar_url ?? photos[nameKey(name)] ?? null);
  const actions: TaskActions = { onArchive: (t) => patch(t.id, { archived: !fresh().tasks.find((x) => x.id === t.id)?.archived }), onDelete: remove };

  // Urgente e importante first, then what's due sooner; finished at the end.
  const rows = useMemo(
    () =>
      doc.tasks.filter((t) => !!t.archived === showArchived).sort((a, b) => {
        const da = a.status === 'listo' ? 1 : 0;
        const db = b.status === 'listo' ? 1 : 0;
        return da - db || TAG_INFO[a.tag].rank - TAG_INFO[b.tag].rank || priorityOf(a, now).ms - priorityOf(b, now).ms || a.order - b.order;
      }),
    [doc.tasks, now, showArchived]
  );
  const live = doc.tasks.filter((t) => !t.archived);
  const counts = { abiertas: live.filter((t) => t.status !== 'listo').length, atrasadas: live.filter((t) => priorityOf(t, now).tone === 'late').length, hoy: live.filter((t) => priorityOf(t, now).tone === 'soon').length };

  const opt = <K extends string>(info: Record<K, { label: string }>) => (Object.keys(info) as K[]).map((k) => ({ value: k, label: info[k].label }));
  const statusOptions = opt(STATUS_INFO).filter((o) => labs || (o.value !== 'aprobada_claude' && o.value !== 'esperando'));
  const columns: Col<DailyTask>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
      noClamp: true,
      cell: (t) => (
        <span className="group/row flex items-start gap-1">
          <Editable label="Nombre" value={t.title} noConfirm onSave={async (v) => patch(t.id, { title: String(v ?? '').trim() || t.title })}>
            <b className={`line-clamp-2 font-semibold text-white ${t.status === 'listo' ? 'line-through opacity-60' : ''}`}>{t.title}</b>
          </Editable>
          {isClaude(t.by ?? '') && (
            <span className="shrink-0 text-xs opacity-70" data-help={`Lo hizo Claude${t.byAt ? ` · ${new Date(t.byAt).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`}>
              🤖
            </span>
          )}
          <span className="ml-auto" />
          <OpenButton t={t} />
          <button type="button" onClick={() => actions.onArchive(t)} data-help={t.archived ? 'Desarchivar' : 'Archivar'} aria-label={t.archived ? 'Desarchivar tarea' : 'Archivar tarea'} className="shrink-0 rounded p-1 text-zinc-500 opacity-0 transition hover:text-white focus:opacity-100 group-hover/row:opacity-100">
            {t.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => actions.onDelete(t)} data-help="Borrar" aria-label="Borrar tarea" className="shrink-0 rounded p-1 text-zinc-500 opacity-0 transition hover:text-rose-300 focus:opacity-100 group-hover/row:opacity-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      ),
    },
    {
      key: 'ejecutor',
      label: 'Ejecutor',
      noClamp: true,
      cell: (t) => <PeopleCell value={t.executors} entities={entities} photoOf={photoOf} onChange={(v) => patch(t.id, { executors: v })} onCreate={createPerson} />,
    },
    {
      key: 'prioridad',
      label: 'Prioridad',
      cell: (t) => {
        const p = priorityOf(t, now);
        const tone = { ok: 'text-emerald-300', soon: 'text-amber-300', late: 'text-rose-300', done: 'text-zinc-400', none: 'text-zinc-500' }[p.tone];
        return <span className={`whitespace-nowrap text-sm font-semibold ${tone}`}>{p.text}</span>;
      },
    },
    {
      key: 'estado',
      label: 'Estado',
      cell: (t) => (
        <Editable label="Estado" value={t.status} kind="select" required options={statusOptions} noConfirm onSave={async (v) => patch(t.id, { status: (v as DailyStatus) || t.status })}>
          <Pill cls={STATUS_INFO[t.status].cls}>{STATUS_INFO[t.status].label}</Pill>
        </Editable>
      ),
    },
    {
      key: 'app',
      label: labs ? 'Aplicación' : 'Área',
      cell: (t) => (
        <Editable label="Aplicación" value={t.app} kind="select" required options={apps.map((a) => ({ value: a, label: a }))} noConfirm onSave={async (v) => patch(t.id, { app: String(v || t.app) })}>
          <span className="whitespace-nowrap text-zinc-200">{t.app}</span>
        </Editable>
      ),
    },
    {
      key: 'etiqueta',
      label: 'Etiqueta',
      cell: (t) => (
        <Editable label="Etiqueta" value={t.tag} kind="select" required options={opt(TAG_INFO)} noConfirm onSave={async (v) => patch(t.id, { tag: (v as DailyTag) || t.tag })}>
          <Pill cls={TAG_INFO[t.tag].cls}>{TAG_INFO[t.tag].label}</Pill>
        </Editable>
      ),
    },
    {
      key: 'empieza',
      label: 'Empieza',
      cell: (t) => (
        <Editable label="Empieza" value={t.start} kind="date" noConfirm onSave={async (v) => patch(t.id, { start: (v as string) || null })}>
          <span className="whitespace-nowrap text-zinc-300">{showDate(t.start) || '—'}</span>
        </Editable>
      ),
    },
    {
      key: 'entrega',
      label: 'Entrega',
      cell: (t) => (
        <Editable label="Entrega" value={t.due} kind="date" noConfirm onSave={async (v) => patch(t.id, { due: (v as string) || null })}>
          <span className="whitespace-nowrap text-zinc-300">{showDate(t.due) || '—'}</span>
        </Editable>
      ),
    },
    {
      key: 'descripcion',
      label: 'Descripción',
      noClamp: true,
      cell: (t) => (
        <Editable label="Descripción" value={t.description} noConfirm onSave={async (v) => patch(t.id, { description: String(v ?? '') })}>
          <span className="line-clamp-2 text-xs text-zinc-400">{t.description || 'Agregar descripción'}</span>
        </Editable>
      ),
    },
  ];

  const table = <DataTable id={labs ? TABLE : `${TABLE}-${space}`} title="Daily - Pendientes" noTitle={!compact} columns={columns} rows={rows} rowKey={(t) => t.id} minWidth={1400} defaultViews={VIEWS} help={HELP} empty="No hay tareas. Toca “Nueva tarea”." />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-zinc-400">
          {counts.abiertas} abiertas · <span className="text-rose-300">{counts.atrasadas} atrasadas</span> · <span className="text-amber-300">{counts.hoy} vencen en menos de un día</span>
        </p>
        {(showArchived || doc.tasks.some((t) => t.archived)) && (
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-xs font-semibold text-zinc-400 underline-offset-4 hover:text-white hover:underline">
            {showArchived ? '← Volver a las tareas' : `Ver archivadas (${doc.tasks.filter((t) => t.archived).length})`}
          </button>
        )}
        {compact && <a href="#daily" className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-zinc-300 hover:text-white">Abrir completa <ArrowUpRight className="h-4 w-4" /></a>}
        <button type="button" onClick={() => add()} className={`${compact ? '' : 'ml-auto'} inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500`}>
          <Plus className="h-4 w-4" /> Nueva tarea
        </button>
      </div>
      {/* In a Section, like every Empresa table: its Configuración gets Tamaño, Mover and Apariencia. Hoy has its own fixed height. */}
      {compact ? table : <Section n={1} id="daily-tabla" title="Daily - Pendientes">{table}</Section>}
      {!showArchived && !compact && labs && (
        <DailyBoard
          tasks={rows}
          now={now}
          photoOf={photoOf}
          onPatch={patch}
          onAdd={add}
          renderOpen={(t, children) => <CardOpen t={t}>{children}</CardOpen>}
        />
      )}
      {!showArchived && !compact && labs && <DailyManual entities={entities} photoOf={photoOf} onCreatePerson={createPerson} />}
    </div>
  );
};

/** La Daily de la base activa; arriba de Hoy va en versión corta. */
export const DailyView: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { space, userId, email } = useSpace();
  const labs = email === LABS_EMAIL;
  const docKey = labs ? 'daily' : `organiza-daily-${space}`;
  const keys = useMemo(() => (labs ? [docKey, HOW_KEY] : [docKey]), [labs, docKey]);
  if (!userId) return null;
  return (
    <DocStoreProvider scope={userId} keys={keys}>
      <Board docKey={docKey} labs={labs} compact={compact} />
    </DocStoreProvider>
  );
};
