'use client';

/** Conexión con App Master Cloud (ver docs/NUBE.md). */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { APP } from '@/app.config';

/**
 * Abre la nube en otra pestaña con la sesión ya iniciada (/auth/sso de la nube).
 * El window.open va ANTES de cualquier await: si no, el navegador bloquea la pestaña.
 */
export async function openCloud(next = '/') {
  const tab = window.open('about:blank', '_blank');
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  const url = s
    ? `${APP.cloudUrl}/auth/sso#${new URLSearchParams({ access_token: s.access_token, refresh_token: s.refresh_token, next })}`
    : APP.cloudUrl;
  if (tab) {
    tab.opener = null;
    tab.location.href = url;
  } else {
    window.location.href = url;
  }
}

/** Le avisa a la nube que el usuario abrió esta app (filtro de Usuarios de la Mente). */
export function touchApp() {
  supabase.rpc('cloud_touch_app', { p_app: APP.slug }).then(() => undefined);
}

/**
 * Laboratorio: ¿está encendida esta función para esta app?
 * Lee cloud_feature_flags (de esta app o de todas). Apagada si no existe.
 */
export function useFlag(key: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase
      .from('cloud_feature_flags')
      .select('app, enabled')
      .eq('key', key)
      .or(`app.is.null,app.eq.${APP.slug}`)
      .then(({ data }) => {
        if (!alive || !data) return;
        // La de esta app manda sobre la general.
        const own = data.find((r) => r.app === APP.slug) ?? data[0];
        setOn(!!own?.enabled);
      });
    return () => {
      alive = false;
    };
  }, [key]);
  return on;
}
