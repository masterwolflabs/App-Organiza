'use client';

import { FILE_DROP, hasDroppedFile } from '@/utils/fileDrop';
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, History, MessageSquare } from 'lucide-react';
import { AIChatView } from '@/components/ai/AIChatView';
import { AIHistoryPanel } from '@/components/ai/AIHistoryPanel';
import { AIAppInfo, fetchAvailableEngines } from '@/lib/aiClient';
import { useAIConversations } from '@/utils/useAIConversations';
import { pickQuote, splitQuote } from '@/utils/iaQuotes';

/**
 * Inicio de la sección IA (plantilla). Copia de components/IAHome.tsx de
 * Finance: la misma interfaz (imagen + frase distinta en cada visita +
 * entradas + historial), con la imagen (`public/ia/wolf-hero.webp`, cada app
 * pone la suya) y las reglas de cada app (en la nube, hub_apps.ai).
 * Reporte financiero, Dato random y Progreso financiero son de Finance.
 */
export const IAHome: React.FC<{
  userId: string;
  /** Conversación que quedó abierta (la guarda AppShell al navegar). */
  activeConversationId: string | null;
  onActiveConversationChange: (id: string | null) => void;
  onBack: () => void;
  /** Avisa a AppShell cuando el chat ocupa toda la pantalla. */
  onChatOpenChange?: (open: boolean) => void;
}> = ({ userId, activeConversationId, onActiveConversationChange, onBack, onChatOpenChange }) => {
  const store = useAIConversations(userId);
  const [chatOpen, setChatOpen] = useState(Boolean(activeConversationId));
  const [quote, setQuote] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [info, setInfo] = useState<AIAppInfo | null>(null);

  useEffect(() => {
    onChatOpenChange?.(chatOpen);
  }, [chatOpen, onChatOpenChange]);
  useEffect(() => () => onChatOpenChange?.(false), [onChatOpenChange]);
  // A file dropped anywhere goes straight to the chat.
  useEffect(() => {
    const open = () => setChatOpen(true);
    if (hasDroppedFile()) open();
    window.addEventListener(FILE_DROP, open);
    return () => window.removeEventListener(FILE_DROP, open);
  }, []);

  // Picked on mount (client only) so each visit gets a new phrase.
  useEffect(() => {
    setQuote(pickQuote());
    fetchAvailableEngines().then(setInfo);
  }, []);

  if (chatOpen) {
    return (
      <AIChatView
        key="chat"
        conversationId={activeConversationId}
        store={store}
        onConversationChange={(c) => onActiveConversationChange(c?.id ?? null)}
        onBack={() => {
          setChatOpen(false);
          onActiveConversationChange(null);
        }}
      />
    );
  }

  const parts = quote ? splitQuote(quote) : null;
  const assistant = info?.assistant.name ?? 'Asistente IA';

  return (
    <section className="relative text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex w-fit items-center gap-2 rounded-xl px-2 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
          <button onClick={() => setHistoryOpen(true)} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-white">
            <History className="h-4 w-4" /> Historial
          </button>
        </div>

        <div className="my-auto space-y-6 py-6">
          {/* Hero: illustration + phrase. On phones the phrase goes under the image. */}
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#050a16]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ia/wolf-hero.webp" alt={assistant} className="aspect-[16/10] w-full object-cover object-[70%_center] sm:aspect-[979/551]" />
            <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-[#040914]/95 via-[#040914]/45 to-transparent sm:block" />
            <div className="px-5 pb-6 pt-4 sm:absolute sm:inset-y-0 sm:left-0 sm:flex sm:w-[48%] sm:flex-col sm:justify-center sm:px-10 sm:py-0 lg:px-14">
              <span className="font-serif text-5xl font-black leading-none text-sky-500 sm:text-6xl">“</span>
              <p
                key={quote ?? ''}
                className={`mt-1 text-2xl font-semibold leading-tight tracking-tight text-white transition-opacity duration-500 sm:text-3xl lg:text-[40px] ${parts ? 'opacity-100' : 'opacity-0'}`}
              >
                {parts && (
                  <>
                    {parts.before}
                    <span className="text-sky-400">{parts.highlight}</span>
                    {parts.after}
                  </>
                )}
              </p>
              <p className="mt-4 text-sm text-sky-300/80 sm:text-base">— {assistant}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <button
              onClick={() => {
                onActiveConversationChange(null);
                setChatOpen(true);
              }}
              className="group flex items-center gap-4 rounded-2xl border border-sky-400/70 bg-gradient-to-br from-blue-600/80 via-blue-600/55 to-sky-500/35 p-4 text-left shadow-[0_0_28px_-6px_rgba(56,189,248,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_36px_-4px_rgba(56,189,248,0.8)] sm:col-span-2"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-sky-300/40 bg-blue-500/30">
                <MessageSquare className="h-6 w-6 text-sky-200" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-white">Iniciar chat</span>
                <span className="block text-xs text-sky-100/80">Pregúntale a {assistant} sobre tus notas, tus bases de datos o lo que necesites</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-sky-200 transition-transform group-hover:translate-x-0.5" />
            </button>

            <div className="flex flex-col justify-center rounded-2xl border border-white/[0.06] bg-[#0b1220] p-4">
              <span className="text-xs text-zinc-500">Créditos de IA este mes</span>
              <span className="mt-1 text-lg font-semibold text-white">
                {info?.credits.used == null ? '—' : Math.round(info.credits.used).toLocaleString('es-CL')}
                <span className="text-sm font-normal text-zinc-500"> / {info ? info.credits.limit.toLocaleString('es-CL') : '—'}</span>
              </span>
              {info && !info.configured && <span className="mt-1 text-[11px] text-amber-300">La IA de la nube aún no tiene llaves.</span>}
            </div>
          </div>
        </div>
      </div>

      {historyOpen && (
        <AIHistoryPanel
          store={store}
          activeId={null}
          onOpen={(c) => {
            setHistoryOpen(false);
            onActiveConversationChange(c.id);
            setChatOpen(true);
          }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </section>
  );
};
