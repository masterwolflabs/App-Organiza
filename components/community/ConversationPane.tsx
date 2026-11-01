'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChatDisplayMode, Conversation } from '@/types/community';
import { Avatar } from '@/components/community/Avatar';
import { EmptyState } from '@/components/community/EmptyState';
import { ViewModeMenu } from '@/components/community/ViewModeMenu';
import { EmojiPicker } from '@/components/community/EmojiPicker';
import { VoiceRecorder } from '@/components/community/VoiceRecorder';
import { AudioMessageBubble } from '@/components/community/AudioMessageBubble';
import { NoteMessageCard, NotePickerDialog, useNotesBridge } from '@/components/notes/NotesBridge';
import { AccessRequestCard, SupportAttachmentBubble, useSupportBridge } from '@/components/community/SupportBridge';
import { STATUS_LABEL } from '@/utils/support';
import { useGroupsBridge } from '@/components/community/GroupsBridge';
import { GROUP_PREFIX } from '@/utils/useChatGroups';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCheck,
  Info,
  Loader2,
  Paperclip,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Smile,
  StickyNote,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';

// Minimal "financial" wallpaper: a faint grid with a rising line, a few
// candles and coin marks — barely visible so it never competes with the text.
const CHAT_BG_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" fill="none" stroke="#94a3b8" stroke-width="1">` +
    `<path d="M0 60H240M0 120H240M0 180H240M60 0V240M120 0V240M180 0V240" stroke-opacity=".035"/>` +
    `<path d="M12 196 L52 172 L84 182 L124 140 L160 150 L204 104 L232 92" stroke-opacity=".09" stroke-width="1.4"/>` +
    `<g stroke-opacity=".08"><path d="M150 40V70M146 46h8v18h-8z"/><path d="M170 30V58M166 36h8v14h-8z"/><path d="M190 22V52M186 28h8v16h-8z"/></g>` +
    `<g stroke-opacity=".07"><circle cx="40" cy="44" r="11"/><path d="M40 37v14M36.5 40.5c0-1.8 1.6-3 3.5-3s3.5 1 3.5 2.6-1.6 2.3-3.5 2.6-3.5 1-3.5 2.7 1.6 2.6 3.5 2.6 3.5-1.2 3.5-3"/></g>` +
    `<g stroke-opacity=".06"><path d="M96 222h22M100 216h14M104 210h6"/></g>` +
  `</svg>`
);
const CHAT_BG: React.CSSProperties = {
  backgroundColor: '#08090c',
  backgroundImage: `radial-gradient(ellipse at top, rgba(56,189,248,0.05), transparent 60%), url("data:image/svg+xml,${CHAT_BG_SVG}")`,
  backgroundSize: '100% 100%, 240px 240px',
};

// Each group member's name gets its own color (WhatsApp-style) so it's easy to tell who wrote.
const SENDER_COLORS = [
  ['text-sky-400', 'bg-sky-700'],
  ['text-emerald-400', 'bg-emerald-700'],
  ['text-amber-400', 'bg-amber-700'],
  ['text-rose-400', 'bg-rose-700'],
  ['text-violet-400', 'bg-violet-700'],
  ['text-teal-400', 'bg-teal-700'],
  ['text-fuchsia-400', 'bg-fuchsia-700'],
  ['text-orange-400', 'bg-orange-700'],
];
const senderIdx = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % SENDER_COLORS.length;
};
const senderText = (id: string) => SENDER_COLORS[senderIdx(id)][0];
const senderBg = (id: string) => SENDER_COLORS[senderIdx(id)][1];

