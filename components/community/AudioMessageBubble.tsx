'use client';

import React, { useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface AudioMessageBubbleProps {
  audioPath: string;
  duration?: number;
  own: boolean;
  resolveUrl: (path: string) => Promise<string | null>;
}

// Resolves the playable URL lazily, on first play, rather than for every
// message on render — a signed-URL fetch per bubble would be wasteful for a
// long history that's mostly just scrolled past.
export const AudioMessageBubble: React.FC<AudioMessageBubbleProps> = ({ audioPath, duration, own, resolveUrl }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = async () => {
    if (playing) {
      audioRef.current?.pause();
      return;
    }
    if (url) {
      audioRef.current?.play();
      return;
    }
    setLoading(true);
    setError(false);
    const resolved = await resolveUrl(audioPath);
    setLoading(false);
    if (!resolved) {
      setError(true);
      return;
    }
    setUrl(resolved);
  };

  return (
    <div
      className={`flex w-56 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ${
        own ? 'rounded-br-md bg-sky-600 text-white' : 'rounded-bl-md bg-[#1c1c20] text-zinc-100'
      }`}
    >
      <button
        onClick={toggle}
        disabled={loading}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${own ? 'bg-white/20' : 'bg-white/10'}`}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="ml-0.5 h-3.5 w-3.5" />
        )}
      </button>
      <div className={`h-1 flex-1 rounded-full ${own ? 'bg-white/25' : 'bg-white/10'}`} />
      <span className="shrink-0 font-mono text-[10px] opacity-80">
        {error ? 'Error' : duration !== undefined ? formatDuration(duration) : '0:00'}
      </span>
      {url && (
        <audio
          ref={audioRef}
          src={url}
          autoPlay
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError(true)}
          className="hidden"
        />
      )}
    </div>
  );
};
