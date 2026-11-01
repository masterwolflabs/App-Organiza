'use client';

/**
 * El chat completo, listo para montar en cualquier app (y en la nube).
 * Es la orquestación que en Finance vive dentro de app/page.tsx (mensajes
 * directos + grupos + favoritos/destacados + ventanas flotante/lateral +
 * aviso de mensaje nuevo), sacada a una pieza reutilizable. Los componentes
 * de la carpeta community/ son los de Finance tal cual.
 *
 * Diferencias con Finance, a propósito:
 *  - `scope` (utils/chatScope.ts): canales y mensajes por app.
 *  - Sin tickets de soporte ni canales de demostración (llegan después).
 *  - Notas en el chat: las pone components/notes/NotesSystem.tsx (NotesProvider,
 *    dentro de ChatProvider), que publica su NotesBridge aquí con `setNotesBridge`
 *    para que las ventanas flotante y lateral también puedan abrir y adjuntar notas.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import type { ActiveSession } from '@/types/auth';
import type { ChatDisplayMode, Conversation, ConversationKind } from '@/types/community';
import { REAL_DM_PREFIX, resolveChatFileUrl, useCommunityAccounts } from '@/utils/useCommunityAccounts';
import { GROUP_PREFIX, useChatGroups } from '@/utils/useChatGroups';
import { useChatPrefs } from '@/utils/useChatPrefs';
import type { ChatScope } from '@/utils/chatScope';
import { GroupsBridgeProvider } from '@/components/community/GroupsBridge';
import { SupportBridgeProvider } from '@/components/community/SupportBridge';
import { CommunityView } from '@/components/community/CommunityView';
import { FloatingChatWindow } from '@/components/community/FloatingChatWindow';
import { SidebarChatPanel } from '@/components/community/SidebarChatPanel';
import { NotesBridgeProvider, NotesBridgeValue } from '@/components/notes/NotesBridge';

function useChatState(session: ActiveSession, scope: ChatScope) {
  const dm = useCommunityAccounts(session, scope);
  const chatGroups = useChatGroups(session, dm.accounts, session.avatarUrl ?? null, scope);
  const chatPrefs = useChatPrefs(session);

  const conversations = useMemo(() => {
    const starredIds = new Set(chatPrefs.starred.map((x) => x.message_id));
    return [...chatGroups.conversations, ...dm.conversations].map((c) => ({
      ...c,
      favorite: chatPrefs.favorites.has(c.id),
      messages: starredIds.size ? c.messages.map((m) => (starredIds.has(m.id) ? { ...m, starred: true } : m)) : c.messages,
    }));
  }, [chatGroups.conversations, dm.conversations, chatPrefs.favorites, chatPrefs.starred]);
  const unread = useMemo(() => conversations.reduce((s, c) => s + (c.unreadCount || 0), 0), [conversations]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popped, setPopped] = useState<{ id: string; mode: ChatDisplayMode } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notesBridge, setNotesBridge] = useState<NotesBridgeValue | null>(null);
  /** La otra persona de un mensaje directo (null en grupos). */
  const dmUserOf = (id: string) => (id.startsWith(REAL_DM_PREFIX) ? id.slice(REAL_DM_PREFIX.length) : null);

  const groupsBridge = useMemo(
    () => ({
      accounts: dm.accounts,
      isAdmin: chatGroups.isAdmin,
      addMembers: chatGroups.addMembers,
      setDescription: async (id: string, text: string) => (id.startsWith(GROUP_PREFIX) ? chatGroups.updateDescription(id, text) : false),
      setPhoto: async (id: string, file: File | null) => (id.startsWith(GROUP_PREFIX) ? chatGroups.setPhoto(id, file) : false),
      rename: async (id: string, name: string) => (id.startsWith(GROUP_PREFIX) ? chatGroups.rename(id, name) : false),
      toggleFavorite: chatPrefs.toggleFavorite,
      toggleStar: chatPrefs.toggleStar,
      starred: chatPrefs.starred,
      removeMember: chatGroups.removeMember,
      leave: chatGroups.deleteOrLeave,
      markSeen: (id: string) => {
        if (id.startsWith(REAL_DM_PREFIX)) dm.markRead(id.slice(REAL_DM_PREFIX.length));
        else if (id.startsWith(GROUP_PREFIX)) chatGroups.markRead(id);
      },
    }),
    [dm, chatGroups, chatPrefs]
  );

  const supportBridge = useMemo(
    () => ({
      sendFile: async (id: string, file: File) => {
        if (id.startsWith(REAL_DM_PREFIX)) return dm.sendFile(id.slice(REAL_DM_PREFIX.length), file);
        if (id.startsWith(GROUP_PREFIX)) return chatGroups.sendFile(id, file);
        throw new Error('Los archivos solo se pueden enviar en chats reales.');
      },
      resolveFileUrl: (path: string) => resolveChatFileUrl(path),
    }),
    [dm, chatGroups]
  );

  const actions = {
    send: (id: string, text: string) => {
      if (id.startsWith(REAL_DM_PREFIX)) dm.sendMessage(id.slice(REAL_DM_PREFIX.length), text);
      else if (id.startsWith(GROUP_PREFIX)) chatGroups.send(id, text);
    },
    sendAudio: (id: string, blob: Blob, durationSec: number) => {
      if (id.startsWith(REAL_DM_PREFIX)) dm.sendAudioMessage(id.slice(REAL_DM_PREFIX.length), blob, durationSec);
      else if (id.startsWith(GROUP_PREFIX)) chatGroups.sendAudio(id, blob, durationSec);
    },
    resolveAudioUrl: (path: string): Promise<string | null> => (path.startsWith('blob:') ? Promise.resolve(path) : dm.resolveAudioUrl(path)),
    editMessage: (id: string, messageId: string, text: string) => {
      if (id.startsWith(REAL_DM_PREFIX)) dm.editMessage(id.slice(REAL_DM_PREFIX.length), messageId, text);
      else if (id.startsWith(GROUP_PREFIX)) chatGroups.editMessage(messageId, text);
    },
    deleteMessage: (id: string, messageId: string) => {
      if (id.startsWith(REAL_DM_PREFIX)) dm.deleteMessage(id.slice(REAL_DM_PREFIX.length), messageId);
      else if (id.startsWith(GROUP_PREFIX)) chatGroups.deleteMessage(messageId);
    },
    deleteConversation: (id: string) => {
      if (id.startsWith(REAL_DM_PREFIX)) dm.deleteConversation(id.slice(REAL_DM_PREFIX.length));
      else if (id.startsWith(GROUP_PREFIX)) chatGroups.deleteOrLeave(id); // admin: borra para todos · miembro: sale
      setSelectedId((s) => (s === id ? null : s));
      setPopped((p) => (p?.id === id ? null : p));
    },
    create: async (kind: ConversationKind, name: string, memberIds: string[] = [], description?: string) => {
      if (kind !== 'group') {
        setError('Los canales de difusión llegan en una próxima versión. Por ahora, crea un grupo.');
        return;
      }
      const id = await chatGroups.createGroup(name, memberIds, description);
      if (id) setSelectedId(id);
      else setError('No se pudo crear el grupo. Intenta de nuevo.');
    },
    /** Comparte una nota en un mensaje directo (el acceso lo da NotesSystem). */
    sendNote: (otherUserId: string, noteId: string) => dm.sendNoteMessage(otherUserId, noteId),
    selectAccount: (userId: string) => setSelectedId(`${REAL_DM_PREFIX}${userId}`),
    toggleFollow: () => undefined,
  };

  return { conversations, accounts: dm.accounts, unread, selectedId, setSelectedId, popped, setPopped, groupsBridge, supportBridge, actions, error, setError, notesBridge, setNotesBridge, dmUserOf };
}

