'use client';

import React, { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';

/**
 * Circular photo of a Master Cloud client / person, with initials (in a color
 * derived from the name) when there's no photo. Pass `onPick` to make it
 * clickable: clicking opens the file picker and changes the photo.
 */
const COLORS = ['from-sky-500 to-blue-700', 'from-emerald-500 to-teal-700', 'from-violet-500 to-purple-700', 'from-amber-500 to-orange-700', 'from-rose-500 to-pink-700', 'from-cyan-500 to-sky-700', 'from-fuchsia-500 to-violet-700'];
const colorOf = (name: string) => COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const McAvatar: React.FC<{
  name: string;
  url?: string | null;
  size?: number;
  onPick?: (file: File) => Promise<string | null | void> | void;
  className?: string;
}> = ({ name, url, size = 32, onPick, className = '' }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  const body =
    url && !broken ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} onError={() => setBroken(true)} className="h-full w-full object-cover" />
    ) : (
      // Initials as CSS content: they aren't part of the cell's text, so table
      // filters / search / sort read just the name.
      <span
        aria-hidden
        data-initials={initials(name) || '?'}
        className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${colorOf(name)} font-bold text-white before:content-[attr(data-initials)]`}
        style={{ fontSize: Math.max(9, size * 0.36) }}
      />
    );
  if (!onPick)
    return (
      <span className={`inline-flex shrink-0 overflow-hidden rounded-full ${className}`} style={{ width: size, height: size }}>
        {body}
      </span>
    );
  return (
    <>
      <button
        type="button"
        title="Cambiar foto"
        onClick={(e) => {
          e.stopPropagation();
          ref.current?.click();
        }}
        className={`group/av relative inline-flex shrink-0 overflow-hidden rounded-full ring-2 ring-transparent transition hover:ring-sky-400 ${className}`}
        style={{ width: size, height: size }}
      >
        {body}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover/av:opacity-100">
          {busy ? <Loader2 className="h-1/3 w-1/3 animate-spin text-white" /> : <Camera className="h-1/3 w-1/3 text-white" />}
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onClick={(e) => e.stopPropagation()}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          setBroken(false);
          await onPick(f);
          setBusy(false);
          e.target.value = '';
        }}
      />
    </>
  );
};
