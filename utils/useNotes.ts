'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ActiveSession } from '@/types/auth';
import { Note, NoteCategory, NoteMember, NoteRole, NoteShareLink, NoteShareRole, ViewMode } from '@/types/notes';
import { ChatScope, appMatches, sendAppFor } from '@/utils/chatScope';
import { useSupabaseCollection } from '@/utils/useSupabaseCollection';
import { DEFAULT_NOTE_CATEGORIES, NoteImageStore, NoteInput, randomToken } from '@/utils/notes';

const BUCKET = 'documents';

export interface SharedNoteEntry {
  note: Note;
  role: NoteShareRole;
}

/** What get_shared_note (the public link RPC) returns. */
export type SharedLinkNote = Note & { shareRole: NoteShareRole; isMine: boolean; memberRole: NoteShareRole | null };

/**
 * Sistema de Notas — the one place that reads/writes the "notes" table and
 * its satellites (note_members, note_share_links, note_categories) for the
 * signed-in app. Own-scope notes come through useSupabaseCollection like
 * every other table (plus a Realtime subscription so a partner's edit shows
 * up in the list); "Compartidas conmigo" are notes in *someone else's*
 * scope that this account is a member of (RLS allows reading them via
 * note_member_role, see supabase/schema.sql's 2026-09-29 block).
 *
 * Plantilla / nube: es el de Finance + `scope` (utils/chatScope.ts, igual que
 * el chat): `notes.app` dice en qué app se creó cada nota (null = Finance,
 * SQL 10 de la nube). Las listas muestran solo las de `scope.filter` (null =
 * todas) y una nota nueva se guarda con la app de `sendAppFor(scope)`. Una
 * nota de otra app igual se puede abrir (por ejemplo desde una tarjeta del chat).
 */
