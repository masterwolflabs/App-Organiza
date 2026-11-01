'use client';

import React from 'react';
import { ChatMarkdown } from '@/components/ai/ChatMarkdown';

export interface RandomFact {
  emoji: string;
  titulo: string;
  gancho: string;
  cifra: string;
  cifra_contexto: string;
  dato: string;
  leccion: string;
  pregunta: string;
}

/**
 * Builds the card data from a Dato random message. New ones carry the full
 * structure in metadata.random; older ones only have "**title**\n\ntext".
 */
export function randomFactFrom(content: string, metadata: Record<string, unknown>): RandomFact | null {
  const r = metadata.random as Partial<RandomFact> | undefined;
  if (r && r.titulo && r.dato) {
    return {
      emoji: r.emoji || '🎲',
      titulo: r.titulo,
      gancho: r.gancho ?? '',
      cifra: r.cifra ?? '',
      cifra_contexto: r.cifra_contexto ?? '',
      dato: r.dato,
      leccion: r.leccion ?? '',
      pregunta: r.pregunta ?? '',
    };
  }
  if (!metadata.category) return null;
  const parts = content.split(/\n\s*\n/);
  const title = parts[0]?.replace(/\*\*/g, '').trim();
  if (!title || parts.length < 2) return null;
  const question = parts.length > 2 ? parts[parts.length - 1] : '';
  return { emoji: '🎲', titulo: title, gancho: '', cifra: '', cifra_contexto: '', dato: parts.slice(1, question ? -1 : undefined).join('\n\n'), leccion: '', pregunta: question };
}

const rise = (i: number): React.CSSProperties => ({ animationDelay: `${i * 90}ms` });

/** The "wow" presentation of a Dato random: big type, emoji, highlighted figure, lesson and quick replies. */
export const RandomFactCard: React.FC<{
  fact: RandomFact;
  category?: string;
  animate?: boolean;
  onReply?: (text: string) => void;
  onAnother?: () => void;
  anotherBusy?: boolean;
}> = ({ fact, category, animate = true, onReply, onAnother, anotherBusy }) => {
  const fx = animate ? 'fx-rise' : '';
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-violet-400/25 bg-[#0d0a1a] p-6 shadow-[0_0_60px_-20px_rgba(167,139,250,0.55)] sm:p-10">
      {/* Glow blobs */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-600/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-violet-600/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-1/3 top-1/2 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
      <span aria-hidden className="fx-twinkle pointer-events-none absolute right-8 top-10 text-xl">✨</span>
      <span aria-hidden className="fx-twinkle pointer-events-none absolute bottom-24 right-14 text-sm" style={{ animationDelay: '1.2s' }}>✨</span>
      <span aria-hidden className="fx-twinkle pointer-events-none absolute left-1/2 top-6 text-xs" style={{ animationDelay: '0.6s' }}>⭐</span>

      <div className="relative">
        <div className={`${fx} flex flex-wrap items-center gap-2`} style={rise(0)}>
          <span className="rounded-full border border-violet-300/30 bg-violet-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-200">🎲 Dato random</span>
          {category && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-300">{category}</span>}
        </div>

        <div className={`${fx} mt-6 flex items-start gap-4 sm:gap-6`} style={rise(1)}>
          <span className="fx-float shrink-0 text-6xl drop-shadow-[0_0_24px_rgba(232,121,249,0.55)] sm:text-8xl">{fact.emoji}</span>
          <h2 className="font-display bg-gradient-to-br from-white via-violet-100 to-fuchsia-300 bg-clip-text pt-1 text-3xl font-extrabold leading-[1.05] tracking-tight text-transparent sm:text-5xl lg:text-6xl">
            {fact.titulo}
          </h2>
        </div>

        {fact.gancho && (
          <p className={`${fx} font-display mt-5 text-xl font-medium leading-snug text-violet-100/90 sm:text-2xl`} style={rise(2)}>
            {fact.gancho}
          </p>
        )}

        {fact.cifra && (
          <div className={`${fx} mt-7 rounded-2xl border border-amber-300/20 bg-gradient-to-r from-amber-400/10 via-fuchsia-500/10 to-transparent px-5 py-4 sm:px-7 sm:py-5`} style={rise(3)}>
            <p className="font-display bg-gradient-to-r from-amber-200 via-orange-300 to-fuchsia-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-6xl">{fact.cifra}</p>
            {fact.cifra_contexto && <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/70 sm:text-sm">{fact.cifra_contexto}</p>}
          </div>
        )}

        <div className={`${fx} mt-7 text-[15px] leading-relaxed text-zinc-200 sm:text-lg`} style={rise(4)}>
          <ChatMarkdown text={fact.dato} />
        </div>

        {fact.leccion && (
          <div className={`${fx} mt-7 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] px-5 py-4`} style={rise(5)}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">La lección</p>
            <p className="mt-1.5 text-sm text-emerald-50/90 sm:text-base">{fact.leccion}</p>
          </div>
        )}

        {fact.pregunta && (
          <p className={`${fx} font-display mt-7 text-lg font-semibold text-white sm:text-xl`} style={rise(6)}>
            💬 {fact.pregunta}
          </p>
        )}

        {(onReply || onAnother) && (
          <div className={`${fx} mt-6 flex flex-wrap gap-2`} style={rise(7)}>
            {onReply && (
              <>
                <button onClick={() => onReply('🤯 ¡Cuéntame más!')} className="rounded-full border border-violet-300/30 bg-violet-500/15 px-4 py-2 text-sm font-medium text-violet-100 transition-all hover:-translate-y-0.5 hover:bg-violet-500/25">
                  🤯 Cuéntame más
                </button>
                <button onClick={() => onReply('¿Cómo aplico esto a mis finanzas?')} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition-all hover:-translate-y-0.5 hover:bg-white/10">
                  💡 ¿Cómo lo aplico?
                </button>
              </>
            )}
            {onAnother && (
              <button
                onClick={onAnother}
                disabled={anotherBusy}
                className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(217,70,239,0.7)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
              >
                {anotherBusy ? '🎲 Tirando el dado…' : '🎲 Otro dato'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
