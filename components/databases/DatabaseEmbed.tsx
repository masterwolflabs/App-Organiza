'use client';

import React, { useEffect, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { Database, Loader2, Plus, Trash2 } from 'lucide-react';
import { DatabaseTable, Popover } from '@/components/databases/DatabaseTable';
import { createFromTemplate } from '@/components/databases/DatabasesView';
import { DB_TEMPLATES, UserDatabase } from '@/utils/databases';
import { useDatabaseStore, useOpenDatabase } from '@/utils/useDatabases';

/**
 * A database inside a note (TipTap node). Stored in the note's bodyHtml as
 * <div data-database-embed="<id>"></div> — the rows live in user_databases /
 * user_database_rows, not in the note. EVERY NoteEditor must load this
 * extension, or saving a note would silently drop the embed.
 */

const EmbedView: React.FC<NodeViewProps> = ({ node, deleteNode, editor }) => {
  const id = node.attrs.databaseId as string | null;
  const store = useDatabaseStore();
  const openFull = useOpenDatabase();
  return (
    <NodeViewWrapper className="my-3" data-drag-handle="">
      <div contentEditable={false} className="group/embed relative rounded-2xl border border-white/10 bg-[#11151c] p-3 text-white sm:p-4">
        {editor.isEditable && (
          <button
            type="button"
            onClick={() => deleteNode()}
            title="Quitar de la nota (la base de datos no se borra)"
            className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-zinc-500 opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-rose-300 group-hover/embed:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {!id ? (
          <p className="text-sm text-zinc-500">Base de datos sin vincular.</p>
        ) : !store ? (
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <Database className="h-4 w-4" /> Aquí hay una base de datos. Inicia sesión en Master Finanzas para verla.
          </p>
        ) : (
          <DatabaseTable databaseId={id} embedded onOpenFull={openFull} />
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const DatabaseEmbedExtension = Node.create({
  name: 'databaseEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      databaseId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-database-embed'),
        renderHTML: (attrs: { databaseId: string | null }) => (attrs.databaseId ? { 'data-database-embed': attrs.databaseId } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-database-embed]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    // Keystrokes / clicks inside the table belong to the table, not to the editor.
    return ReactNodeViewRenderer(EmbedView, { stopEvent: () => true, ignoreMutation: () => true });
  },
});

/** Toolbar button + menu: new database from a template, or insert an existing one. */
export const InsertDatabaseButton: React.FC<{ editor: Editor | null; className?: string; children: React.ReactNode }> = ({ editor, className, children }) => {
  const store = useDatabaseStore();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [list, setList] = useState<UserDatabase[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (anchor && store && list === null) store.list().then(setList);
  }, [anchor, store, list]);
  if (!store) return null;

  const insert = (id: string) => {
    editor?.chain().focus().insertContent([{ type: 'databaseEmbed', attrs: { databaseId: id } }, { type: 'paragraph' }]).run();
    setAnchor(null);
  };
  return (
    <>
      <button type="button" title="Insertar base de datos" onClick={(e) => setAnchor(e.currentTarget)} className={className}>
        {children}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={280}>
          <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Nueva base de datos</p>
          {DB_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                const db = await createFromTemplate(store, t);
                setBusy(false);
                if (db) insert(db.id);
                else setErr('No se pudo crear (¿falta la migración?).');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50"
            >
              <span>{t.icon}</span> {t.title}
              {busy && t.key === 'blank' && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
            </button>
          ))}
          {err && <p className="px-2.5 py-1 text-xs text-rose-300">{err}</p>}
          <p className="mt-1 border-t border-white/[0.06] px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Insertar una existente</p>
          {list === null ? (
            <p className="px-2.5 py-1.5 text-xs text-zinc-500">Cargando…</p>
          ) : list.length === 0 ? (
            <p className="px-2.5 py-1.5 text-xs text-zinc-500">Aún no tienes bases de datos.</p>
          ) : (
            list.map((d) => (
              <button key={d.id} type="button" onClick={() => insert(d.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]">
                <span>{d.icon || '📄'}</span>
                <span className="truncate">{d.title}</span>
                <Plus className="ml-auto h-3.5 w-3.5 text-zinc-500" />
              </button>
            ))
          )}
        </Popover>
      )}
    </>
  );
};