export function useNotesSystem(session: ActiveSession, ownerScope: string, viewMode: ViewMode, scope: ChatScope) {
  const own = useSupabaseCollection<Note>('notes', ownerScope);
  const categoriesState = useSupabaseCollection<NoteCategory>('note_categories', ownerScope);
  const [memberRows, setMemberRows] = useState<NoteMember[]>([]);
  const [shareLinks, setShareLinks] = useState<NoteShareLink[]>([]);
  const [shared, setShared] = useState<SharedNoteEntry[]>([]);
  const ownItems = own.items;
  const setOwnItems = own.setItems;
  const filter = scope.filter;
  const scopedItems = useMemo(() => ownItems.filter((n) => appMatches(n.app, filter)), [ownItems, filter]);
  const scopedShared = useMemo(() => shared.filter((s) => appMatches(s.note.app, filter)), [shared, filter]);

  const ownIds = useMemo(() => new Set(ownItems.map((n) => n.id)), [ownItems]);

  const loadSharing = useCallback(async () => {
    const [{ data: members }, { data: links }] = await Promise.all([
      supabase.from('note_members').select('*'),
      supabase.from('note_share_links').select('*').eq('revoked', false),
    ]);
    const rows = (members ?? []) as NoteMember[];
    setMemberRows(rows);
    setShareLinks((links ?? []) as NoteShareLink[]);

    const mine = rows.filter((m) => m.userId === session.userId);
    if (mine.length === 0) {
      setShared([]);
      return;
    }
    const { data: notes } = await supabase
      .from('notes')
      .select('*')
      .in(
        'id',
        mine.map((m) => m.noteId)
      );
    const byId = new Map(((notes ?? []) as Note[]).map((n) => [n.id, n]));
    setShared(
      mine
        .map((m) => ({ note: byId.get(m.noteId), role: m.role }))
        .filter((e): e is SharedNoteEntry => Boolean(e.note) && !e.note!.deletedAt && e.note!.owner_scope !== ownerScope)
    );
  }, [session.userId, ownerScope]);

  useEffect(() => {
    loadSharing();
  }, [loadSharing]);

  // A partner editing a shared Master Wolf note (or the same account on
  // another device) shows up in the list without reloading.
  useEffect(() => {
    const channel = supabase
      .channel(`notes-list-${ownerScope}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `owner_scope=eq.${ownerScope}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (id) setOwnItems((prev) => prev.filter((n) => n.id !== id));
          return;
        }
        const row = payload.new as Note;
        setOwnItems((prev) => (prev.some((n) => n.id === row.id) ? prev.map((n) => (n.id === row.id ? row : n)) : [row, ...prev]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ownerScope, setOwnItems]);

  const imageStore: NoteImageStore = useMemo(
    () => ({
      canUpload: true,
      upload: async (blob, ext) => {
        // Always the *current* scope's folder — the bucket's insert policy
        // only allows 'mw' or your own uid, and a member editing someone
        // else's shared note can still read it back via can_read_note_file.
        const path = `${ownerScope}/notes/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || undefined });
        return error ? null : path;
      },
      getUrls: async (paths) => {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
        const map: Record<string, string> = {};
        data?.forEach((d) => {
          if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
        });
        return map;
      },
      remove: async (paths) => {
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      },
    }),
    [ownerScope]
  );

  const roleOf = useCallback(
    (noteId: string): NoteRole | null => {
      if (ownIds.has(noteId)) return 'owner';
      return shared.find((s) => s.note.id === noteId)?.role ?? null;
    },
    [ownIds, shared]
  );

  const findNote = useCallback(
    (noteId: string): Note | null => ownItems.find((n) => n.id === noteId) ?? shared.find((s) => s.note.id === noteId)?.note ?? null,
    [ownItems, shared]
  );

  /** Local-only patch — used when a collaborator's change arrives over Realtime. */
  const applyLocal = useCallback(
    (noteId: string, patch: Partial<Note>) => {
      setOwnItems((prev) => prev.map((n) => (n.id === noteId ? { ...n, ...patch } : n)));
      setShared((prev) => prev.map((s) => (s.note.id === noteId ? { ...s, note: { ...s.note, ...patch } } : s)));
    },
    [setOwnItems]
  );

  const create = async (input: NoteInput): Promise<string | null> => {
    const created = await own.add({
      ...input,
      updatedAt: new Date().toISOString(),
      viewScope: viewMode,
      app: sendAppFor(scope),
      createdBy: session.userId,
      createdByName: session.displayName || session.email,
    } as Omit<Note, 'id'>);
    return created ? created.id : null;
  };

  const update = async (noteId: string, patch: Partial<Note>): Promise<boolean> => {
    if (ownIds.has(noteId)) return own.update(noteId, patch);
    const { data, error } = await supabase.from('notes').update(patch).eq('id', noteId).select().single();
    if (error || !data) return false;
    setShared((prev) => prev.map((s) => (s.note.id === noteId ? { ...s, note: data as Note } : s)));
    return true;
  };

  const filesOf = (n: Note | null) => [...(n?.images ?? []).map((i) => i.path), ...(n?.attachments ?? []).map((a) => a.path)];

  /** Permanent delete — creator only (RLS enforces it too). Resolves false if it wasn't allowed. */
  const hardDelete = async (noteId: string): Promise<boolean> => {
    const note = findNote(noteId);
    const { data, error } = await supabase.from('notes').delete().eq('id', noteId).select('id');
    if (error || !data || data.length === 0) return false;
    setOwnItems((prev) => prev.filter((n) => n.id !== noteId));
    const paths = filesOf(note);
    if (paths.length) await imageStore.remove(paths).catch(() => {});
    return true;
  };

  const canHardDelete = (n: Note) => ownIds.has(n.id) && (!n.createdBy || n.createdBy === session.userId);

  const trash = (noteId: string) => update(noteId, { deletedAt: new Date().toISOString(), pinned: false });
  const restore = (noteId: string) => update(noteId, { deletedAt: null, archivedAt: null });
  const archive = (noteId: string) => update(noteId, { archivedAt: new Date().toISOString(), pinned: false });
  const unarchive = (noteId: string) => update(noteId, { archivedAt: null });

  // Files are copied, not shared by path: otherwise deleting the copy's
  // picture would delete the original's file too.
  const copyFile = async (path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    const ext = path.split('.').pop() || 'bin';
    return imageStore.upload(data, ext);
  };

  /** "Duplicar" (own note) and "Duplicar para mí" (a shared one): an independent copy in your scope. */
  const duplicate = async (note: Note, opts: { forMe?: boolean } = {}): Promise<string | null> => {
    const images = (
      await Promise.all((note.images ?? []).map(async (img) => ({ ...img, id: crypto.randomUUID(), path: (await copyFile(img.path)) ?? '' })))
    ).filter((i) => i.path);
    const attachments = (
      await Promise.all((note.attachments ?? []).map(async (a) => ({ ...a, id: crypto.randomUUID(), path: (await copyFile(a.path)) ?? '' })))
    ).filter((a) => a.path);
    return create({
      title: opts.forMe ? note.title : note.title ? `${note.title} (copia)` : 'Copia',
      body: note.body,
      bodyHtml: note.bodyHtml ?? '',
      images,
      attachments,
      color: note.color,
      pinned: false,
      category: note.category ?? null,
      links: note.links ?? [],
      // A movement has exactly one note; the copy keeps the "VINCULADO A"
      // snapshot in `links` but isn't *the* movement's note.
      linkedMovementId: null,
    });
  };

  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_NOTE_CATEGORIES);
    categoriesState.items.forEach((c) => set.add(c.name));
    ownItems.forEach((n) => n.category && set.add(n.category));
    return Array.from(set);
  }, [categoriesState.items, ownItems]);

  const addCategory = async (name: string) => {
    const clean = name.trim();
    if (!clean || categories.some((c) => c.toLowerCase() === clean.toLowerCase())) return;
    await categoriesState.add({ name: clean } as Omit<NoteCategory, 'id'>);
  };

  // --- Sharing ---
  const linksFor = (noteId: string) => shareLinks.filter((l) => l.noteId === noteId);
  const membersFor = (noteId: string) => memberRows.filter((m) => m.noteId === noteId && m.userId !== session.userId);

  const ensureShareLink = async (noteId: string, role: NoteShareRole): Promise<NoteShareLink | null> => {
    const existing = shareLinks.find((l) => l.noteId === noteId && l.role === role && !l.revoked);
    if (existing) return existing;
    const { data, error } = await supabase
      .from('note_share_links')
      .insert({ noteId, role, token: randomToken(), createdBy: session.userId })
      .select()
      .single();
    if (error || !data) return null;
    setShareLinks((prev) => [...prev, data as NoteShareLink]);
    return data as NoteShareLink;
  };

  const revokeShareLink = async (linkId: string) => {
    const { error } = await supabase.from('note_share_links').update({ revoked: true }).eq('id', linkId);
    if (!error) setShareLinks((prev) => prev.filter((l) => l.id !== linkId));
  };

  const setMember = async (noteId: string, userId: string, role: NoteShareRole): Promise<boolean> => {
    const { data, error } = await supabase
      .from('note_members')
      .upsert({ noteId, userId, role, addedBy: session.userId }, { onConflict: 'noteId,userId' })
      .select()
      .single();
    if (error || !data) return false;
    setMemberRows((prev) => [...prev.filter((m) => !(m.noteId === noteId && m.userId === userId)), data as NoteMember]);
    return true;
  };

  const removeMember = async (noteId: string, userId: string) => {
    const { error } = await supabase.from('note_members').delete().eq('noteId', noteId).eq('userId', userId);
    if (error) return;
    setMemberRows((prev) => prev.filter((m) => !(m.noteId === noteId && m.userId === userId)));
    if (userId === session.userId) setShared((prev) => prev.filter((s) => s.note.id !== noteId));
  };

  const leaveShared = (noteId: string) => removeMember(noteId, session.userId);

  const getByToken = async (token: string): Promise<SharedLinkNote | null> => {
    const { data, error } = await supabase.rpc('get_shared_note', { p_token: token });
    if (error || !data) return null;
    return data as SharedLinkNote;
  };

  const joinByToken = async (token: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('join_shared_note', { p_token: token });
    if (error || !data) return null;
    await loadSharing();
    return data as string;
  };

  /** A note referenced from somewhere else (e.g. a chat card) that may not be in local state yet. */
  const fetchNote = async (noteId: string): Promise<Note | null> => {
    const local = findNote(noteId);
    if (local) return local;
    const { data } = await supabase.from('notes').select('*').eq('id', noteId).maybeSingle();
    return (data as Note) ?? null;
  };

  return {
    notes: scopedItems,
    loading: own.loading,
    shared: scopedShared,
    categories,
    imageStore,
    roleOf,
    findNote,
    applyLocal,
    create,
    update,
    hardDelete,
    canHardDelete,
    trash,
    restore,
    archive,
    unarchive,
    duplicate,
    addCategory,
    linksFor,
    membersFor,
    ensureShareLink,
    revokeShareLink,
    setMember,
    removeMember,
    leaveShared,
    getByToken,
    joinByToken,
    fetchNote,
    reloadSharing: loadSharing,
  };
}

export type NotesSystem = ReturnType<typeof useNotesSystem>;
