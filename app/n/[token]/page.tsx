'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { NoteEditor } from '@/components/notes/NoteEditor';
import { WolfLogo } from '@/components/shell/WolfLogo';
import { Note } from '@/types/notes';
import { NoteImageStore, noteToDraft } from '@/utils/notes';
import type { SharedLinkNote } from '@/utils/useNotes';
import { Loader2, StickyNote } from 'lucide-react';

/**
 * Public page behind a note's share link (/n/<token>). Works WITHOUT an
 * account: reading/saving goes through the get_shared_note /
 * update_shared_note SECURITY DEFINER RPCs (see supabase/schema.sql's
 * 2026-09-29 block), and live collaboration uses the same broadcast channel
 * the app's editor uses. "Guardar en mi cuenta" sends the person to the app
 * (/?share=<token>), which — after login or registration — offers
 * "Mantener compartida" or "Duplicar para mí".
 */
export default function SharedNotePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [note, setNote] = useState<SharedLinkNote | null>(null);
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const u = sess.session?.user;
      if (u && !cancelled) setUser({ id: u.id, name: (u.user_metadata?.displayName as string) || u.email || 'Tú' });
      const { data, error } = await supabase.rpc('get_shared_note', { p_token: token });
      if (cancelled) return;
      if (error || !data) {
        setStatus('missing');
        return;
      }
      setNote(data as SharedLinkNote);
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const imageStore: NoteImageStore = useMemo(
    () => ({
      // Storage uploads need an account; a signed-in viewer uploads into their own folder.
      canUpload: Boolean(user),
      upload: async (blob, ext) => {
        if (!user) return null;
        const path = `${user.id}/notes/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('documents').upload(path, blob, { contentType: blob.type || undefined });
        return error ? null : path;
      },
      getUrls: async (paths) => {
        const { data } = await supabase.storage.from('documents').createSignedUrls(paths, 3600);
        const map: Record<string, string> = {};
        data?.forEach((d) => {
          if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
        });
        return map;
      },
      remove: async () => {
        /* files stay with the owner's note */
      },
    }),
    [user]
  );

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
        <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
      </div>
    );
  }

  if (status === 'missing' || !note || closed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#09090b] px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700">
          <WolfLogo className="h-7 w-7" />
        </div>
        <p className="text-sm font-medium text-zinc-200">{closed ? 'Cerraste la nota.' : 'Esta nota no está disponible.'}</p>
        <p className="max-w-xs text-xs text-zinc-500">
          {closed ? 'Puedes volver a abrirla con el mismo link.' : 'El link puede haber sido desactivado o la nota eliminada.'}
        </p>
        <a href="/" className="mt-3 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-500">
          Ir a Master Finanzas
        </a>
      </div>
    );
  }

  const role = note.isMine ? 'owner' : note.shareRole === 'editor' || note.memberRole === 'editor' ? 'editor' : 'viewer';

  const onUpdate = async (_id: string, patch: Partial<Note>): Promise<boolean> => {
    if (role === 'viewer') return false;
    const { error } = await supabase.rpc('update_shared_note', {
      p_token: token,
      p_title: patch.title ?? note.title,
      p_body: patch.body ?? note.body,
      p_body_html: patch.bodyHtml ?? note.bodyHtml ?? '',
      p_images: patch.images ?? note.images ?? [],
      p_attachments: patch.attachments ?? note.attachments ?? [],
    });
    return !error;
  };

  const banner = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-sky-500/[0.06] px-4 py-2.5 text-xs">
      <p className="flex items-center gap-2 text-zinc-300">
        <StickyNote className="h-3.5 w-3.5 text-sky-400" />
        {note.createdByName ? `${note.createdByName} compartió esta nota contigo` : 'Nota compartida contigo'} ·{' '}
        <span className="text-zinc-400">{role === 'viewer' ? 'Puedes ver' : 'Puedes editar'}</span>
      </p>
      {!note.isMine && (
        <a href={`/?share=${encodeURIComponent(token)}`} className="rounded-lg bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500">
          {user ? 'Guardar en mi cuenta' : 'Crear cuenta o iniciar sesión para guardarla'}
        </a>
      )}
      {!user && ((note.images?.length ?? 0) > 0 || (note.attachments?.length ?? 0) > 0) && (
        <p className="w-full text-[11px] text-zinc-500">Inicia sesión para ver las imágenes y archivos de esta nota.</p>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#09090b]">
      <NoteEditor
        initial={noteToDraft(note)}
        role={role}
        layout="full"
        imageStore={imageStore}
        backLabel="Master Finanzas"
        onCreate={async () => null}
        onUpdate={onUpdate}
        onDelete={async () => {}}
        onClose={() => setClosed(true)}
        linkedInfo={(note.links ?? []).find((l) => l.type === 'movement' || l.type === 'transfer') ?? null}
        meta={{ createdByName: note.createdByName, createdAt: note.created_at }}
        presenceName={user?.name ?? 'Invitado'}
        topSlot={banner}
        loadLatest={async () => {
          const { data } = await supabase.rpc('get_shared_note', { p_token: token });
          return (data as Partial<Note> | null) ?? null;
        }}
      />
    </div>
  );
}
