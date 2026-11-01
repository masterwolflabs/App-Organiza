import React, { useState } from 'react';

/** Foto de perfil con iniciales si no hay foto (o si falla). */
export const UserAvatar: React.FC<{ name: string; url?: string | null; className?: string }> = ({ name, url, className = 'h-8 w-8 text-xs' }) => {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" onError={() => setBroken(true)} className={`${className} shrink-0 rounded-full object-cover`} />;
  }
  return <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-700 font-semibold text-white`}>{initials}</span>;
};
