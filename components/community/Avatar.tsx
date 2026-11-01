'use client';

import React from 'react';
import { Megaphone, Users } from 'lucide-react';
import { Conversation } from '@/types/community';
import { WolfLogo } from '@/components/shell/WolfLogo';

const SIZES = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-xl',
};

interface AvatarProps {
  name: string;
  color: string;
  emoji?: string;
  kind?: Conversation['kind'];
  size?: keyof typeof SIZES;
  /** Official Master Finanzas mark (support conversations). */
  brand?: boolean;
  /** Profile photo — the same one the person has on their account. */
  src?: string | null;
}

export const Avatar: React.FC<AvatarProps> = ({ name, color, emoji, kind, size = 'md', brand, src }) => {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const [broken, setBroken] = React.useState(false);
  if (src && !brand && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} onError={() => setBroken(true)} className={`shrink-0 rounded-full object-cover ${SIZES[size]}`} referrerPolicy="no-referrer" />;
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${color} ${SIZES[size]}`}
    >
      {brand ? (
        <WolfLogo className="h-3/5 w-3/5" />
      ) : emoji ? (
        <span>{emoji}</span>
      ) : kind === 'channel' ? (
        <Megaphone className="h-1/2 w-1/2" />
      ) : kind === 'group' ? (
        <Users className="h-1/2 w-1/2" />
      ) : (
        initial
      )}
    </div>
  );
};
