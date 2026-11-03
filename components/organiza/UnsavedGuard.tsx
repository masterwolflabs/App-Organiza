'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * «¿Guardar antes de salir?» (Emanuel, 2026-11-03): toda ventana de configuración del Horario con
 * botón Guardar pregunta antes de cerrarse si quedó algo sin guardar (✕, clic afuera o Esc).
 * La ventana envuelve su contenido en <UnsavedScope>; el formulario avisa con useUnsaved(dirty, save).
 */
type Save = () => unknown;
const Ctx = createContext<(save: Save | null) => void>(() => {});

/** El formulario dice si tiene cambios y cómo guardarlos. */
export function useUnsaved(dirty: boolean, save: Save) {
  const register = useContext(Ctx);
  const ref = useRef(save);
  ref.current = save;
  useEffect(() => {
    register(dirty ? () => ref.current() : null);
    return () => register(null);
  }, [dirty, register]);
}

/** La ventana: entrega `close` (protegido), el proveedor y la barra de aviso. */
export function useGuardedClose(onClose: () => void) {
  const save = useRef<Save | null>(null);
  const [asking, setAsking] = useState(false);
  const register = useCallback((s: Save | null) => {
    save.current = s;
  }, []);
  const close = useCallback(() => (save.current ? setAsking(true) : onClose()), [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  const bar = asking ? (
    <UnsavedBar
      onSave={async () => {
        await save.current?.();
        save.current = null;
        setAsking(false);
        onClose();
      }}
      onDiscard={() => {
        save.current = null;
        setAsking(false);
        onClose();
      }}
      onStay={() => setAsking(false)}
    />
  ) : null;
  return { close, register, bar };
}

export const UnsavedScope: React.FC<{ register: (s: Save | null) => void; children: React.ReactNode }> = ({ register, children }) => <Ctx.Provider value={register}>{children}</Ctx.Provider>;

const UnsavedBar: React.FC<{ onSave: () => void; onDiscard: () => void; onStay: () => void }> = ({ onSave, onDiscard, onStay }) => (
  <div role="alertdialog" aria-label="Cambios sin guardar" className="sticky bottom-0 z-10 mt-4 rounded-xl bg-amber-500/15 p-3 ring-1 ring-amber-400/40 backdrop-blur">
    <p className="text-sm font-semibold text-amber-100">💾 Tienes cambios sin guardar. ¿Los guardas antes de salir?</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={onSave} className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-[#fff] hover:bg-sky-500">Guardar y salir</button>
      <button type="button" onClick={onDiscard} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:bg-white/[0.1]">Salir sin guardar</button>
      <button type="button" onClick={onStay} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-400 hover:text-white">Seguir editando</button>
    </div>
  </div>
);
