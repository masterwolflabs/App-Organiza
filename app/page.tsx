'use client';

import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { AppShell } from '@/components/shell/AppShell';

/** Entrada: login compartido con la nube, o el esqueleto de la app (components/shell/AppShell.tsx). */
export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Si la nube abrió esta app con #access_token, supabase-js lo lee aquí solo.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
      </div>
    );
  }
  if (!session) return <LoginScreen />;
  return <AppShell session={session} />;
}

