'use client';

import React, { createContext, useContext, useState } from 'react';
import { LifeBuoy, Loader2 } from 'lucide-react';

// "¿Hablar con soporte?" next to an error message. Creates a support ticket
// with the error's context (what the user was doing + the exact message),
// opens it in Chat, and the support assistant answers right away
// (/api/support/agent) — escalating to the team when it can't solve it.
// Rendered inside the Dashboard's provider; outside it (public pages) it
// renders nothing.

export type ReportToSupport = (p: { feature: string; error: string }) => Promise<void>;

const SupportReportContext = createContext<ReportToSupport | null>(null);
export const SupportReportProvider = SupportReportContext.Provider;

export const SupportErrorAction: React.FC<{
  feature: string;
  error: string;
  /** Called right before Chat opens (e.g. to close the modal that showed the error). */
  onOpen?: () => void;
  className?: string;
}> = ({ feature, error, onOpen, className = '' }) => {
  const report = useContext(SupportReportContext);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!report || !error) return null;

  const go = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await report({ feature, error });
      onOpen?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-2 py-1 text-[11px] font-semibold opacity-90 hover:opacity-100 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LifeBuoy className="h-3 w-3" />}
        {busy ? 'Abriendo soporte…' : '¿Hablar con soporte?'}
      </button>
      {failed && <span className="text-[11px] opacity-80">No se pudo abrir el ticket. Usa Menú → Soporte.</span>}
    </span>
  );
};
