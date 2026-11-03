'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Database, Gem, HardDrive, Loader2, Palette, Settings, ShieldCheck, UserRound, Vault, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { ACCENTS, AccentId, LightsId } from '@/utils/appearance';
import { ThemePref } from '@/utils/theme';
import { UiPrefs } from '@/utils/uiPrefs';
import { EdgeDrawer } from '@/components/ui/EdgeDrawer';

/** 'perfil' | 'seguridad' | 'configuracion', o la clave de una página propia de la app (SETTINGS_PAGES). */
export type UserSection = string;

/** Página de ajustes propia de una app (p. ej. Conexiones en Organiza), en components/views/index.ts. */
export interface SettingsPage {
  key: string;
  label: string;
  icon: React.ElementType;
  View: React.FC;
}

export interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  providers: string[];
}

export interface SettingsApi {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  accent: AccentId;
  lights: LightsId;
  setAppearance: (accent: AccentId, lights: LightsId) => void;
  ui: UiPrefs;
  setUi: (p: UiPrefs) => void;
}

const NAV: { key: UserSection; label: string; icon: React.ElementType }[] = [
  { key: 'perfil', label: 'Perfil', icon: UserRound },
  { key: 'seguridad', label: 'Seguridad e inicio de sesión', icon: ShieldCheck },
  { key: 'configuracion', label: 'Configuración', icon: Settings },
];

// Del Centro de usuario de Finance; llegan a la plantilla en las próximas fases.
const SOON: { label: string; icon: React.ElementType }[] = [
  { label: 'Almacenamiento', icon: HardDrive },
  { label: 'Plan', icon: Gem },
  { label: 'Bóveda cifrada', icon: Vault },
  { label: 'Datos y privacidad', icon: Database },
];

/**
 * Centro de usuario a pantalla completa (versión plantilla del de Finance). La barra de arriba
 * con ← y ✕ siempre se ve (el menú izquierdo se esconde en el computador); Esc también cierra.
 */
export const UserCenter: React.FC<{
  user: UserInfo;
  initial: UserSection;
  settings: SettingsApi;
  pages?: SettingsPage[];
  onClose: () => void;
  onProfileSaved: (displayName: string) => void;
}> = ({ user, initial, settings, pages = [], onClose, onProfileSaved }) => {
  const [section, setSection] = useState<UserSection>(initial);
  useEffect(() => setSection(initial), [initial]);
  const nav = [...NAV, ...pages];
  const Page = pages.find((p) => p.key === section)?.View;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#09090b] text-white">
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 px-4 py-3 sm:px-6">
          <button onClick={onClose} aria-label="Volver" data-help="Volver" className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <UserAvatar name={user.displayName} url={user.avatarUrl} className="h-8 w-8 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.displayName}</p>
            <p className="truncate text-[11px] text-zinc-500">{user.email}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" data-help="Cerrar" className="hidden h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white md:flex">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <EdgeDrawer className="flex shrink-0 flex-col gap-1 border-b border-zinc-800 bg-[#0c0c0f] p-3 md:w-72 md:border-b-0 md:border-r">
            <nav className="flex gap-1 overflow-x-auto md:flex-col">
              {nav.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setSection(key)}
                  className={`flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                    section === key ? 'border-sky-500/30 bg-sky-600/15 text-sky-300' : 'border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </nav>
            <div className="mt-4 hidden space-y-1 md:block">
              <p className="px-3 text-[11px] font-medium text-zinc-600">Próximamente</p>
              {SOON.map(({ label, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-600">
                  <Icon className="h-4 w-4" /> {label}
                </div>
              ))}
            </div>
          </EdgeDrawer>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-2xl space-y-6">
              {section === 'perfil' && <Perfil user={user} onSaved={onProfileSaved} />}
              {section === 'seguridad' && <Seguridad user={user} />}
              {section === 'configuracion' && <Configuracion settings={settings} pages={pages} go={setSection} />}
              {Page && <Page />}
            </div>
          </main>
        </div>
      </div>
    </BodyPortal>
  );
};

const Card: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
    <h3 className="font-semibold">{title}</h3>
    {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

const Title: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div>
    <h1 className="text-2xl font-bold">{title}</h1>
    <p className="mt-1 text-sm text-zinc-400">{text}</p>
  </div>
);

const input = 'w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-sky-500 focus:outline-none';
const primary = 'inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50';

const Perfil: React.FC<{ user: UserInfo; onSaved: (n: string) => void }> = ({ user, onSaved }) => {
  const [name, setName] = useState(user.displayName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setMsg('');
    // profiles es la misma tabla de Finance: el nombre se ve igual en todas las apps.
    const { error } = await supabase.from('profiles').upsert({ id: user.id, displayName: clean, email: user.email });
    await supabase.auth.updateUser({ data: { full_name: clean } });
    setBusy(false);
    if (error) setMsg('No se pudo guardar el nombre.');
    else {
      setMsg('Guardado. Se ve igual en la nube y en todas las apps.');
      onSaved(clean);
    }
  };

  return (
    <>
      <Title title="Perfil" text="Tu perfil es uno solo para App Master Cloud y todas sus apps." />
      <Card title="Datos personales">
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar name={name || user.displayName} url={user.avatarUrl} className="h-16 w-16 text-lg" />
            <p className="text-xs text-zinc-500">La foto se toma de tu cuenta de Google o de la que subas en Finance.</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs text-zinc-400">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-zinc-400">Correo</span>
            <input value={user.email} readOnly className={`${input} text-zinc-500`} />
          </label>
          <div className="flex items-center gap-3">
            <button disabled={busy || !name.trim() || name.trim() === user.displayName} className={primary}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
            </button>
            {msg && <span className="text-xs text-zinc-400">{msg}</span>}
          </div>
        </form>
      </Card>
    </>
  );
};

const Seguridad: React.FC<{ user: UserInfo }> = ({ user }) => {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState<'pw' | 'others' | null>(null);
  const [msg, setMsg] = useState('');

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('pw');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(null);
    setPw('');
    setMsg(error ? 'No se pudo cambiar la contraseña. Prueba con una más larga.' : 'Contraseña actualizada.');
  };

  const signOutOthers = async () => {
    setBusy('others');
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setBusy(null);
    setMsg(error ? 'No se pudo cerrar las otras sesiones.' : 'Listo: se cerró tu sesión en los demás dispositivos.');
  };

  const methods = user.providers.map((p) => (p === 'email' ? 'Correo y contraseña' : p === 'google' ? 'Google' : p));

  return (
    <>
      <Title title="Seguridad e inicio de sesión" text="Aplica a tu cuenta en la nube y en todas las apps." />
      {msg && <p className="rounded-xl bg-sky-500/10 px-4 py-2 text-sm text-sky-200 ring-1 ring-sky-500/30">{msg}</p>}
      <Card title="Métodos de acceso">
        <div className="flex flex-wrap gap-2">
          {methods.map((m) => (
            <span key={m} className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-300 ring-1 ring-white/10">
              {m}
            </span>
          ))}
        </div>
      </Card>
      <Card title={user.providers.includes('email') ? 'Cambiar contraseña' : 'Crear contraseña'} description="Mínimo 6 caracteres.">
        <form onSubmit={changePw} className="flex flex-wrap gap-2">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} autoComplete="new-password" placeholder="Nueva contraseña" className={`${input} min-w-0 flex-1`} />
          <button disabled={busy !== null || pw.length < 6} className={primary}>
            {busy === 'pw' && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </form>
      </Card>
      <Card title="Otros dispositivos" description="Cierra tu sesión en todos los demás navegadores y teléfonos. Este queda abierto.">
        <button onClick={signOutOthers} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
          {busy === 'others' && <Loader2 className="h-4 w-4 animate-spin" />} Cerrar sesión en los otros dispositivos
        </button>
      </Card>
    </>
  );
};

const Choice: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${active ? 'border-sky-500/50 bg-sky-500/10 text-sky-200' : 'border-zinc-800 text-zinc-300 hover:border-zinc-600'}`}
  >
    {children}
    {active && <Check className="h-3.5 w-3.5" />}
  </button>
);

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
    <span>
      <span className="block text-sm">{label}</span>
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
    </span>
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-sky-500' : 'bg-zinc-700'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  </label>
);

