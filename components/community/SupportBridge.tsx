'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { FileText, Loader2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { SupportAttachment } from '@/types/community';

// Lets the three chat shells (embedded, floating, sidebar) send files (support
// tickets, real DMs and groups) and open them, without threading props through each.
export interface SupportBridge {
  sendFile: (conversationId: string, file: File) => Promise<void>;
  resolveFileUrl: (path: string) => Promise<string | null>;
  /** true inside Mente Maestra (support side): consent cards are read-only there. */
  staff?: boolean;
}
const Ctx = createContext<SupportBridge | null>(null);
export const SupportBridgeProvider = Ctx.Provider;
export const useSupportBridge = () => useContext(Ctx);

const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Picture / audio / document inside a support message. */
export const SupportAttachmentBubble: React.FC<{ attachment: SupportAttachment; own: boolean }> = ({ attachment, own }) => {
  const bridge = useSupportBridge();
  const [url, setUrl] = useState<string | null>(null);
  const isImage = attachment.mime.startsWith('image/');
  const isAudio = attachment.mime.startsWith('audio/');
  const isVideo = attachment.mime.startsWith('video/');

  // Pictures/audio need their (private) URL to render; documents resolve on click.
  useEffect(() => {
    if (!bridge || !(isImage || isAudio || isVideo)) return;
    let alive = true;
    bridge.resolveFileUrl(attachment.path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [bridge, attachment.path, isImage, isAudio, isVideo]);

  if (isImage) {
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.name} className="max-h-64 max-w-[240px] object-cover" />
      </a>
    ) : (
      <div className="flex h-32 w-48 items-center justify-center rounded-2xl border border-zinc-800 bg-[#1c1c20]">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
      </div>
    );
  }
  if (isVideo)
    return url ? (
      <video controls src={url} className="max-h-72 max-w-[280px] rounded-2xl border border-zinc-800 bg-black" />
    ) : (
      <div className="flex h-32 w-48 items-center justify-center rounded-2xl border border-zinc-800 bg-[#1c1c20]">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
      </div>
    );
  if (isAudio) return url ? <audio controls src={url} className="h-10 max-w-[240px]" /> : <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />;

  const open = () => {
    // Open the tab synchronously (popup blockers), then point it at the signed URL.
    const tab = window.open('', '_blank', 'noopener,noreferrer');
    bridge?.resolveFileUrl(attachment.path).then((u) => {
      if (tab && u) tab.location.href = u;
    });
  };
  return (
    <button
      onClick={open}
      className={`flex max-w-[260px] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left text-sm ${own ? 'rounded-br-md bg-sky-600 text-white' : 'rounded-bl-md bg-[#1c1c20] text-zinc-100'}`}
    >
      <FileText className="h-5 w-5 shrink-0 opacity-80" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{attachment.name}</span>
        <span className="block text-[11px] opacity-70">{fmtSize(attachment.size)}</span>
      </span>
    </button>
  );
};

interface AccessRequest {
  id: string;
  scope: string;
  reason: string;
  status: 'pendiente' | 'aprobado' | 'rechazado' | 'expirado' | 'revocado';
  duration: '30min' | 'ticket' | null;
  expires_at: string | null;
  requested_by_name: string;
}

/**
 * Consent card for "temporary access to private data" — the user decides
 * (30 minutos / hasta resolver el ticket / no permitir). Everything is
 * recorded (data_access_requests + admin audit log).
 */
export const AccessRequestCard: React.FC<{ requestId: string }> = ({ requestId }) => {
  const bridge = useSupportBridge();
  const [r, setR] = useState<AccessRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = React.useCallback(() => {
    supabase
      .from('data_access_requests')
      .select('id, scope, reason, status, duration, expires_at, requested_by_name')
      .eq('id', requestId)
      .maybeSingle()
      .then(({ data }) => setR(data as AccessRequest | null));
  }, [requestId]);
  useEffect(load, [load]);

  const decide = async (decision: '30min' | 'ticket' | 'rechazar') => {
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('respond_access_request', { p_request: requestId, p_decision: decision });
    if (err) setError('No se pudo guardar tu respuesta.');
    load();
    setBusy(false);
  };

  if (!r) return null;
  const expired = r.status === 'aprobado' && r.expires_at && new Date(r.expires_at) < new Date();
  const statusText =
    r.status === 'pendiente'
      ? 'Esperando respuesta'
      : r.status === 'rechazado'
        ? 'No permitido'
        : r.status === 'aprobado' && !expired
          ? r.duration === 'ticket'
            ? 'Permitido hasta resolver el ticket'
            : `Permitido hasta las ${new Date(r.expires_at!).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
          : 'Permiso vencido';

  return (
    <div className="mt-1.5 w-72 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-3.5 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-amber-200">
        <Lock className="h-3.5 w-3.5" /> Acceso temporal a tus {r.scope}
      </p>
      <p className="mt-1 text-zinc-400">Solicitado por {r.requested_by_name || 'Soporte'}. Solo se usará para resolver este ticket y queda registrado.</p>
      {r.status === 'pendiente' && !bridge?.staff ? (
        <div className="mt-3 grid gap-1.5">
          <button disabled={busy} onClick={() => decide('30min')} className="rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/15 disabled:opacity-50">
            Permitir 30 minutos
          </button>
          <button disabled={busy} onClick={() => decide('ticket')} className="rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/15 disabled:opacity-50">
            Permitir hasta resolver el ticket
          </button>
          <button disabled={busy} onClick={() => decide('rechazar')} className="rounded-lg px-3 py-1.5 font-medium text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-50">
            No permitir
          </button>
        </div>
      ) : (
        <p className="mt-2 font-medium text-zinc-200">{statusText}</p>
      )}
      {error && <p className="mt-1.5 text-rose-400">{error}</p>}
    </div>
  );
};
