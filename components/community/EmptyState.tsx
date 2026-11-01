'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon = MessageCircle, title, subtitle, action }) => (
  // `w-full`: same shrink-wrap-in-a-row-flex-parent issue as ConversationPane's
  // root (see its comment) — this is used directly in that same row-flex slot
  // when no conversation is selected / it's popped out elsewhere.
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800/60 text-zinc-500">
      <Icon className="h-6 w-6" />
    </div>
    <p className="text-sm font-medium text-zinc-300">{title}</p>
    {subtitle && <p className="max-w-xs text-xs text-zinc-500">{subtitle}</p>}
    {action}
  </div>
);
