'use client';

import React from 'react';
import { Conversation } from '@/types/community';
import { ConversationPane } from '@/components/community/ConversationPane';

interface SidebarChatPanelProps {
  conversation: Conversation;
  onSend: (text: string) => void;
  onSendAudio: (blob: Blob, durationSec: number) => void;
  onResolveAudioUrl: (path: string) => Promise<string | null>;
  onToggleFollow?: () => void;
  onEditMessage: (messageId: string, text: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onDeleteConversation: () => void;
  onExpand: () => void;
  onFloat: () => void;
  onClose: () => void;
}

export const SidebarChatPanel: React.FC<SidebarChatPanelProps> = ({
  conversation,
  onSend,
  onSendAudio,
  onResolveAudioUrl,
  onToggleFollow,
  onEditMessage,
  onDeleteMessage,
  onDeleteConversation,
  onExpand,
  onFloat,
  onClose,
}) => (
  <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col border-l border-zinc-800 bg-[#0c0c0f] shadow-2xl">
    <ConversationPane
      conversation={conversation}
      onSend={onSend}
      onSendAudio={onSendAudio}
      onResolveAudioUrl={onResolveAudioUrl}
      onToggleFollow={onToggleFollow}
      onEditMessage={onEditMessage}
      onDeleteMessage={onDeleteMessage}
      onDeleteConversation={() => {
        onDeleteConversation();
        onClose();
      }}
      viewMode="sidebar"
      onChangeViewMode={(m) => (m === 'embedded' ? onExpand() : m === 'floating' ? onFloat() : undefined)}
      onClose={onClose}
      compact
    />
  </div>
);
