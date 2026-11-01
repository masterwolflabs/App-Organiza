'use client';

import React, { useMemo, useState } from 'react';
import { Movement, Note, NoteColor, NoteShareRole } from '@/types/notes';
import { colorOf, formatCardDate, movementLinkOf, noteMatches } from '@/utils/notes';
import { CategoryList, ColorSwatches, MenuDivider, MenuItem, Popover } from '@/components/notes/NoteMenus';
import {
  Archive,
  ArchiveRestore,
  Clock,
  Copy,
  FileText,
  Image as ImageIcon,
  Inbox,
  Link2,
  LogOut,
  MoreHorizontal,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Share2,
  StickyNote,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';

// Deterministic tiny rotation per note so the board looks hand-stuck, not gridded.
function tilt(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.7;
}

export type NotesTab = 'all' | 'recent' | 'shared' | 'archived' | 'trash' | `cat:${string}`;

export interface NotesBoardActions {
  onNew: (category?: string | null) => void;
  onOpen: (note: Note) => void;
  onUpdate: (id: string, patch: Partial<Note>) => void;
  onShare: (note: Note) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onHardDelete: (id: string) => void;
  onDuplicate: (note: Note, forMe?: boolean) => void;
  onLeave: (id: string) => void;
  onAddCategory: (name: string) => void;
  canHardDelete: (note: Note) => boolean;
}

interface NotesBoardProps extends NotesBoardActions {
  notes: Note[];
  shared: { note: Note; role: NoteShareRole }[];
  loading: boolean;
  scopeLabel: string;
  categories: string[];
  movements?: Movement[];
  /** Participant names per note — for search by person and the "compartida" badge. */
  peopleFor: (noteId: string) => string[];
  isSharedByMe: (noteId: string) => boolean;
  tab: NotesTab;
  onTabChange: (tab: NotesTab) => void;
}

const RECENT_DAYS = 7;

type CardKind = 'own' | 'archived' | 'trash' | 'shared';

const NoteCard: React.FC<{
  note: Note;
  kind: CardKind;
  sharedRole?: NoteShareRole;
  sharedByMe: boolean;
  categories: string[];
  movements?: Movement[];
  actions: NotesBoardActions;
}> = ({ note, kind, sharedRole, sharedByMe, categories, movements, actions }) => {
  const [menu, setMenu] = useState<null | 'main' | 'category' | 'color'>(null);
  const imageCount = note.images?.length ?? 0;
  const fileCount = note.attachments?.length ?? 0;
  const linked = movementLinkOf(note, movements);
  const close = () => setMenu(null);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  // A movement's note is a minimal graphite card (the app's own look, see
  // .note-dark in globals.css); every other note is a classic post-it.
  const movementNote = Boolean(note.linkedMovementId);
  return (
    // Classic square post-it: pastel paper, a deterministic small tilt that
    // straightens on hover, a soft shadow and a curled corner.
    <div
      style={{ '--tilt': `${kind === 'trash' || movementNote ? 0 : tilt(note.id)}deg` } as React.CSSProperties}
      className={`theme-fixed group relative aspect-square rotate-[var(--tilt)] transition-transform duration-200 hover:-translate-y-1 hover:rotate-0 ${movementNote ? 'note-dark' : ''}`}
    >
      <button
        onClick={() => (kind === 'trash' ? undefined : actions.onOpen(note))}
        disabled={kind === 'trash'}
        className={`relative flex h-full w-full flex-col overflow-hidden text-left text-zinc-900 ${
          movementNote
            ? 'rounded-2xl border border-white/[0.07] bg-[#16171b] p-4 transition-colors hover:border-white/15'
            : `rounded-[3px] p-4 pt-6 shadow-[0_12px_24px_-10px_rgba(0,0,0,0.7)] ${colorOf(note.color).bg}`
        } ${kind === 'trash' ? 'opacity-70' : ''}`}
      >
        {movementNote ? (
          <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-sky-400/80">
            <Link2 className="h-3 w-3" /> Movimiento
          </p>
        ) : (
          <>
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-black/10 to-transparent" />
            <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-7 w-7 bg-gradient-to-tl from-black/20 via-black/5 to-transparent" />
          </>
        )}
        <h3 className="line-clamp-2 pr-6 text-[15px] font-bold leading-snug">{note.title.trim() || 'Sin título'}</h3>
        {note.body.trim() && <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-[13px] leading-snug text-zinc-900/75">{note.body}</p>}
        {linked && (
          <p className="mt-2 flex items-center gap-1 truncate text-[11px] text-zinc-900/60">
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{linked.label}</span>
          </p>
        )}
        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[11px] font-medium text-zinc-900/55">
          {note.category && <span className="rounded-full bg-black/10 px-2 py-0.5 text-zinc-900/70">{note.category}</span>}
          <span>{formatCardDate(note.updatedAt)}</span>
          {kind === 'shared' && note.createdByName && <span>· {note.createdByName}</span>}
          {(sharedByMe || kind === 'shared') && <Users className="h-3 w-3" aria-label="Compartida" />}
          {imageCount > 0 && (
            <span className="flex items-center gap-0.5">
              <ImageIcon className="h-3 w-3" />
              {imageCount}
            </span>
          )}
          {fileCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Paperclip className="h-3 w-3" />
              {fileCount}
            </span>
          )}
        </span>
      </button>

      <div className="absolute right-1.5 top-1.5 z-10 flex items-center">
        {note.pinned && kind === 'own' && <Pin className="mr-0.5 h-3.5 w-3.5 rotate-45 fill-current text-zinc-900/70" />}
        <Popover
          open={menu !== null}
          onClose={close}
          width="w-56"
          anchor={
            <button
              onClick={() => setMenu(menu ? null : 'main')}
              title="Más opciones"
              className={`flex h-7 w-7 items-center justify-center rounded-full text-zinc-900/70 transition-opacity hover:bg-black/10 hover:text-zinc-900 ${
                menu ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
              }`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        >
          {menu === 'category' ? (
            <CategoryList
              categories={categories}
              value={note.category ?? null}
              onAdd={actions.onAddCategory}
              onPick={(c) => {
                actions.onUpdate(note.id, { category: c });
                close();
              }}
            />
          ) : menu === 'color' ? (
            <ColorSwatches
              value={note.color}
              onChange={(c: NoteColor) => {
                actions.onUpdate(note.id, { color: c });
                close();
              }}
            />
          ) : kind === 'trash' ? (
            <>
              <MenuItem icon={RotateCcw} label="Restaurar" onClick={run(() => actions.onRestore(note.id))} />
              {actions.canHardDelete(note) && (
                <MenuItem
                  icon={Trash2}
                  label="Eliminar definitivamente"
                  danger
                  onClick={run(() => {
                    if (window.confirm('¿Eliminar esta nota para siempre? No se puede deshacer.')) actions.onHardDelete(note.id);
                  })}
                />
              )}
              {!actions.canHardDelete(note) && <p className="px-3 py-2 text-[11px] text-zinc-500">Solo quien la creó puede eliminarla definitivamente.</p>}
            </>
          ) : kind === 'shared' ? (
            <>
              <MenuItem icon={FileText} label="Abrir" onClick={run(() => actions.onOpen(note))} />
              <MenuItem icon={Copy} label="Duplicar para mí" onClick={run(() => actions.onDuplicate(note, true))} />
              <MenuDivider />
              <MenuItem
                icon={LogOut}
                label="Dejar de ver"
                danger
                onClick={run(() => {
                  if (window.confirm('¿Quitar esta nota de "Compartidas conmigo"?')) actions.onLeave(note.id);
                })}
              />
              {sharedRole && <p className="px-3 pb-1.5 pt-1 text-[10px] text-zinc-500">{sharedRole === 'editor' ? 'Puedes editar' : 'Solo lectura'}</p>}
            </>
          ) : (
            <>
              <MenuItem icon={FileText} label="Abrir" onClick={run(() => actions.onOpen(note))} />
              <MenuItem icon={Share2} label="Compartir" onClick={run(() => actions.onShare(note))} />
              {kind === 'own' && (
                <MenuItem
                  icon={note.pinned ? PinOff : Pin}
                  label={note.pinned ? 'Quitar de fijadas' : 'Fijar arriba'}
                  onClick={run(() => actions.onUpdate(note.id, { pinned: !note.pinned }))}
                />
              )}
              {kind === 'archived' ? (
                <MenuItem icon={ArchiveRestore} label="Restaurar" onClick={run(() => actions.onUnarchive(note.id))} />
              ) : (
                <MenuItem icon={Archive} label="Archivar" onClick={run(() => actions.onArchive(note.id))} />
              )}
              <MenuItem icon={Copy} label="Duplicar" onClick={run(() => actions.onDuplicate(note))} />
              <MenuItem icon={Tag} label="Mover categoría" hint={note.category ?? ''} onClick={() => setMenu('category')} />
              {!movementNote && <MenuItem icon={StickyNote} label="Cambiar color" onClick={() => setMenu('color')} />}
              <MenuDivider />
              <MenuItem icon={Trash2} label="Mover a papelera" danger onClick={run(() => actions.onTrash(note.id))} />
            </>
          )}
        </Popover>
      </div>
    </div>
  );
};

const Empty: React.FC<{ title: string; subtitle?: string; onNew?: () => void }> = ({ title, subtitle, onNew }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
    <StickyNote className="h-8 w-8 text-zinc-700" />
    <p className="mt-3 text-sm font-medium text-zinc-300">{title}</p>
    {subtitle && <p className="mt-1 max-w-xs text-xs text-zinc-500">{subtitle}</p>}
    {onNew && (
      <button onClick={onNew} className="mt-5 flex items-center gap-2 rounded-xl bg-yellow-300 px-4 py-2.5 text-xs font-semibold text-zinc-900 hover:bg-yellow-200">
        <Plus className="h-4 w-4" />
        Nueva nota
      </button>
    )}
  </div>
);

export const NotesBoard: React.FC<NotesBoardProps> = (props) => {
  const { notes, shared, loading, scopeLabel, categories, movements, peopleFor, isSharedByMe, tab, onTabChange } = props;
  const actions: NotesBoardActions = props;
  const [query, setQuery] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const active = useMemo(() => notes.filter((n) => !n.deletedAt && !n.archivedAt), [notes]);
  const archived = useMemo(() => notes.filter((n) => !n.deletedAt && n.archivedAt), [notes]);
  const trashed = useMemo(() => notes.filter((n) => n.deletedAt), [notes]);
  const byDate = (a: Note, b: Note) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    active.forEach((n) => {
      if (n.category) map[n.category] = (map[n.category] ?? 0) + 1;
    });
    return map;
  }, [active]);

  const q = query.trim();
  const searching = q.length > 0;

  // Global search: title, text, category, person, related movement — across
  // everything except the trash (own, archived and shared with me).
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const own = [...active, ...archived].filter((n) => noteMatches(n, q, peopleFor(n.id)));
    const sh = shared.filter((s) => noteMatches(s.note, q, peopleFor(s.note.id)));
    return [
      ...own.map((n) => ({ note: n, kind: (n.archivedAt ? 'archived' : 'own') as CardKind, role: undefined })),
      ...sh.map((s) => ({ note: s.note, kind: 'shared' as CardKind, role: s.role })),
    ].sort((a, b) => byDate(a.note, b.note));
  }, [searching, active, archived, shared, q, peopleFor]);

  const cutoff = Date.now() - RECENT_DAYS * 86400000;
  const tabNotes: { note: Note; kind: CardKind; role?: NoteShareRole }[] = searching
    ? searchResults
    : tab === 'all'
    ? [...active].sort((a, b) => Number(b.pinned) - Number(a.pinned) || byDate(a, b)).map((n) => ({ note: n, kind: 'own' as CardKind }))
    : tab === 'recent'
    ? [...active, ...shared.map((s) => s.note)]
        .filter((n) => new Date(n.updatedAt).getTime() >= cutoff)
        .sort(byDate)
        .slice(0, 30)
        .map((n) => {
          const s = shared.find((x) => x.note.id === n.id);
          return { note: n, kind: (s ? 'shared' : 'own') as CardKind, role: s?.role };
        })
    : tab === 'shared'
    ? [...shared].sort((a, b) => byDate(a.note, b.note)).map((s) => ({ note: s.note, kind: 'shared' as CardKind, role: s.role }))
    : tab === 'archived'
    ? [...archived].sort(byDate).map((n) => ({ note: n, kind: 'archived' as CardKind }))
    : tab === 'trash'
    ? [...trashed]
        .sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime())
        .map((n) => ({ note: n, kind: 'trash' as CardKind }))
    : active
        .filter((n) => n.category === tab.slice(4))
        .sort(byDate)
        .map((n) => ({ note: n, kind: 'own' as CardKind }));

  const currentCategory = tab.startsWith('cat:') ? tab.slice(4) : null;

  const navItems: { key: NotesTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { key: 'all', label: 'Todas', icon: StickyNote, count: active.length },
    { key: 'recent', label: 'Recientes', icon: Clock },
    { key: 'shared', label: 'Compartidas conmigo', icon: Users, count: shared.length || undefined },
    { key: 'archived', label: 'Archivadas', icon: Archive, count: archived.length || undefined },
    { key: 'trash', label: 'Papelera', icon: Trash2, count: trashed.length || undefined },
  ];

  const navBtn = (key: NotesTab, label: string, Icon: React.ComponentType<{ className?: string }>, count?: number) => {
    const isActive = !searching && tab === key;
    return (
      <button
        key={key}
        onClick={() => {
          setQuery('');
          onTabChange(key);
        }}
        className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors md:w-full ${
          isActive ? 'bg-sky-500/10 text-sky-300' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {count !== undefined && <span className="text-[11px] text-zinc-600">{count}</span>}
      </button>
    );
  };

  const submitCategory = () => {
    const clean = newCategory.trim();
    if (clean) {
      actions.onAddCategory(clean);
      onTabChange(`cat:${clean}`);
    }
    setNewCategory('');
    setAddingCategory(false);
  };

  const empty = (() => {
    if (loading) return null;
    if (searching) return <Empty title={`Ninguna nota coincide con "${q}".`} subtitle="Prueba con otra palabra, una categoría o el nombre de una persona." />;
    switch (tab) {
      case 'all':
        return <Empty title="No tienes notas todavía." subtitle="Guarda información importante, movimientos o ideas financieras." onNew={() => actions.onNew()} />;
      case 'recent':
        return <Empty title="No hay notas recientes." subtitle="Aquí aparecen las notas editadas en los últimos 7 días." />;
      case 'shared':
        return <Empty title="Nadie ha compartido notas contigo todavía." subtitle="Cuando alguien te comparta una nota, aparecerá aquí." />;
      case 'archived':
        return <Empty title="No tienes notas archivadas." />;
      case 'trash':
        return <Empty title="La papelera está vacía." />;
      default:
        return <Empty title={`No hay notas en ${currentCategory}.`} onNew={() => actions.onNew(currentCategory)} />;
    }
  })();

  const pinnedCount = !searching && tab === 'all' ? tabNotes.filter((t) => t.note.pinned).length : 0;
  const grid = 'grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';
  const renderCard = (t: { note: Note; kind: CardKind; role?: NoteShareRole }) => (
    <NoteCard
      key={t.note.id}
      note={t.note}
      kind={t.kind}
      sharedRole={t.role}
      sharedByMe={isSharedByMe(t.note.id)}
      categories={categories}
      movements={movements}
      actions={actions}
    />
  );

  const heading = searching
    ? 'Resultados'
    : currentCategory ?? navItems.find((n) => n.key === tab)?.label ?? 'Notas';

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
            <StickyNote className="h-5 w-5 text-yellow-300" />
            <span>Notas</span>
          </h2>
          <p className="text-xs text-zinc-500">Contexto financiero, movimientos e ideas — {scopeLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar notas, categorías, personas…"
              className="w-full rounded-xl border border-white/[0.07] bg-[#121317] py-2.5 pl-9 pr-8 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none sm:w-72"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-zinc-200">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => actions.onNew(currentCategory)}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-yellow-300 px-4 py-2.5 text-xs font-semibold text-zinc-900 shadow-lg shadow-yellow-300/20 transition-all hover:bg-yellow-200 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva nota</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {/* Sections — sidebar on desktop, horizontal chips on phones */}
        <nav className="md:w-52 md:shrink-0">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 [scrollbar-width:none]">
            {navItems.map((n) => navBtn(n.key, n.label, n.icon, n.count))}
          </div>
          <div className="mt-4 hidden md:block">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Categorías</p>
            {categories.map((c) => navBtn(`cat:${c}`, c, Tag, categoryCounts[c]))}
            {addingCategory ? (
              <div className="flex items-center gap-1.5 px-1 py-1">
                <input
                  autoFocus
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitCategory();
                    if (e.key === 'Escape') setAddingCategory(false);
                  }}
                  onBlur={submitCategory}
                  placeholder="Nombre"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none"
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingCategory(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
              >
                <Plus className="h-4 w-4" />
                Nueva categoría
              </button>
            )}
          </div>
          {/* Phones: categories as a compact select */}
          <select
            value={currentCategory ?? ''}
            onChange={(e) => onTabChange(e.target.value ? (`cat:${e.target.value}` as NotesTab) : 'all')}
            className="mt-2 w-full rounded-xl border border-white/[0.07] bg-[#121317] px-3 py-2 text-xs text-zinc-300 focus:outline-none md:hidden"
          >
            <option value="">Filtrar por categoría…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </nav>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{heading}</h3>
            {!searching && tab === 'trash' && trashed.length > 0 && (
              <p className="flex items-center gap-1 text-[11px] text-zinc-600">
                <Inbox className="h-3 w-3" /> Restaura o elimina definitivamente desde el menú de cada nota.
              </p>
            )}
          </div>
          {loading && tabNotes.length === 0 ? (
            <div className={grid}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-square animate-pulse rounded-[3px] bg-white/[0.04]" />
              ))}
            </div>
          ) : tabNotes.length === 0 ? (
            empty
          ) : pinnedCount > 0 ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  <Pin className="h-3 w-3" /> Fijadas
                </p>
                <div className={grid}>{tabNotes.filter((t) => t.note.pinned).map(renderCard)}</div>
              </div>
              {tabNotes.length > pinnedCount && <div className={grid}>{tabNotes.filter((t) => !t.note.pinned).map(renderCard)}</div>}
            </div>
          ) : (
            <div className={grid}>{tabNotes.map(renderCard)}</div>
          )}
        </div>
      </div>
    </section>
  );
};
