'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ActiveSession } from '@/types/auth';
import { AccountProfile, CommunityMessage, Conversation, SupportAttachment } from '@/types/community';
import { attachmentLabel, FILES_BUCKET, uploadChatFile } from '@/utils/useCommunityAccounts';
import { compressImageForNote } from '@/utils/image';
import { appOf, ChatScope, scopeQuery, sendAppFor } from '@/utils/chatScope';

// Real chat groups (schema.sql "2026-10-04, grupos de chat"). Each group is a
// normal `Conversation` with id `group-<uuid>`, so the existing chat UI
// renders it like any other. Only members see a group; admins add/remove
// people; anyone can leave. New messages and "you were added to a group"
// arrive live via Realtime (RLS filters what each user receives).
export const GROUP_PREFIX = 'group-';

const AUDIO_BUCKET = 'community-audio';
const COLORS = ['bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600', 'bg-amber-600', 'bg-teal-600', 'bg-fuchsia-600'];
const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
};

interface GroupRow {
  id: string;
  name: string;
  app?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  emoji: string | null;
  created_by: string;
  created_at: string;
}
interface MemberRow {
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
}
interface ReadRow {
  group_id: string;
  user_id: string;
  delivered_at: string | null;
  read_at: string | null;
}
interface MessageRow {
  id: string;
  group_id: string;
  sender_id: string;
  text: string;
  audio_path: string | null;
  audio_duration: number | null;
  attachment?: SupportAttachment | null;
  created_at: string;
}