type ChatState = ReturnType<typeof useChatState>;
const ChatCtx = createContext<ChatState | null>(null);
/** El estado del chat desde cualquier parte de la app (badge de no leídos, abrir un chat…). */
export const useChat = () => useContext(ChatCtx);

/**
 * Monta el chat una vez, arriba de toda la app: así una conversación abierta
 * en ventana flotante o lateral sigue viva al navegar por otras secciones.
 * `onOpenChat` lleva a la sección del chat (para "Expandir" y el aviso de mensaje nuevo).
 */
export const ChatProvider: React.FC<{ session: ActiveSession; scope: ChatScope; inChat: boolean; onOpenChat: () => void; children: React.ReactNode }> = ({
  session,
  scope,
  inChat,
  onOpenChat,
  children,
}) => {
  const chat = useChatState(session, scope);
  const { conversations, popped, setPopped, setSelectedId, actions } = chat;

  // Aviso dentro de la app: llegó un mensaje mientras estás fuera del chat (como Finance).
  const [ping, setPing] = useState<{ id: string; title: string; body: string } | null>(null);
  const prevUnread = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    const now: Record<string, number> = {};
    conversations.forEach((c) => (now[c.id] = c.unreadCount || 0));
    const before = prevUnread.current;
    prevUnread.current = now;
    if (!before || inChat) return;
    const grew = conversations.find((c) => (c.unreadCount || 0) > (before[c.id] ?? 0));
    if (!grew) return;
    const last = [...grew.messages].reverse().find((m) => m.senderId !== 'me');
    const body = last ? (last.attachment ? '📎 Archivo' : last.audioPath ? '🎤 Mensaje de voz' : last.text) : grew.lastMessagePreview;
    setPing({ id: grew.id, title: grew.kind === 'group' && last ? `${grew.name} · ${last.senderName}` : grew.name, body });
  }, [conversations, inChat]);
  useEffect(() => {
    if (!ping) return;
    const t = setTimeout(() => setPing(null), 6000);
    return () => clearTimeout(t);
  }, [ping]);

  const p = popped ? conversations.find((c) => c.id === popped.id) : null;
  const expand = () => {
    if (!p) return;
    setPopped(null);
    setSelectedId(p.id);
    onOpenChat();
  };

  return (
    <ChatCtx.Provider value={chat}>
      <GroupsBridgeProvider value={chat.groupsBridge}>
        <SupportBridgeProvider value={chat.supportBridge}>
          {children}

          <NotesBridgeProvider value={chat.notesBridge}>
          {p && !inChat && popped?.mode === 'floating' && (
            <FloatingChatWindow
              conversation={p}
              onSend={(text) => actions.send(p.id, text)}
              onSendAudio={(blob, d) => actions.sendAudio(p.id, blob, d)}
              onResolveAudioUrl={actions.resolveAudioUrl}
              onToggleFollow={actions.toggleFollow}
              onEditMessage={(mid, text) => actions.editMessage(p.id, mid, text)}
              onDeleteMessage={(mid) => actions.deleteMessage(p.id, mid)}
              onDeleteConversation={() => actions.deleteConversation(p.id)}
              onExpand={expand}
              onDockSidebar={() => setPopped({ id: p.id, mode: 'sidebar' })}
              onClose={() => setPopped(null)}
            />
          )}
          {p && !inChat && popped?.mode === 'sidebar' && (
            <SidebarChatPanel
              conversation={p}
              onSend={(text) => actions.send(p.id, text)}
              onSendAudio={(blob, d) => actions.sendAudio(p.id, blob, d)}
              onResolveAudioUrl={actions.resolveAudioUrl}
              onToggleFollow={actions.toggleFollow}
              onEditMessage={(mid, text) => actions.editMessage(p.id, mid, text)}
              onDeleteMessage={(mid) => actions.deleteMessage(p.id, mid)}
              onDeleteConversation={() => actions.deleteConversation(p.id)}
              onExpand={expand}
              onFloat={() => setPopped({ id: p.id, mode: 'floating' })}
              onClose={() => setPopped(null)}
            />
          )}
          </NotesBridgeProvider>

          {ping && !inChat && (
            <button
              onClick={() => {
                setSelectedId(ping.id);
                setPing(null);
                onOpenChat();
              }}
              className="fixed right-4 top-20 z-[70] flex max-w-xs items-start gap-3 rounded-2xl border border-white/10 bg-[#18181b] p-3 text-left shadow-2xl"
            >
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{ping.title}</span>
                <span className="block truncate text-xs text-zinc-400">{ping.body}</span>
              </span>
            </button>
          )}
          {chat.error && (
            <div className="fixed bottom-28 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-rose-600 px-4 py-2 text-sm text-white shadow-xl">
              {chat.error}
              <button onClick={() => chat.setError(null)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </SupportBridgeProvider>
      </GroupsBridgeProvider>
    </ChatCtx.Provider>
  );
};

/** La sección Chat: el mismo CommunityView de Finance (pantalla completa). */
export const ChatView: React.FC<{ onBack: () => void; conversationsFilter?: (c: Conversation) => boolean; header?: React.ReactNode }> = ({
  onBack,
  conversationsFilter,
  header,
}) => {
  const chat = useChat();
  if (!chat) return null;
  const { actions } = chat;
  const conversations = conversationsFilter ? chat.conversations.filter(conversationsFilter) : chat.conversations;
  return (
    <>
      {header}
      <CommunityView
        conversations={conversations}
        accounts={chat.accounts}
        selectedId={chat.selectedId}
        onSelectId={chat.setSelectedId}
        onSend={actions.send}
        onSendAudio={actions.sendAudio}
        onResolveAudioUrl={actions.resolveAudioUrl}
        onToggleFollow={actions.toggleFollow}
        onEditMessage={actions.editMessage}
        onDeleteMessage={actions.deleteMessage}
        onDeleteConversation={actions.deleteConversation}
        onCreate={actions.create}
        onSelectAccount={actions.selectAccount}
        poppedChat={chat.popped}
        onSetPopped={chat.setPopped}
        onBack={onBack}
      />
    </>
  );
};
