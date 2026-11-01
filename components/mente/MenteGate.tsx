'use client';

import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, Smartphone, X } from 'lucide-react';
import { WolfLogo } from '@/components/shell/WolfLogo';
import { mfaEnroll, mfaState, mfaVerify } from '@/utils/mente';
import { APP } from '@/app.config';

/**
 * Puerta de la Mente Singular (copiada de la Mente Maestra de Finance): a verified second factor (TOTP) is mandatory. First
 * visit → set up an authenticator app (QR); every session → enter the code.
 * The database enforces the same thing (aal2), this is just the UI for it.
 */
export const MenteGate: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
  const [step, setStep] = useState<'loading' | 'verify' | 'enroll' | 'ok'>('loading');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    mfaState()
      .then(({ level, factorId: f }) => {
        setFactorId(f);
        setStep(level === 'aal2' ? 'ok' : f ? 'verify' : 'enroll');
      })
      .catch(() => setStep('enroll'));
  }, []);

  const startEnroll = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await mfaEnroll();
      setFactorId(r.factorId);
      setEnroll({ qr: r.qr.startsWith('data:') ? r.qr : `data:image/svg+xml;utf-8,${encodeURIComponent(r.qr)}`, secret: r.secret });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError('');
    try {
      await mfaVerify(factorId, code);
      setStep('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar.');
    } finally {
      setBusy(false);
    }
  };

  if (step === 'ok') return <>{children}</>;

  const codeInput = (
    <input
      autoFocus
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-center font-mono text-2xl tracking-[0.45em] text-white focus:border-sky-500 focus:outline-none"
    />
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#09090b] p-4 text-white">
      <button onClick={onClose} title="Salir" className="absolute right-4 top-4 rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white">
        <X className="h-5 w-5" />
      </button>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 shadow-lg shadow-sky-500/30">
            <WolfLogo className="h-8 w-8" />
          </span>
          <p className="mt-3 text-lg font-bold">Mente Singular</p>
          <p className="text-xs text-zinc-500">{APP.name} · acceso administrativo protegido</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#18181b] p-6">
          {step === 'loading' ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
            </div>
          ) : step === 'verify' ? (
            <form onSubmit={verify} className="space-y-4 text-center">
              <KeyRound className="mx-auto h-8 w-8 text-sky-400" />
              <div>
                <p className="font-semibold">Verificación en dos pasos</p>
                <p className="mt-1 text-xs text-zinc-400">Ingresa el código de 6 dígitos de tu app de autenticación.</p>
              </div>
              {codeInput}
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button disabled={busy || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold hover:bg-sky-500 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
              </button>
            </form>
          ) : !enroll ? (
            <div className="space-y-4 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-sky-400" />
              <div>
                <p className="font-semibold">Activa la verificación en dos pasos</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  La Mente exige un segundo factor además de tu contraseña. Necesitas una app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…).
                </p>
              </div>
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button onClick={startEnroll} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold hover:bg-sky-500 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Configurar ahora
              </button>
              <p className="text-[11px] text-zinc-600">Llaves de acceso (passkeys): próximamente.</p>
            </div>
          ) : (
            <form onSubmit={verify} className="space-y-4 text-center">
              <p className="text-sm font-semibold">1. Escanea este código con tu app</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enroll.qr} alt="Código QR de verificación" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
              <details className="text-[11px] text-zinc-500">
                <summary className="cursor-pointer hover:text-zinc-300">¿No puedes escanear? Ingresa la clave manualmente</summary>
                <p className="mt-2 break-all rounded-lg bg-zinc-900 p-2 font-mono text-zinc-300">{enroll.secret}</p>
              </details>
              <p className="text-sm font-semibold">2. Escribe el código que aparece</p>
              {codeInput}
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button disabled={busy || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold hover:bg-sky-500 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Activar y entrar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
