'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_CATEGORIES, EmojiEntry } from '@/utils/emojiData';
import { Search } from 'lucide-react';

const RECENTS_KEY = 'mwf-community-recent-emojis';
const MAX_RECENTS = 24;

// Strips accents so a search for "corazon" still finds "corazón" — Chilean
// Spanish speakers routinely type without tildes, especially on mobile.
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(char: string) {
  try {
    const next = [char, ...readRecents().filter((c) => c !== char)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* private browsing / storage disabled — recents just won't persist */
  }
}

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onPick, onClose }) => {
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].key);
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const searchResults: EmojiEntry[] | null = useMemo(() => {
    const q = normalize(query);
    if (!q) return null;
    return EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e) => normalize(e.name).includes(q));
  }, [query]);

  const pick = (char: string) => {
    pushRecent(char);
    setRecents(readRecents());
    onPick(char);
  };

  const activeEmojis = EMOJI_CATEGORIES.find((c) => c.key === activeCategory)?.emojis ?? [];

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 z-20 mb-2 flex h-80 w-72 flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-[#18181b] shadow-2xl sm:w-80"
    >
      <div className="shrink-0 border-b border-zinc-800 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar emoji..."
            className="w-full rounded-lg border border-zinc-800 bg-[#0c0c0f] py-1.5 pl-8 pr-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="pt-6 text-center text-xs text-zinc-500">Sin resultados.</p>
          ) : (
            <div className="grid grid-cols-7 gap-0.5 sm:grid-cols-8">
              {searchResults.map((e) => (
                <button
                  key={e.char + e.name}
                  onClick={() => pick(e.char)}
                  title={e.name}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-zinc-800"
                >
                  {e.char}
                </button>
              ))}
            </div>
          )
        ) : (
          <>
            {activeCategory === EMOJI_CATEGORIES[0].key && recents.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recientes</p>
                <div className="grid grid-cols-7 gap-0.5 sm:grid-cols-8">
                  {recents.map((c, i) => (
                    <button
                      key={c + i}
                      onClick={() => pick(c)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-zinc-800"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-7 gap-0.5 sm:grid-cols-8">
              {activeEmojis.map((e) => (
                <button
                  key={e.char}
                  onClick={() => pick(e.char)}
                  title={e.name}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-zinc-800"
                >
                  {e.char}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-t border-zinc-800 p-1.5 [scrollbar-width:none]">
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              setActiveCategory(c.key);
              setQuery('');
            }}
            title={c.label}
            className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-lg text-base transition-colors ${
              !query && activeCategory === c.key ? 'bg-sky-500/20' : 'hover:bg-zinc-800'
            }`}
          >
            {c.emojis[0].char}
          </button>
        ))}
      </div>
    </div>
  );
};
