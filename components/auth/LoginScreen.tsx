'use client';

import React, { useState } from 'react';
import { Cloud, Loader2 } from 'lucide-react';
import { APP } from '@/app.config';
import { supabase } from '@/lib/supabaseClient';
import { Brand } from '@/components/shell/Brand';
import { AmbientBackdrop } from '@/components/shell/AmbientBackdrop';

/**
 * Login compartido: la misma cuenta sirve en la nube y en todas las apps
 * (mismo Supabase). Si el usuario ya entró a la nube, al abrir esta app
 * desde allá entra directo y nunca ve esta pantalla.
 */
export const LoginScreen: React.FC = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError('Correo o contraseña incorrectos.');
    } else {
      const { data, error: err } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim() } } });
      if (err) setError(err.message);
      // Supabase responde "éxito" falso si el correo ya existe (identities vacío).
      else if (data.user?.identities && data.user.identities.length === 0) setError('Ya existe una cuenta con ese correo. Inicia sesión.');
      else if (!data.session) setInfo('Cuenta creada. Revisa tu correo para confirmarla.');
    }
    setBusy(false);
  };

  const google = async () => {
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
    });
    if (err) setError('Google no está disponible en este momento.');
  };

  const field = 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-sky-400';

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <AmbientBackdrop />
      <div className="w-full max-w-sm space-y-5 rounded-3xl border border-white/10 bg-[#0c0f15]/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <Brand />
          <p className="text-sm text-zinc-400">{APP.description}</p>
        </div>

        <button onClick={google} className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continuar con Google
        </button>

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-zinc-500">
          <span className="h-px flex-1 bg-white/10" />o<span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" autoComplete="name" className={field} />}
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" autoComplete="email" className={field} />
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className={field}
          />
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        {error && <p className="text-center text-sm text-rose-300">{error}</p>}
        {info && <p className="text-center text-sm text-emerald-300">{info}</p>}

        <p className="text-center text-sm text-zinc-400">
          {mode === 'signin' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="font-semibold text-sky-300 hover:underline">
            {mode === 'signin' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>

        <a href={APP.cloudUrl} className="flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-sky-300">
          <Cloud className="h-3.5 w-3.5" /> Es la misma cuenta de App Master Cloud
        </a>
      </div>
    </main>
  );
};
