// "Comunidad" is a mock/demo messaging module — no backend yet (see
// components/CommunityView.tsx). Shapes are deliberately close to what a
// real per-user Supabase-backed version would need later (senderId,
// createdAt as ISO, membership as a list of ids) so swapping the mock store
// for real data later doesn't require redesigning these types.

export type ConversationKind = 'dm' | 'group' | 'channel';

export interface CommunityMessage {
  id: string;
  /** App desde donde se envió (slug; Finance = 'finanzas'). Chat compartido con la nube. */
  app?: string;
  senderId: string; // 'me' for the current user
  senderName: string;
  text: string;
  createdAt: string; // ISO
  // Voice message (see components/community/VoiceRecorder.tsx). When set,
  // `text` is empty and the bubble renders an audio player instead. For a
  // real DM this is a path in the "community-audio" Storage bucket, resolved
  // to a signed URL on playback; for a mock group/channel it's already a
  // playable local blob: URL (never persisted, see onResolveAudioUrl).
  audioPath?: string;
  audioDuration?: number; // seconds
  // A note shared in the chat (see components/notes/NotesBridge.tsx) — the
  // same note object, rendered as a card with "Ver nota"/"Editar nota".
  noteId?: string;
  /** A file/picture/audio/video sent in the chat (support, DM or group). */
  attachment?: SupportAttachment;
  /** Sender's profile photo (groups). */
  senderAvatarUrl?: string | null;
  /**
   * WhatsApp-style receipt. Own messages: sent ✓ / delivered ✓✓ / read (blue ✓✓).
   * Incoming DM messages: 'read' once I opened them (used to know what to mark).
   */
  status?: 'sent' | 'delivered' | 'read';
  /** I starred this message (Mensajes destacados, per user). */
  starred?: boolean;
  /** Support asked for temporary access to private data (see data_access_requests). */
  accessRequestId?: string;
}

export interface SupportAttachment {
  path: string;
  name: string;
  mime: string;
  size: number;
}

export interface ChannelPost {
  id: string;
  authorName: string;
  title?: string;
  text: string;
  createdAt: string; // ISO
  reactions: { emoji: string; count: number }[];
}

export interface CommunityMember {
  id: string;
  name: string;
  color: string; // avatar background
  avatarUrl?: string | null;
  isAdmin?: boolean;
}

export interface Conversation {
  id: string;
  /** App a la que pertenece (grupos) o de su último mensaje (directos). Chat compartido con la nube. */
  app?: string;
  kind: ConversationKind;
  name: string;
  emoji?: string; // shown next to the name (group/channel "icon")
  color: string; // avatar background when there's no emoji
  /** Profile photo of the other person (DMs) — same photo as their account. */
  avatarUrl?: string | null;
  /** Group / channel description. */
  description?: string;
  lastMessagePreview: string;
  lastMessageAt: string; // ISO
  unreadCount: number;
  pinned: boolean;
  favorite: boolean;
  archived: boolean;
  members?: CommunityMember[]; // groups
  followers?: number; // channels
  following?: boolean; // channels
  messages: CommunityMessage[]; // dm/group
  posts?: ChannelPost[]; // channels
  /** Set when this conversation is a support ticket with Master Finanzas (Soporte). */
  support?: {
    ticketId: string;
    code: string; // "#MF-000123"
    subject: string;
    category: string;
    status: 'abierto' | 'en_revision' | 'resuelto';
  };
}

// Where an open conversation is currently rendered — see CommunityView.tsx
// and the floating/sidebar shells mounted from app/page.tsx.
export type ChatDisplayMode = 'embedded' | 'sidebar' | 'floating';

// A real, registered Master Wolf Finance account (from the "profiles"
// table — see utils/useCommunityAccounts.ts). Every other account shows up
// automatically as a "Personas" conversation, WhatsApp-style — there's no
// separate "add contact" step.
export interface AccountProfile {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
}
