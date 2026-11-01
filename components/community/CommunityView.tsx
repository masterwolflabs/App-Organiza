'use client';

import React, { useState } from 'react';
import { AccountProfile, ChatDisplayMode, Conversation, ConversationKind } from '@/types/community';
import { ConversationList } from '@/components/community/ConversationList';
import { ConversationPane } from '@/components/community/ConversationPane';
import { GroupDetailsPanel } from '@/components/community/GroupDetailsPanel';
import { ChatStoragePanel } from '@/components/community/ChatStoragePanel';
import { NewConversationModal } from '@/components/community/NewConversationModal';
import { EmptyState } from '@/components/community/EmptyState';
import { AppWindow, ArrowLeft, MessageCircle, PanelRight } from 'lucide-react';

interface CommunityViewProps {
  conversations: Conversation[];
  accounts: AccountProfile[];
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onSend: (conversationId: string, text: string) => void;
  onSendAudio: (conversationId: string, blob: Blob, durationSec: number) => void;
  onResolveAudioUrl: (path: string) => Promise<string | null>;
  onToggleFollow: (conversationId: string) => void;
  onEditMessage: (conversationId: string, messageId: string, text: string) => void;
  onDeleteMessage: (conversationId: string, messageId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onCreate: (kind: ConversationKind, name: string, memberIds?: string[], description?: string) => void;
  onSelectAccount: (userId: string) => void;
  poppedChat: { id: string; mode: ChatDisplayMode } | null;
  onSetPopped: (popped: { id: string; mode: ChatDisplayMode } | null) => void;
  onBack: () => void;
}

export const CommunityView: React.FC<CommunityViewProps> = ({
  conversations,
  accounts,
  selectedId,
  onSelectId,
  onSend,
  onSendAudio,
  onResolveAudioUrl,
  onToggleFollow,
  onEditMessage,
  onDeleteMessage,
  onDeleteConversation,
  onCreate,
  onSelectAccount,
  poppedChat,
  onSetPopped,
  onBack,
}) => {
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'details'>('list');
  const [showDetails, setShowDetails] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const isPoppedElsewhere = selected && poppedChat?.id === selected.id;

  const handleSelect = (id: string) => {
    onSelectId(id);
    setMobileView('chat');
    setShowDetails(false);
  };

  const handleChangeViewMode = (mode: ChatDisplayMode) => {
    if (!selected) return;
    if (mode === 'embedded') onSetPopped(null);
    else onSetPopped({ id: selected.id, mode });
  };

  const handleDeleteConversation = () => {
    if (!selected) return;
    onDeleteConversation(selected.id);
    onSelectId(null);
    setMobileView('list');
  };

  return (
    // Distraction-free, same treatment as IA Finanzas: no Topbar/BottomDock/
    // floating widgets (hidden by Dashboard while activeSection === 'comunidad'),
    // fills the whole viewport instead of sitting in the padded/max-width
    // dashboard scroll — that's what was making a 1:1 chat look cramped.
    <div className="fixed inset-0 z-50 flex flex-col bg-[#09090b] text-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2.5 sm:px-4">
        <button
          onClick={onBack}
          title="Volver al dashboard"
          aria-label="Volver al dashboard"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold text-white">Chat</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
        {/* List */}
        <div className={`${mobileView === 'list' ? 'flex' : 'hidden'} min-h-0 lg:flex`}>
          <ConversationList conversations={conversations} selectedId={selectedId} onSelect={handleSelect} onNewChat={() => setNewChatOpen(true)} onOpenStorage={() => setStorageOpen(true)} />
        </div>

        {/* Conversation + details */}
        <div className={`${mobileView === 'list' ? 'hidden' : 'flex'} min-h-0 lg:flex`}>
          <div className={`${mobileView === 'details' ? 'hidden' : 'flex'} min-w-0 flex-1 lg:flex`}>
            {!selected ? (
              <EmptyState
                icon={MessageCircle}
                title="Selecciona una conversación"
                subtitle="Elige un chat, grupo o canal de la lista para empezar."
              />
            ) : isPoppedElsewhere ? (
              <EmptyState
                icon={poppedChat?.mode === 'floating' ? AppWindow : PanelRight}
                title={`Este chat está abierto en ${poppedChat?.mode === 'floating' ? 'una ventana flotante' : 'la vista lateral'}.`}
                subtitle="Ciérralo ahí para volver a verlo aquí."
                action={
                  <button
                    onClick={() => onSetPopped(null)}
                    className="mt-1 rounded-xl border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900"
                  >
                    Traer aquí
                  </button>
                }
              />
            ) : (
              <ConversationPane
                conversation={selected}
                onSend={(text) => onSend(selected.id, text)}
                onSendAudio={(blob, durationSec) => onSendAudio(selected.id, blob, durationSec)}
                onResolveAudioUrl={onResolveAudioUrl}
                onToggleFollow={() => onToggleFollow(selected.id)}
                onEditMessage={(messageId, text) => onEditMessage(selected.id, messageId, text)}
                onDeleteMessage={(messageId) => onDeleteMessage(selected.id, messageId)}
                onDeleteConversation={handleDeleteConversation}
                viewMode="embedded"
                onChangeViewMode={handleChangeViewMode}
                onOpenDetails={() => (setShowDetails(true), setMobileView('details'))}
                onBack={() => setMobileView('list')}
              />
            )}
          </div>

          {showDetails && selected && !isPoppedElsewhere && (
            <div className={`${mobileView === 'details' ? 'flex' : 'hidden'} w-full lg:flex lg:w-80`}>
              <GroupDetailsPanel
                conversation={selected}
                onClose={() => {
                  setShowDetails(false);
                  setMobileView('chat');
                }}
              />
            </div>
          )}
        </div>
      </div>

      {storageOpen && <ChatStoragePanel conversations={conversations} onDelete={onDeleteMessage} onClose={() => setStorageOpen(false)} />}

      {newChatOpen && (
        <NewConversationModal
          accounts={accounts}
          onClose={() => setNewChatOpen(false)}
          onCreate={(kind, name, memberIds, description) => {
            onCreate(kind, name, memberIds, description);
            setNewChatOpen(false);
          }}
          onSelectAccount={(userId) => {
            onSelectAccount(userId);
            setMobileView('chat');
          }}
        />
      )}
    </div>
  );
};
