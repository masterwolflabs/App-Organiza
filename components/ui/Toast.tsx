'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
  durationMs?: number;
  /** Optional extra content under the message (e.g. "¿Hablar con soporte?"). */
  action?: React.ReactNode;
}

/** Fixed top-right error notification, auto-dismisses after `durationMs`. */
export const Toast: React.FC<ToastProps> = ({ message, onClose, durationMs = 5000, action }) => {
  useEffect(() => {
    const t = setTimeout(onClose, action ? durationMs * 2 : durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  return (
    <div className="fixed top-4 right-4 z-[100] flex max-w-sm items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/95 px-4 py-3 text-sm text-rose-100 shadow-2xl shadow-rose-900/40 backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <span className="leading-snug">
        {message}
        {action && <span className="mt-1.5 flex">{action}</span>}
      </span>
      <button onClick={onClose} className="ml-1 shrink-0 text-rose-300/70 hover:text-white">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