const Configuracion: React.FC<{ settings: SettingsApi; pages: SettingsPage[]; go: (key: UserSection) => void }> = ({ settings: s, pages, go }) => (
  <>
    <Title title="Configuración" text="Se guarda en este navegador." />
    {pages.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {pages.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => go(key)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold hover:bg-white/[0.06]">
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
    )}
    <Card title="Tema">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['system', 'Sistema'],
            ['light', 'Claro'],
            ['dark', 'Oscuro'],
          ] as [ThemePref, string][]
        ).map(([id, label]) => (
          <Choice key={id} active={s.theme === id} onClick={() => s.setTheme(id)}>
            {label}
          </Choice>
        ))}
      </div>
    </Card>
    <Card title="Paleta de colores" description="El color de acento de botones, menús y destacados.">
      <div className="flex flex-wrap gap-2">
        {ACCENTS.map((a) => (
          <Choice key={a.id} active={s.accent === a.id} onClick={() => s.setAppearance(a.id, s.lights)}>
            <span className="h-4 w-4 rounded-full" style={{ background: a.swatch }} /> {a.label}
          </Choice>
        ))}
      </div>
    </Card>
    <Card title="Luces del fondo" description="Las luces ambientales de las esquinas.">
      <div className="flex flex-wrap gap-2">
        <Choice active={s.lights === 'accent'} onClick={() => s.setAppearance(s.accent, 'accent')}>
          <Palette className="h-4 w-4" /> Igual que la paleta
        </Choice>
        {ACCENTS.map((a) => (
          <Choice key={a.id} active={s.lights === a.id} onClick={() => s.setAppearance(s.accent, a.id)}>
            <span className="h-4 w-4 rounded-full" style={{ background: a.swatch }} /> {a.label}
          </Choice>
        ))}
        <Choice active={s.lights === 'off'} onClick={() => s.setAppearance(s.accent, 'off')}>
          Apagadas
        </Choice>
      </div>
    </Card>
    <Card title="Navegación">
      <Switch on={s.ui.autoHideHeader} onChange={(v) => s.setUi({ ...s.ui, autoHideHeader: v })} label="Ocultar la barra superior al bajar" hint="Vuelve al llegar arriba o al dejar el mouse en el borde superior." />
      <Switch on={s.ui.edgeSidebar} onChange={(v) => s.setUi({ ...s.ui, edgeSidebar: v })} label="Abrir el menú con el mouse en el borde izquierdo" />
      <p className="pt-2 text-xs text-zinc-500">Buscador: ⌘K en Mac o Ctrl+K en Windows, desde cualquier parte.</p>
    </Card>
  </>
);
