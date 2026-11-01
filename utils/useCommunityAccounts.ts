'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { appMatches, appOf, ChatScope, scopeQuery, sendAppFor } from '@/utils/chatScope';
import { supabase } from '@/lib/supabaseClient';
import { ActiveSession } from '@/types/auth';
import { AccountProfile, CommunityMessage, Conversation, SupportAttachment } from '@/types/community';

// Every real "Personas" conversation id is namespaced with this prefix so
// app/page.tsx's handleSendCommunityMessage can tell a real account apart
// from a mock group/channel id without a separate lookup.
export const REAL_DM_PREFIX = 'real-dm-';

const AUDIO_BUCKET = 'community-audio';
/** Pictures/audio/video/files sent in DMs and groups (schema.sql "2026-10-04, archivos en el chat"). */
export const FILES_BUCKET = 'community-files';
export const MAX_CHAT_FILE = 50 * 1024 * 1024;

/** Uploads a chat file under the sender's own folder and returns the attachment to store on the message. */
export async function uploadChatFile(userId: string, file: Blob, name: string): Promise<SupportAttachment> {
  if (file.size > MAX_CHAT_FILE) throw new Error('El archivo supera los 50 MB.');
  const safe = name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'archivo';
  const path = `${userId}/chat/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error('No se pudo subir el archivo.');
  return { path, name, mime: file.type || 'application/octet-stream', size: file.size };
}

export async function resolveChatFileUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

const AVATAR_COLORS = ['bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600', 'bg-amber-600', 'bg-teal-600', 'bg-fuchsia-600'];
function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function attachmentLabel(mime: string) {
  return mime.startsWith('image/') ? '📷 Foto' : mime.startsWith('video/') ? '🎬 Video' : mime.startsWith('audio/') ? '🎵 Audio' : '📎 Archivo';
}

function previewFor(m: Pick<CommunityMessage, 'senderId' | 'text' | 'audioPath' | 'noteId' | 'attachment'>): string {
  const body = m.noteId ? '📝 Nota' : m.attachment ? attachmentLabel(m.attachment.mime) : m.audioPath ? '🎤 Mensaje de voz' : m.text;
  return m.senderId === 'me' ? `Tú: ${body}` : body;
}

interface DirectMessageRow {
  id: string;
  senderId: string;
  recipientId: string;
  text: string;
  audioPath: string | null;
  audioDuration: number | null;
  noteId?: string | null;
  attachment?: SupportAttachment | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  app?: string | null;
  created_at: string;
}

function rowToMessage(m: DirectMessageRow, own: boolean): CommunityMessage {
  return {
    id: m.id,
    app: appOf(m.app),
    senderId: own ? 'me' : m.senderId,
    senderName: '',
    text: m.text,
    createdAt: m.created_at,
    audioPath: m.audioPath ?? undefined,
    audioDuration: m.audioDuration ?? undefined,
    noteId: m.noteId ?? undefined,
    attachment: m.attachment ?? undefined,
    status: m.readAt ? 'read' : m.deliveredAt ? 'delivered' : 'sent',
  };
}

/**
 * Real, Supabase-backed accounts + direct messages for "Comunidad" —
 * everything else in that module (groups, channels) is still mock/demo
 * data, see utils/communityMock.ts. Every other Master Wolf Finance account
 * (from the "profiles" table) shows up as a "Personas" conversation
 * automatically, WhatsApp-style, whether or not you've messaged them yet;
 * new/edited/deleted messages (text or voice) arrive live via a Realtime
 * subscription, not polling.
 */
export function useCommunityAccounts(session: ActiveSession | null, scope: ChatScope = { filter: null, send: null }) {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [messagesByUser, setMessagesByUser] = useState<Record<string, CommunityMessage[]>>({});
  // Chat por app (plantilla): con qué app se guarda un mensaje nuevo a esta persona.
  const messagesRef = useRef(messagesByUser);
  messagesRef.current = messagesByUser;
  const appFor = (otherUserId: string) => {
    const list = messagesRef.current[otherUserId];
    return sendAppFor(scope, list?.[list.length - 1]?.app);
  };

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      // Keeps this account's directory entry current on every login —
      // client-side upsert instead of a DB trigger, consistent with this
      // app's plain-client-+-RLS style everywhere else.
      await supabase.rpc('touch_my_profile', { p_display_name: session.displayName, p_email: session.email });
      // Google photo as the default profile picture — only when the user never set their own.
      if (session.avatarUrl) {
        await supabase.from('profiles').update({ avatarUrl: session.avatarUrl }).eq('id', session.userId).is('avatarUrl', null);
      }

      const [{ data: profileRows }, { data: messageRows }] = await Promise.all([
        // Directory fields only — email/phone/birth date of other accounts are private.
        supabase.from('profiles').select('id, "displayName", "avatarUrl"').neq('id', session.userId),
        scopeQuery(
          supabase.from('direct_messages').select('*').or(`senderId.eq.${session.userId},recipientId.eq.${session.userId}`),
          scope.filter
        ).order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;

      setProfiles(
        ((profileRows ?? []) as { id: string; displayName: string; avatarUrl?: string | null }[]).map((p) => ({
          id: p.id,
          displayName: p.displayName || 'Cuenta',
          email: '',
          avatarUrl: p.avatarUrl ?? null,
        }))
      );

      const buckets: Record<string, CommunityMessage[]> = {};
      ((messageRows ?? []) as DirectMessageRow[]).forEach((m) => {
        const own = m.senderId === session.userId;
        const otherId = own ? m.recipientId : m.senderId;
        (buckets[otherId] ??= []).push(rowToMessage(m, own));
      });
      setMessagesByUser(buckets);
      // My app received everything addressed to me → senders see ✓✓.
      supabase.rpc('mark_dm_delivered').then(() => {});
    })();

    let deliverTimer: ReturnType<typeof setTimeout> | null = null;
    const markDeliveredSoon = () => {
      if (deliverTimer) clearTimeout(deliverTimer);
      deliverTimer = setTimeout(() => supabase.rpc('mark_dm_delivered').then(() => {}), 800);
    };

    // One inbox-wide subscription (filtered to rows where I'm the
    // recipient) covers every real conversation for INSERT/UPDATE/DELETE —
    // my own actions (send/edit/delete a message I sent, clear a whole
    // conversation) are already applied to local state optimistically by
    // the functions below, so only the other side's edits need to arrive
    // over the wire.
    const channel = supabase
      .channel(`direct-messages-${session.userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipientId=eq.${session.userId}` },
        (payload) => {
          const m = payload.new as DirectMessageRow;
          if (!appMatches(m.app, scope.filter)) return; // de otra app
          setMessagesByUser((prev) => {
            const list = prev[m.senderId] ?? [];
            if (list.some((x) => x.id === m.id)) return prev;
            return { ...prev, [m.senderId]: [...list, rowToMessage(m, false)] };
          });
          markDeliveredSoon();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `recipientId=eq.${session.userId}` },
        (payload) => {
          const m = payload.new as DirectMessageRow;
          setMessagesByUser((prev) => {
            const list = prev[m.senderId];
            if (!list) return prev;
            return { ...prev, [m.senderId]: list.map((x) => (x.id === m.id ? { ...x, text: m.text } : x)) };
          });
        }
      )
      // Receipts on MY messages (the other person received / read them).
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `senderId=eq.${session.userId}` },
        (payload) => {
          const m = payload.new as DirectMessageRow;
          const status: CommunityMessage['status'] = m.readAt ? 'read' : m.deliveredAt ? 'delivered' : 'sent';
          setMessagesByUser((prev) => {
            const list = prev[m.recipientId];
            if (!list) return prev;
            return { ...prev, [m.recipientId]: list.map((x) => (x.id === m.id ? { ...x, status } : x)) };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'direct_messages', filter: `recipientId=eq.${session.userId}` },
        (payload) => {
          const m = payload.old as DirectMessageRow;
          setMessagesByUser((prev) => {
            const list = prev[m.senderId];
            if (!list) return prev;
            return { ...prev, [m.senderId]: list.filter((x) => x.id !== m.id) };
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (deliverTimer) clearTimeout(deliverTimer);
      supabase.removeChannel(channel);
    };
  }, [session, scope.filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async (otherUserId: string, text: string) => {
    if (!session) return;
    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ senderId: session.userId, recipientId: otherUserId, text, app: appFor(otherUserId) })
      .select()
      .single();
    if (error || !data) return;
    setMessagesByUser((prev) => {
      const list = prev[otherUserId] ?? [];
      return {
        ...prev,
        [otherUserId]: [...list, { id: data.id, app: appOf(data.app), senderId: 'me', senderName: 'Tú', text, createdAt: data.created_at, status: 'sent' }],
      };
    });
  };

  // Uploads under this account's own uid folder (matches the bucket's
  // insert policy), then inserts the message row with the resulting path —
  // the read policy lets the recipient fetch a signed URL for it by joining
  // against this exact row (see supabase/schema.sql's 2026-09-28 part 3
  // block), even though the file lives under the sender's folder, not theirs.
  const sendAudioMessage = async (otherUserId: string, blob: Blob, durationSec: number) => {
    if (!session) return;
    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
    const path = `${session.userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(AUDIO_BUCKET).upload(path, blob, { contentType: blob.type });
    if (uploadError) return;

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ senderId: session.userId, recipientId: otherUserId, text: '', audioPath: path, audioDuration: Math.round(durationSec), app: appFor(otherUserId) })
      .select()
      .single();
    if (error || !data) {
      await supabase.storage.from(AUDIO_BUCKET).remove([path]).catch(() => {});
      return;
    }
    setMessagesByUser((prev) => {
      const list = prev[otherUserId] ?? [];
      return {
        ...prev,
        [otherUserId]: [
          ...list,
          { id: data.id, app: appOf(data.app), senderId: 'me', senderName: 'Tú', text: '', audioPath: path, audioDuration: Math.round(durationSec), createdAt: data.created_at, status: 'sent' },
        ],
      };
    });
  };

  // Shares one of your notes in the DM as a card. Access for the other person
  // (note_members) is granted by the caller — see app/page.tsx.
  const sendNoteMessage = async (otherUserId: string, noteId: string) => {
    if (!session) return;
    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ senderId: session.userId, recipientId: otherUserId, text: '', noteId, app: appFor(otherUserId) })
      .select()
      .single();
    if (error || !data) return;
    setMessagesByUser((prev) => {
      const list = prev[otherUserId] ?? [];
      return {
        ...prev,
        [otherUserId]: [...list, { id: data.id, app: appOf(data.app), senderId: 'me', senderName: 'Tú', text: '', noteId, createdAt: data.created_at, status: 'sent' }],
      };
    });
  };

  // A picture/audio/video/any file from the computer.
  const sendFile = async (otherUserId: string, file: File) => {
    if (!session) return;
    const attachment = await uploadChatFile(session.userId, file, file.name);
    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ senderId: session.userId, recipientId: otherUserId, text: '', attachment, app: appFor(otherUserId) })
      .select()
      .single();
    if (error || !data) {
      await supabase.storage.from(FILES_BUCKET).remove([attachment.path]).catch(() => {});
      throw new Error('No se pudo enviar el archivo.');
    }
    setMessagesByUser((prev) => {
      const list = prev[otherUserId] ?? [];
      return { ...prev, [otherUserId]: [...list, { id: data.id, app: appOf(data.app), senderId: 'me', senderName: 'Tú', text: '', attachment, createdAt: data.created_at, status: 'sent' }] };
    });
  };

  /** I opened the chat with this person → their messages turn into blue ✓✓ for them. */
  const markRead = async (otherUserId: string) => {
    const unread = (messagesByUser[otherUserId] ?? []).some((m) => m.senderId !== 'me' && m.status !== 'read');
    if (!unread) return;
    setMessagesByUser((prev) => ({
      ...prev,
      [otherUserId]: (prev[otherUserId] ?? []).map((m) => (m.senderId !== 'me' ? { ...m, status: 'read' } : m)),
    }));
    await supabase.rpc('mark_dm_read', { p_other: otherUserId });
  };

  const resolveAudioUrl = async (path: string): Promise<string | null> => {
    if (path.startsWith('blob:')) return path; // mock/local recording preview, already playable
    const { data } = await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };

  // Only ever called on a message this account sent (the "me" bubbles are
  // the only ones with edit/delete controls — see ConversationPane.tsx), so
  // the update policy's sender-only check always passes here. Editing text
  // on a voice message never happens — ConversationPane hides the edit
  // control whenever a message has audioPath set.
  const editMessage = async (otherUserId: string, messageId: string, text: string) => {
    const { error } = await supabase.from('direct_messages').update({ text }).eq('id', messageId);
    if (error) return;
    setMessagesByUser((prev) => {
      const list = prev[otherUserId];
      if (!list) return prev;
      return { ...prev, [otherUserId]: list.map((x) => (x.id === messageId ? { ...x, text } : x)) };
    });
  };

  const deleteMessage = async (otherUserId: string, messageId: string) => {
    const target = messagesByUser[otherUserId]?.find((m) => m.id === messageId);
    const { error } = await supabase.from('direct_messages').delete().eq('id', messageId);
    if (error) return;
    setMessagesByUser((prev) => {
      const list = prev[otherUserId];
      if (!list) return prev;
      return { ...prev, [otherUserId]: list.filter((x) => x.id !== messageId) };
    });
    if (target?.audioPath) await supabase.storage.from(AUDIO_BUCKET).remove([target.audioPath]).catch(() => {});
    if (target?.attachment) await supabase.storage.from(FILES_BUCKET).remove([target.attachment.path]).catch(() => {});
  };

  // Clears the whole thread — deletes every message either side sent, not
  // just this account's own, since there's no per-user "hidden" flag: this
  // really does remove the history (and any voice-message audio files) for
  // both people, not just locally.
  const deleteConversation = async (otherUserId: string) => {
    if (!session) return;
    const audioPaths = (messagesByUser[otherUserId] ?? []).map((m) => m.audioPath).filter((p): p is string => Boolean(p));
    // Solo los mensajes de esta app (chat por app): los de otras apps se quedan.
    const { error } = await scopeQuery(
      supabase
        .from('direct_messages')
        .delete()
        .or(
          `and(senderId.eq.${session.userId},recipientId.eq.${otherUserId}),and(senderId.eq.${otherUserId},recipientId.eq.${session.userId})`
        ),
      scope.filter
    );
    if (error) return;
    setMessagesByUser((prev) => {
      const next = { ...prev };
      delete next[otherUserId];
      return next;
    });
    if (audioPaths.length) await supabase.storage.from(AUDIO_BUCKET).remove(audioPaths).catch(() => {});
    const filePaths = (messagesByUser[otherUserId] ?? []).map((m) => m.attachment?.path).filter((p): p is string => Boolean(p));
    if (filePaths.length) await supabase.storage.from(FILES_BUCKET).remove(filePaths).catch(() => {});
  };

  const conversations: Conversation[] = useMemo(
    () =>
      profiles.map((p) => {
        const msgs = messagesByUser[p.id] ?? [];
        const last = msgs[msgs.length - 1];
        return {
          id: `${REAL_DM_PREFIX}${p.id}`,
          kind: 'dm',
          app: last?.app,
          name: p.displayName,
          color: colorForId(p.id),
          avatarUrl: p.avatarUrl ?? null,
          lastMessagePreview: last ? previewFor(last) : 'Sin mensajes todavía.',
          lastMessageAt: last?.createdAt ?? new Date(0).toISOString(),
          unreadCount: msgs.filter((m) => m.senderId !== 'me' && m.status !== 'read').length,
          pinned: false,
          favorite: false,
          archived: false,
          messages: msgs.map((m) => ({ ...m, senderName: m.senderId === 'me' ? 'Tú' : p.displayName })),
        };
      }),
    [profiles, messagesByUser]
  );

  return {
    accounts: profiles,
    conversations,
    sendMessage,
    sendAudioMessage,
    sendNoteMessage,
    sendFile,
    markRead,
    resolveAudioUrl,
    editMessage,
    deleteMessage,
    deleteConversation,
  };
}