/** ✓ sent · ✓✓ delivered · blue ✓✓ read (like WhatsApp). */
const Receipt: React.FC<{ status?: 'sent' | 'delivered' | 'read' }> = ({ status }) =>
  status === 'read' ? (
    <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Leído" />
  ) : status === 'delivered' ? (
    <CheckCheck className="h-3.5 w-3.5 text-zinc-400" aria-label="Recibido" />
  ) : (
    <Check className="h-3.5 w-3.5 text-zinc-400" aria-label="Enviado" />
  );

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface ConversationPaneProps {
  conversation: Conversation;
  onSend: (text: string) => void;
  onSendAudio: (blob: Blob, durationSec: number) => void;
  onResolveAudioUrl: (path: string) => Promise<string | null>;
  onToggleFollow?: () => void;
  onEditMessage?: (messageId: string, text: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onDeleteConversation?: () => void;
  viewMode: ChatDisplayMode;
  /** Omit to hide the floating/sidebar menu (e.g. inside Mente Maestra). */
  onChangeViewMode?: (mode: ChatDisplayMode) => void;
  onOpenDetails?: () => void;
  onClose?: () => void;
  onBack?: () => void;
  compact?: boolean;
}

export const ConversationPane: React.FC<ConversationPaneProps> = ({
  conversation,
  onSend,
  onSendAudio,
  onResolveAudioUrl,
  onToggleFollow,
  onEditMessage,
  onDeleteMessage,
  onDeleteConversation,
  viewMode,
  onChangeViewMode,
  onOpenDetails,
  onClose,
  onBack,
  compact,
}) => {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recorderActive, setRecorderActive] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const notesBridge = useNotesBridge();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isChannel = conversation.kind === 'channel';
  // Support tickets reuse this same pane: files allowed, no edit/delete, ticket + status in the header.
  const support = conversation.support;
  const supportBridge = useSupportBridge();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState('');
  const canEdit = support ? undefined : onEditMessage;
  const canDelete = support ? undefined : onDeleteMessage;
  const canDeleteConversation = support ? undefined : onDeleteConversation;
  const groupsBridge = useGroupsBridge();
  // Files from the computer: support tickets, real DMs and real groups (demo groups/channels have no storage).
  const canAttachFiles = Boolean(supportBridge) && (conversation.id.startsWith('real-dm-') || conversation.id.startsWith(GROUP_PREFIX));
  const realGroup = conversation.id.startsWith(GROUP_PREFIX);
  const groupAdmin = realGroup && Boolean(groupsBridge?.isAdmin(conversation.id));
  const canStar = Boolean(groupsBridge?.toggleStar) && !support;
  const star = (m: (typeof conversation.messages)[number]) => groupsBridge?.toggleStar?.(conversation.id, m);

  // Whenever this conversation is on screen with new messages, tell the other side I read them.
  const markSeen = groupsBridge?.markSeen;
  useEffect(() => {
    if (!markSeen || support || isChannel) return;
    const run = () => document.visibilityState === 'visible' && markSeen(conversation.id);
    run();
    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);
    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
    };
  }, [markSeen, conversation.id, conversation.messages.length, support, isChannel]);

  const sendFile = async (file: File) => {
    if (!supportBridge) return;
    setFileError('');
    setUploading(true);
    try {
      await supportBridge.sendFile(conversation.id, file);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'No se pudo enviar el archivo.');
    } finally {
      setUploading(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setDraft((d) => d + emoji);
      return;
    }
    const start = ta.selectionStart ?? draft.length;
    const end = ta.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const startEdit = (messageId: string, text: string) => {
    setEditingId(messageId);
    setEditingText(text);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };
  const saveEdit = () => {
    const text = editingText.trim();
    if (text && editingId) onEditMessage?.(editingId, text);
    cancelEdit();
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [conversation.id, conversation.messages.length, conversation.posts?.length]);

  const subtitle = support
    ? `Ticket ${support.code}`
    : isChannel
    ? `${conversation.followers ?? 0} seguidores`
    : conversation.kind === 'group'
    ? `${conversation.members?.length ?? 0} miembros`
    : 'Personal';

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    // `w-full` matters here: this root renders as a child of a *row*-direction
    // flex wrapper in CommunityView.tsx (`flex ... flex-1`), where a flex item
    // shrink-wraps to its content width by default — without it the whole pane
    // (header, messages, input) collapsed to a narrow column with a big empty
    // gap beside it instead of filling the embedded view. Harmless in the
    // floating/sidebar shells, which parent it inside a flex-*col* container
    // instead, where cross-axis stretch already filled the width regardless.
    <div className="flex h-full w-full min-w-0 flex-col">
      {/* Header */}
      <div className={`flex items-center justify-between gap-2 border-b border-zinc-800 ${compact ? 'px-3 py-2.5' : 'px-5 py-3.5'}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          {onBack && (
            <button onClick={onBack} className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white lg:hidden">
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>
          )}
          <Avatar name={conversation.name} color={conversation.color} emoji={conversation.emoji} kind={conversation.kind} size={compact ? 'sm' : 'md'} brand={!!support && !supportBridge?.staff} src={conversation.avatarUrl} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-bold text-white">
              <span className="truncate">
                {conversation.name}
                {conversation.emoji ? ` ${conversation.emoji}` : ''}
              </span>
              {support && <span className="shrink-0 rounded-md bg-sky-500/15 px-1.5 py-px text-[10px] font-semibold text-sky-300">Soporte</span>}
            </p>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
              {subtitle}
              {support && (
                <>
                  <span className="text-zinc-700">·</span>
                  <span className={support.status === 'resuelto' ? 'text-emerald-400' : support.status === 'en_revision' ? 'text-amber-300' : 'text-sky-300'}>
                    {STATUS_LABEL[support.status]}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {groupsBridge?.toggleFavorite && !support && (
            <button
              onClick={() => groupsBridge.toggleFavorite!(conversation.id)}
              title={conversation.favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              className={`rounded-lg p-1.5 hover:bg-zinc-800 ${conversation.favorite ? 'text-amber-400' : 'text-zinc-400 hover:text-amber-300'}`}
            >
              <Star className={`h-4 w-4 ${conversation.favorite ? 'fill-current' : ''}`} />
            </button>
          )}
          {!compact && !isChannel && !support && (
            <>
              <button title="Buscar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
                <Search className="h-4 w-4" />
              </button>
            </>
          )}
          {onOpenDetails && (
            <button
              onClick={onOpenDetails}
              title={conversation.kind === 'group' ? 'Detalles del grupo' : 'Detalles'}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              {conversation.kind === 'group' ? <Users className="h-4 w-4" /> : <Info className="h-4 w-4" />}
            </button>
          )}
          {canDeleteConversation && (
            <button
              onClick={() => {
                const text = realGroup
                  ? groupAdmin
                    ? '¿Eliminar este grupo? Se borrará para todos sus miembros.'
                    : '¿Salir del grupo? Dejarás de ver sus mensajes.'
                  : '¿Eliminar esta conversación? Se borrará todo el historial para ambos.';
                if (window.confirm(text)) canDeleteConversation();
              }}
              title={realGroup && !groupAdmin ? 'Salir del grupo' : 'Eliminar conversación'}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {onChangeViewMode && <ViewModeMenu mode={viewMode} onChange={onChangeViewMode} />}
          {onClose && (
            <button onClick={onClose} title="Cerrar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {isChannel ? (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={CHAT_BG}>
          {!conversation.posts || conversation.posts.length === 0 ? (
            <EmptyState title="Este canal todavía no tiene publicaciones." />
          ) : (
            <div className={`mx-auto space-y-4 ${compact ? '' : 'max-w-2xl'}`}>
              {[...conversation.posts]
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map((post) => (
                  <div key={post.id} className="rounded-2xl border border-zinc-800 bg-[#15161a] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-sky-400">{post.authorName}</span>
                      <span className="text-[10px] text-zinc-500">{formatPostDate(post.createdAt)}</span>
                    </div>
                    {post.title && <p className="mt-2 text-sm font-bold text-white">{post.title}</p>}
                    <p className="mt-1 text-xs leading-relaxed text-zinc-300">{post.text}</p>
                    {post.reactions.length > 0 && (
                      <div className="mt-3 flex items-center gap-2">
                        {post.reactions.map((r) => (
                          <span
                            key={r.emoji}
                            className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300"
                          >
                            <span>{r.emoji}</span>
                            {r.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {conversation.messages.length === 0 ? (
            <EmptyState icon={MessageCircle} title="Aún no hay mensajes." subtitle="Escribe el primero abajo." />
          ) : (
            <div className={`mx-auto space-y-2.5 ${compact ? '' : 'max-w-2xl'}`}>
              {support && (
                <div className="mb-4 rounded-2xl border border-zinc-800 bg-[#111114] px-4 py-3 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Ticket {support.code}</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">{support.subject}</p>
                </div>
              )}
              {conversation.messages.map((m) => {
                const own = m.senderId === 'me';
                const isEditing = editingId === m.id;
                return (
                  <div key={m.id} className={`group flex ${own ? 'justify-end' : 'justify-start'}`}>
                    {own && !isEditing && ((canEdit && !m.audioPath && !m.noteId) || canDelete || canStar) && (
                      <div className="mr-1.5 flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100">
                        {canStar && (
                          <button
                            onClick={() => star(m)}
                            title={m.starred ? 'Quitar de destacados' : 'Destacar mensaje'}
                            className={`rounded-lg p-1 hover:bg-zinc-800 ${m.starred ? 'text-amber-400' : 'text-zinc-500 hover:text-amber-300'}`}
                          >
                            <Star className={`h-3 w-3 ${m.starred ? 'fill-current' : ''}`} />
                          </button>
                        )}
                        {canEdit && !m.audioPath && !m.noteId && (
                          <button
                            onClick={() => startEdit(m.id, m.text)}
                            title="Editar mensaje"
                            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => {
                              const what = m.attachment ? 'este archivo' : m.audioPath ? 'este audio' : 'este mensaje';
                              if (window.confirm(`¿Eliminar ${what}? Se borrará para todos.`)) canDelete(m.id);
                            }}
                            title={m.attachment ? 'Eliminar archivo' : m.audioPath ? 'Eliminar audio' : 'Eliminar mensaje'}
                            className="rounded-lg p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                    <div className={`max-w-[80%] ${own ? '' : 'flex items-start gap-2'}`}>
                      {!own && conversation.kind === 'group' && (
                        <div className="mt-0.5">
                          <Avatar name={m.senderName} color={senderBg(m.senderId)} size="sm" src={m.senderAvatarUrl} />
                        </div>
                      )}
                      <div className="min-w-0">
                        {!own && conversation.kind === 'group' && (
                          <p className={`mb-1 pl-1 text-xs font-semibold ${senderText(m.senderId)}`}>{m.senderName}</p>
                        )}
                        {isEditing ? (
                          <div className="rounded-2xl rounded-br-md bg-sky-600 p-2">
                            <textarea
                              autoFocus
                              value={editingText}
                              rows={1}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                  e.preventDefault();
                                  saveEdit();
                                } else if (e.key === 'Escape') {
                                  cancelEdit();
                                }
                              }}
                              className="min-h-[28px] w-full resize-none bg-transparent text-sm text-white placeholder:text-white/60 focus:outline-none"
                            />
                            <div className="mt-1 flex items-center justify-end gap-1">
                              <button onClick={cancelEdit} title="Cancelar" className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white">
                                <X className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={saveEdit} title="Guardar" className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white">
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : m.attachment ? (
                          <div className="space-y-1">
                            <SupportAttachmentBubble attachment={m.attachment} own={own} />
                            {m.text && (
                              <div className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${own ? 'rounded-br-md bg-sky-600 text-white' : 'rounded-bl-md bg-[#1c1c20] text-zinc-100'}`}>
                                {m.text}
                              </div>
                            )}
                          </div>
                        ) : m.noteId ? (
                          <NoteMessageCard noteId={m.noteId} own={own} />
                        ) : m.audioPath ? (
                          <AudioMessageBubble audioPath={m.audioPath} duration={m.audioDuration} own={own} resolveUrl={onResolveAudioUrl} />
                        ) : (
                          <div
                            className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                              own ? 'rounded-br-md bg-sky-600 text-white' : 'rounded-bl-md bg-[#1c1c20] text-zinc-100'
                            }`}
                          >
                            {m.text}
                          </div>
                        )}
                        {m.accessRequestId && <AccessRequestCard requestId={m.accessRequestId} />}
                        <div className={`mt-0.5 flex items-center gap-1 px-1 text-[10px] text-zinc-500 ${own ? 'justify-end' : ''}`}>
                          {m.starred && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" aria-label="Destacado" />}
                          {formatBubbleTime(m.createdAt)}
                          {own && !support && <Receipt status={m.status} />}
                        </div>
                      </div>
                    </div>
                    {!own && canStar && (
                      <button
                        onClick={() => star(m)}
                        title={m.starred ? 'Quitar de destacados' : 'Destacar mensaje'}
                        className={`ml-1.5 self-center rounded-lg p-1 opacity-0 transition-opacity hover:bg-zinc-800 group-hover:opacity-100 ${m.starred ? 'text-amber-400' : 'text-zinc-500 hover:text-amber-300'}`}
                      >
                        <Star className={`h-3 w-3 ${m.starred ? 'fill-current' : ''}`} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {isChannel ? (
        <div className={`border-t border-zinc-800 ${compact ? 'px-3 py-2.5' : 'px-5 py-3.5'}`}>
          <button
            onClick={onToggleFollow}
            className={`w-full rounded-xl py-2.5 text-xs font-semibold transition-colors ${
              conversation.following
                ? 'border border-zinc-700 text-zinc-300 hover:bg-zinc-900'
                : 'bg-sky-600 text-white hover:bg-sky-500'
            }`}
          >
            {conversation.following ? 'Siguiendo' : 'Seguir canal'}
          </button>
        </div>
      ) : (
        <div className={`border-t border-zinc-800 ${compact ? 'px-2.5 py-2' : 'px-4 py-3'}`}>
          {(uploading || fileError) && (
            <p className={`mb-1.5 flex items-center gap-1.5 px-1 text-[11px] ${fileError ? 'text-rose-400' : 'text-zinc-500'}`}>
              {uploading && <Loader2 className="h-3 w-3 animate-spin" />}
              {fileError || 'Enviando archivo…'}
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={support ? 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt' : undefined}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) sendFile(f);
            }}
          />
          <div className="flex items-end gap-1.5 rounded-2xl border border-zinc-800 bg-[#18181b] p-1.5">
            {!recorderActive && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setAttachOpen((v) => !v)}
                  title="Adjuntar"
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                    attachOpen ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <Plus className="h-4 w-4" />
                </button>
                {attachOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAttachOpen(false)} />
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-xl border border-zinc-800 bg-[#18181b] py-1 shadow-2xl">
                      {support ? (
                        <button
                          onClick={() => {
                            setAttachOpen(false);
                            fileRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                        >
                          <Paperclip className="h-3.5 w-3.5 text-sky-400" /> Imagen o archivo
                        </button>
                      ) : (
                      <>
                      {canAttachFiles && (
                        <button
                          onClick={() => {
                            setAttachOpen(false);
                            fileRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                        >
                          <Paperclip className="h-3.5 w-3.5 text-sky-400" /> Foto, video, audio o archivo
                        </button>
                      )}
                      <button
                        disabled={!notesBridge}
                        onClick={() => {
                          setAttachOpen(false);
                          setNotePickerOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                      >
                        <StickyNote className="h-3.5 w-3.5 text-sky-400" /> Nota
                      </button>
                      </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            {!recorderActive && (
              <textarea
                ref={textareaRef}
                value={draft}
                rows={1}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Escribe un mensaje..."
                className="max-h-28 min-h-[32px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none"
              />
            )}
            {!recorderActive && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setEmojiOpen((v) => !v)}
                  title="Emoji"
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                    emojiOpen ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <Smile className="h-4 w-4" />
                </button>
                {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
              </div>
            )}
            {!recorderActive && draft.trim() && (
              <button onClick={send} title="Enviar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white hover:bg-sky-500">
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
            <VoiceRecorder onSend={onSendAudio} onActiveChange={setRecorderActive} hideIdleButton={!!draft.trim()} />
          </div>
        </div>
      )}
      {notePickerOpen && (
        <NotePickerDialog conversationId={conversation.id} isDm={conversation.kind === 'dm'} onClose={() => setNotePickerOpen(false)} />
      )}
    </div>
  );
};
