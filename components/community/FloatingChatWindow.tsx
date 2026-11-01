'use client';

import React, { useState } from 'react';
import { Conversation } from '@/types/community';
import { Avatar } from '@/components/community/Avatar';
import { ConversationPane } from '@/components/community/ConversationPane';
import { Maximize2, Minus, X } from 'lucide-react';

const WIDTH = 340;
const HEIGHT = 480;
const MINI_SIZE = 56;
const EDGE_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface FloatingChatWindowProps {
  conversation: Conversation;
  onSend: (text: string) => void;
  onSendAudio: (blob: Blob, durationSec: number) => void;
  onResolveAudioUrl: (path: string) => Promise<string | null>;
  onToggleFollow?: () => void;
  onEditMessage: (messageId: string, text: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onDeleteConversation: () => void;
  onExpand: () => void;
  onDockSidebar: () => void;
  onClose: () => void;
}

export const FloatingChatWindow: React.FC<FloatingChatWindowProps> = ({
  conversation,
  onSend,
  onSendAudio,
  onResolveAudioUrl,
  onToggleFollow,
  onEditMessage,
  onDeleteMessage,
  onDeleteConversation,
  onExpand,
  onDockSidebar,
  onClose,
}) => {
  const [position, setPosition] = useState(() => ({
    x: Math.max(EDGE_MARGIN, (typeof window !== 'undefined' ? window.innerWidth : 1200) - WIDTH - 100),
    y: 90,
  }));
  const [isMinimized, setIsMinimized] = useState(false);

  const startDrag = (e: React.MouseEvent, dims: { width: number; height: number }) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...position };
    const onMove = (ev: MouseEvent) => {
      setPosition({
        x: clamp(startPos.x + (ev.clientX - startX), EDGE_MARGIN, window.innerWidth - dims.width - EDGE_MARGIN),
        y: clamp(startPos.y + (ev.clientY - startY), EDGE_MARGIN, window.innerHeight - dims.height - EDGE_MARGIN),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (isMinimized) {
    return (
      <button
        onMouseDown={(e) => startDrag(e, { width: MINI_SIZE, height: MINI_SIZE })}
        onClick={() => setIsMinimized(false)}
        style={{ left: position.x, top: position.y }}
        className="fixed z-40 flex h-14 w-14 cursor-grab items-center justify-center rounded-full border border-zinc-700 bg-[#18181b] shadow-2xl active:cursor-grabbing"
        title={conversation.name}
      >
        <Avatar name={conversation.name} color={conversation.color} emoji={conversation.emoji} kind={conversation.kind} size="sm" src={conversation.avatarUrl} />
        {conversation.unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white">
            {conversation.unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{ left: position.x, top: position.y, width: WIDTH, height: HEIGHT }}
      className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-[#0c0c0f] shadow-2xl"
    >
      <div
        onMouseDown={(e) => startDrag(e, { width: WIDTH, height: HEIGHT })}
        className="flex cursor-grab items-center justify-between gap-2 border-b border-zinc-800 bg-[#111114] px-3 py-2 active:cursor-grabbing"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={conversation.name} color={conversation.color} emoji={conversation.emoji} kind={conversation.kind} size="sm" src={conversation.avatarUrl} />
          <span className="truncate text-xs font-bold text-white">
            {conversation.name}
            {conversation.emoji ? ` ${conversation.emoji}` : ''}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => setIsMinimized(true)}
            title="Minimizar"
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button onClick={onExpand} title="Expandir a pantalla completa" className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} title="Cerrar" className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
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
          viewMode="floating"
          onChangeViewMode={(m) => (m === 'embedded' ? onExpand() : m === 'sidebar' ? onDockSidebar() : undefined)}
          compact
        />
      </div>
    </div>
  );
};