export function useChatGroups(session: ActiveSession | null, accounts: AccountProfile[], myAvatarUrl?: string | null, scope: ChatScope = { filter: null, send: null }) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const me = session?.userId ?? null;

  const load = useCallback(async () => {
    if (!me) return;
    // Canales por app: solo los grupos de esta app (en la nube, los de la app elegida o todos).
    const { data: g } = await scopeQuery(supabase.from('chat_groups').select('*'), scope.filter).order('created_at', { ascending: false });
    const ids = ((g ?? []) as GroupRow[]).map((x) => x.id);
    setGroups((g ?? []) as GroupRow[]);
    if (!ids.length) {
      setMembers([]);
      setMessages([]);
      setReads([]);
      return;
    }
    const [{ data: m }, { data: msg }, { data: r }] = await Promise.all([
      supabase.from('chat_group_members').select('group_id, user_id, role').in('group_id', ids),
      supabase.from('chat_group_messages').select('*').in('group_id', ids).order('created_at', { ascending: true }).limit(3000),
      supabase.from('chat_group_reads').select('*').in('group_id', ids),
    ]);
    setMembers((m ?? []) as MemberRow[]);
    setMessages((msg ?? []) as MessageRow[]);
    setReads((r ?? []) as ReadRow[]);
  }, [me, scope.filter]);

  useEffect(() => {
    if (!me) return;
    // My app received the groups' messages → ✓✓ for their senders.
    load().then(() => supabase.rpc('mark_group_delivered').then(() => {}));
    let deliverTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`chat-groups-${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_group_messages' }, (p) => {
        const row = p.new as MessageRow;
        setMessages((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
        if (row.sender_id !== me) {
          if (deliverTimer) clearTimeout(deliverTimer);
          deliverTimer = setTimeout(() => supabase.rpc('mark_group_delivered').then(() => {}), 800);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_group_messages' }, (p) => {
        const row = p.new as MessageRow;
        setMessages((prev) => prev.map((x) => (x.id === row.id ? row : x)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_group_messages' }, (p) => {
        const row = p.old as MessageRow;
        setMessages((prev) => prev.filter((x) => x.id !== row.id));
      })
      // Someone added/removed me (or someone else) — simplest correct thing is to reload.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_group_members' }, () => load())
      // Name / photo / description changed by the admin.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_groups' }, (p) => {
        const row = p.new as GroupRow;
        setGroups((prev) => prev.map((g) => (g.id === row.id ? { ...g, ...row } : g)));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_group_reads' }, (p) => {
        const row = (p.eventType === 'DELETE' ? p.old : p.new) as ReadRow;
        setReads((prev) => {
          const rest = prev.filter((x) => !(x.group_id === row.group_id && x.user_id === row.user_id));
          return p.eventType === 'DELETE' ? rest : [...rest, row];
        });
      })
      .subscribe();
    return () => {
      if (deliverTimer) clearTimeout(deliverTimer);
      supabase.removeChannel(channel);
    };
  }, [me, load]);

  const avatarOf = useCallback(
    (userId: string) => (userId === me ? myAvatarUrl ?? session?.avatarUrl ?? null : accounts.find((a) => a.id === userId)?.avatarUrl ?? null),
    [accounts, me, myAvatarUrl, session?.avatarUrl]
  );
  const nameOf = useCallback(
    (userId: string) => (userId === me ? session?.displayName || 'Tú' : accounts.find((a) => a.id === userId)?.displayName || 'Miembro'),
    [accounts, me, session?.displayName]
  );

  // A message I sent is delivered/read when EVERY other member's last
  // delivered/read time is after it (WhatsApp's rule for groups).
  const receiptOf = useCallback(
    (gid: string, createdAt: string): CommunityMessage['status'] => {
      const others = members.filter((m) => m.group_id === gid && m.user_id !== me);
      if (!others.length) return 'sent';
      const t = new Date(createdAt).getTime();
      const after = (iso: string | null | undefined) => Boolean(iso) && new Date(iso as string).getTime() >= t;
      const rowOf = (uid: string) => reads.find((r) => r.group_id === gid && r.user_id === uid);
      if (others.every((o) => after(rowOf(o.user_id)?.read_at))) return 'read';
      if (others.every((o) => after(rowOf(o.user_id)?.delivered_at) || after(rowOf(o.user_id)?.read_at))) return 'delivered';
      return 'sent';
    },
    [members, reads, me]
  );

  // Messages from others after my last read time in that group.
  const unreadOf = useCallback(
    (gid: string) => {
      const mine = reads.find((r) => r.group_id === gid && r.user_id === me)?.read_at;
      const since = mine ? new Date(mine).getTime() : 0;
      return messages.filter((m) => m.group_id === gid && m.sender_id !== me && new Date(m.created_at).getTime() > since).length;
    },
    [reads, messages, me]
  );

  const conversations: Conversation[] = useMemo(
    () =>
      groups.map((g) => {
        const msgs: CommunityMessage[] = messages
          .filter((m) => m.group_id === g.id)
          .map((m) => ({
            id: m.id,
            senderId: m.sender_id === me ? 'me' : m.sender_id,
            senderName: m.sender_id === me ? 'Tú' : nameOf(m.sender_id),
            text: m.text,
            createdAt: m.created_at,
            audioPath: m.audio_path ?? undefined,
            audioDuration: m.audio_duration ?? undefined,
            attachment: m.attachment ?? undefined,
            senderAvatarUrl: avatarOf(m.sender_id),
            status: m.sender_id === me ? receiptOf(g.id, m.created_at) : undefined,
          }));
        const last = msgs[msgs.length - 1];
        const body = last ? (last.attachment ? attachmentLabel(last.attachment.mime) : last.audioPath ? '🎤 Mensaje de voz' : last.text) : 'Grupo creado.';
        return {
          id: `${GROUP_PREFIX}${g.id}`,
          kind: 'group' as const,
          app: appOf(g.app),
          name: g.name,
          description: g.description ?? undefined,
          avatarUrl: g.avatar_url ?? null,
          emoji: g.emoji ?? undefined,
          color: colorFor(g.id),
          lastMessagePreview: last ? `${last.senderName}: ${body}` : body,
          lastMessageAt: last?.createdAt ?? g.created_at,
          unreadCount: unreadOf(g.id),
          pinned: false,
          favorite: false,
          archived: false,
          messages: msgs,
          members: members
            .filter((m) => m.group_id === g.id)
            .sort((a, b) => (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1))
            .map((m) => ({ id: m.user_id, name: m.user_id === me ? `${nameOf(m.user_id)} (tú)` : nameOf(m.user_id), color: colorFor(m.user_id), avatarUrl: avatarOf(m.user_id), isAdmin: m.role === 'admin' })),
        };
      }),
    [groups, messages, members, me, nameOf, avatarOf, receiptOf, unreadOf]
  );

  const idOf = (conversationId: string) => conversationId.slice(GROUP_PREFIX.length);
  const isAdmin = (conversationId: string) => members.some((m) => m.group_id === idOf(conversationId) && m.user_id === me && m.role === 'admin');

  /** Creates the group (you become admin) and adds the chosen people. Returns the conversation id. */
  const createGroup = async (name: string, memberIds: string[], description?: string): Promise<string | null> => {
    if (!me) return null;
    const { data, error } = await supabase
      .from('chat_groups')
      .insert({ name, created_by: me, app: sendAppFor(scope), ...(description ? { description } : {}) })
      .select()
      .single();
    if (error || !data) return null;
    if (memberIds.length) {
      await supabase.from('chat_group_members').insert(memberIds.map((user_id) => ({ group_id: data.id, user_id, role: 'member' })));
    }
    await load();
    return `${GROUP_PREFIX}${data.id}`;
  };

  /** `withHistory` = the new people can read the messages sent before they joined. */
  const addMembers = async (conversationId: string, userIds: string[], withHistory = true) => {
    if (!userIds.length) return true;
    const history_from = withHistory ? null : new Date().toISOString();
    const { error } = await supabase
      .from('chat_group_members')
      .insert(userIds.map((user_id) => ({ group_id: idOf(conversationId), user_id, role: 'member', history_from })));
    await load();
    return !error;
  };

  const updateDescription = async (conversationId: string, description: string) => {
    const { error } = await supabase.from('chat_groups').update({ description: description || null }).eq('id', idOf(conversationId));
    if (!error) setGroups((prev) => prev.map((g) => (g.id === idOf(conversationId) ? { ...g, description } : g)));
    return !error;
  };

  /** Admin only (RLS): rename the group. */
  const rename = async (conversationId: string, name: string) => {
    const { error } = await supabase.from('chat_groups').update({ name }).eq('id', idOf(conversationId));
    if (!error) setGroups((prev) => prev.map((g) => (g.id === idOf(conversationId) ? { ...g, name } : g)));
    return !error;
  };

  /** Admin only (RLS): new group photo, compressed and stored in the public avatars bucket. */
  const setPhoto = async (conversationId: string, file: File | null) => {
    if (!me) return false;
    let avatar_url: string | null = null;
    if (file) {
      const { blob, ext } = await compressImageForNote(file, 512);
      const path = `${me}/groups/${idOf(conversationId)}-${Date.now()}.${ext}`;
      const { error: up } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type });
      if (up) return false;
      avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from('chat_groups').update({ avatar_url }).eq('id', idOf(conversationId));
    if (!error) setGroups((prev) => prev.map((g) => (g.id === idOf(conversationId) ? { ...g, avatar_url } : g)));
    return !error;
  };

  const removeMember = async (conversationId: string, userId: string) => {
    await supabase.from('chat_group_members').delete().eq('group_id', idOf(conversationId)).eq('user_id', userId);
    await load();
  };

  /** Admin: deletes the whole group for everyone. Member: leaves it. */
  const deleteOrLeave = async (conversationId: string) => {
    if (!me) return;
    const gid = idOf(conversationId);
    if (isAdmin(conversationId)) {
      const paths = messages.filter((m) => m.group_id === gid && m.audio_path).map((m) => m.audio_path as string);
      const files = messages.filter((m) => m.group_id === gid && m.attachment).map((m) => (m.attachment as SupportAttachment).path);
      await supabase.from('chat_groups').delete().eq('id', gid);
      if (paths.length) await supabase.storage.from(AUDIO_BUCKET).remove(paths).catch(() => {});
      if (files.length) await supabase.storage.from(FILES_BUCKET).remove(files).catch(() => {});
    } else {
      await supabase.from('chat_group_members').delete().eq('group_id', gid).eq('user_id', me);
    }
    await load();
  };

  const send = async (conversationId: string, text: string) => {
    if (!me) return;
    const { data } = await supabase.from('chat_group_messages').insert({ group_id: idOf(conversationId), sender_id: me, text }).select().single();
    if (data) setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as MessageRow]));
  };

  const sendAudio = async (conversationId: string, blob: Blob, durationSec: number) => {
    if (!me) return;
    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const path = `${me}/groups/${crypto.randomUUID()}.${ext}`;
    const { error: up } = await supabase.storage.from(AUDIO_BUCKET).upload(path, blob, { contentType: blob.type });
    if (up) return;
    const { data, error } = await supabase
      .from('chat_group_messages')
      .insert({ group_id: idOf(conversationId), sender_id: me, text: '', audio_path: path, audio_duration: Math.round(durationSec) })
      .select()
      .single();
    if (error || !data) {
      await supabase.storage.from(AUDIO_BUCKET).remove([path]).catch(() => {});
      return;
    }
    setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as MessageRow]));
  };

  /** I'm looking at this group → my read time moves forward (others' ✓✓ turn blue). */
  const markRead = async (conversationId: string) => {
    if (!me) return;
    const gid = idOf(conversationId);
    const mine = reads.find((r) => r.group_id === gid && r.user_id === me)?.read_at;
    const lastIncoming = [...messages].reverse().find((m) => m.group_id === gid && m.sender_id !== me);
    if (!lastIncoming || (mine && new Date(mine) >= new Date(lastIncoming.created_at))) return;
    const now = new Date().toISOString();
    setReads((prev) => [...prev.filter((x) => !(x.group_id === gid && x.user_id === me)), { group_id: gid, user_id: me, delivered_at: now, read_at: now }]);
    await supabase.rpc('mark_group_read', { p_group: gid });
  };

  const sendFile = async (conversationId: string, file: File) => {
    if (!me) return;
    const attachment = await uploadChatFile(me, file, file.name);
    const { data, error } = await supabase
      .from('chat_group_messages')
      .insert({ group_id: idOf(conversationId), sender_id: me, text: '', attachment })
      .select()
      .single();
    if (error || !data) {
      await supabase.storage.from(FILES_BUCKET).remove([attachment.path]).catch(() => {});
      throw new Error('No se pudo enviar el archivo.');
    }
    setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as MessageRow]));
  };

  const editMessage = async (messageId: string, text: string) => {
    const { error } = await supabase.from('chat_group_messages').update({ text }).eq('id', messageId);
    if (!error) setMessages((prev) => prev.map((x) => (x.id === messageId ? { ...x, text } : x)));
  };

  const deleteMessage = async (messageId: string) => {
    const target = messages.find((m) => m.id === messageId);
    const { error } = await supabase.from('chat_group_messages').delete().eq('id', messageId);
    if (error) return;
    setMessages((prev) => prev.filter((x) => x.id !== messageId));
    if (target?.audio_path) await supabase.storage.from(AUDIO_BUCKET).remove([target.audio_path]).catch(() => {});
    if (target?.attachment) await supabase.storage.from(FILES_BUCKET).remove([target.attachment.path]).catch(() => {});
  };

  return { conversations, isAdmin, createGroup, addMembers, updateDescription, rename, setPhoto, removeMember, deleteOrLeave, send, sendAudio, sendFile, markRead, editMessage, deleteMessage };
}

export type ChatGroupsApi = ReturnType<typeof useChatGroups>;
