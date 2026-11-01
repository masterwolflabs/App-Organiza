'use client';

import React, { createContext, useContext, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { mfaState, mfaVerify, ReauthRequired } from '@/utils/mente';

// Small building blocks for Mente Maestra (same dark Master Finanzas look).

export const Panel: React.FC<{ title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, action, children, className = '' }) => (
  <section className={className}>
    {(title || action) && (
      <div className="mb-2 flex items-center justify-between px-1">
        {title && <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>}
        {action}
      </div>
    )}
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#111114]">{children}</div>
  </section>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; onClick?: () => void; tone?: string }> = ({ label, value, hint, onClick, tone = 'text-white' }) => {
  const body = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tracking-tight ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>}
    </>
  );
  const cls = 'rounded-2xl border border-zinc-800 bg-[#111114] p-4 text-left';
  return onClick ? (
    <button onClick={onClick} className={`${cls} transition-colors hover:border-zinc-700`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
};

export const Line: React.FC<{ label: React.ReactNode; value?: React.ReactNode; hint?: string; right?: React.ReactNode; onClick?: () => void }> = ({ label, value, hint, right, onClick }) => {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-zinc-200">{label}</div>
        {hint && <p className="truncate text-[11px] text-zinc-500">{hint}</p>}
      </div>
      {value !== undefined && <div className="shrink-0 text-right text-sm text-zinc-400">{value}</div>}
      {right}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-t border-zinc-800/80 px-4 py-3 text-left first:border-t-0 hover:bg-white/[0.03]">
      {body}
    </button>
  ) : (
    <div className="flex items-center gap-3 border-t border-zinc-800/80 px-4 py-3 first:border-t-0">{body}</div>
  );
};

export const Soon = () => <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-zinc-400">Próximamente</span>;

export const Empty: React.FC<{ text: string }> = ({ text }) => <p className="px-4 py-8 text-center text-xs text-zinc-500">{text}</p>;

export const Loading = () => (
  <div className="flex justify-center py-16">
    <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
  </div>
);

export const ErrorNote: React.FC<{ text: string }> = ({ text }) => <p className="rounded-xl bg-rose-500/10 px-4 py-2 text-xs text-rose-300 ring-1 ring-rose-500/30">{text}</p>;

// --- Re-authentication for critical actions -----------------------------------
// Any critical call is wrapped with `withReauth(() => mmRpc(...))`: if the
// database answers "reautenticacion requerida", the admin types a fresh TOTP
// code and the action is retried once.

type Runner = <T>(fn: () => Promise<T>) => Promise<T>;
const ReauthCtx = createContext<Runner>((fn) => fn());
export const useReauth = () => useContext(ReauthCtx);

export const ReauthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);

  const ask = () =>
    new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject };
      setCode('');
      setError('');
      setOpen(true);
    });

  const run: Runner = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ReauthRequired)) throw e;
      await ask();
      return fn();
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { factorId } = await mfaState();
      if (!factorId) throw new Error('No tienes verificación en dos pasos configurada.');
      await mfaVerify(factorId, code);
      setOpen(false);
      pending.current?.resolve();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setOpen(false);
    pending.current?.reject(new Error('Acción cancelada.'));
  };

  return (
    <ReauthCtx.Provider value={run}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4" onMouseDown={cancel}>
          <form onSubmit={confirm} className="w-full max-w-xs rounded-2xl border border-zinc-800 bg-[#18181b] p-6 text-center shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <ShieldCheck className="mx-auto h-9 w-9 text-sky-400" />
            <p className="mt-3 text-base font-bold text-white">Confirma que eres tú</p>
            <p className="mt-1 text-xs text-zinc-400">Esta acción es sensible. Ingresa el código de tu app de autenticación.</p>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-center font-mono text-xl tracking-[0.4em] text-white focus:border-sky-500 focus:outline-none"
            />
            {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={cancel} className="flex-1 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                Cancelar
              </button>
              <button type="submit" disabled={busy || code.length !== 6} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar
              </button>
            </div>
          </form>
        </div>
      )}
    </ReauthCtx.Provider>
  );
};
