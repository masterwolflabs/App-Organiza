'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Cloud, FlaskConical, Home, ScrollText, Plus, Users } from 'lucide-react';
import { APP } from '@/app.config';
import { supabase } from '@/lib/supabaseClient';
import { WolfLogo } from '@/components/shell/WolfLogo';
import { MenteGate } from '@/components/mente/MenteGate';
import { Empty, ErrorNote, Line, Loading, Panel, ReauthProvider, useReauth } from '@/components/mente/ui';
import { MMHome } from '@/components/mente/MMHome';
import { MMUsers } from '@/components/mente/MMUsers';
import { AppInfo, canManage, cloudRpc, fmtDateTime, MyRole, ROLE_LABEL } from '@/utils/mente';
import { EdgeDrawer } from '@/components/ui/EdgeDrawer';

type Section = 'inicio' | 'usuarios' | 'laboratorio' | 'auditoria';

const NAV: { key: Section; label: string; icon: React.ElementType; manage?: boolean }[] = [
  { key: 'inicio', label: 'Inicio', icon: Home },
  { key: 'usuarios', label: 'Usuarios', icon: Users },
  { key: 'laboratorio', label: 'Laboratorio', icon: FlaskConical },
  { key: 'auditoria', label: 'Auditoría', icon: ScrollText, manage: true },
];

/**
 * Mente Singular de esta app: la misma administración que la Mente Maestra de
 * la nube, filtrada a esta app (APP.slug). Inicio y Usuarios son los mismos
 * componentes de la Mente Maestra (copiados de la nube, que los copió de Finance)
 * con la app fija; más Laboratorio y Auditoría. Todo sobre cloud_* de Supabase.
 */
export const MenteSingular: React.FC<{ role: MyRole; onClose: () => void; onOpenCloud: () => void }> = ({ role, onClose, onOpenCloud }) => {
  const [section, setSection] = useState<Section>('inicio');
  const nav = NAV.filter((n) => !n.manage || canManage(role));
  // Las otras apps, para mostrar qué más usa cada usuario.
  const [apps, setApps] = useState<Record<string, AppInfo>>({});
  useEffect(() => {
    supabase
      .from('hub_apps')
      .select('slug, name, icon, color')
      .then(({ data }) => setApps(Object.fromEntries(((data ?? []) as AppInfo[]).map((a) => [a.slug, a]))));
  }, []);

  return (
    <MenteGate onClose={onClose}>
      <ReauthProvider>
        <div data-push-root className="fixed inset-0 z-[55] flex flex-col bg-[#09090b] text-white md:flex-row">
          <EdgeDrawer className="flex shrink-0 flex-col gap-1 border-b border-zinc-800 bg-[#0c0c0f] p-3 md:w-60 md:border-b-0 md:border-r">
            <div className="mb-3 flex items-center gap-2.5 px-2 pt-1">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white">
                <WolfLogo className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">Mente Singular</div>
                <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-sky-400">{APP.name}</div>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto md:flex-col">
              {nav.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setSection(key)}
                  className={`flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                    section === key ? 'border-sky-500/30 bg-sky-600/15 text-sky-300' : 'border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </nav>
            <div className="mt-auto hidden space-y-1 pt-4 md:block">
              <p className="px-3 pb-1 text-[11px] text-zinc-500">
                {ROLE_LABEL[role.role]}
                {role.master ? ' · Mente Maestra' : ''}
              </p>
              {role.master && (
                <button onClick={onOpenCloud} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-violet-300 hover:bg-zinc-900">
                  <Cloud className="h-4 w-4" /> Mente Maestra (nube)
                </button>
              )}
              <button onClick={onClose} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Volver a {APP.name}
              </button>
            </div>
          </EdgeDrawer>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-4xl space-y-5">
              <button onClick={onClose} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white md:hidden">
                <ArrowLeft className="h-4 w-4" /> Volver a {APP.name}
              </button>
              {(section === 'inicio' || section === 'usuarios') && <h1 className="text-2xl font-bold">{section === 'inicio' ? 'Inicio' : 'Usuarios'}</h1>}
              {section === 'inicio' && <MMHome app={APP.slug} onUsers={() => setSection('usuarios')} onPickApp={() => undefined} />}
              {section === 'usuarios' && <MMUsers app={APP.slug} apps={apps} />}
              {section === 'laboratorio' && <Laboratorio role={role} />}
              {section === 'auditoria' && <Auditoria />}
            </div>
          </main>
        </div>
      </ReauthProvider>
    </MenteGate>
  );
};

interface Flag {
  id: number;
  app: string | null;
  key: string;
  name: string;
  description: string;
  environment: 'produccion' | 'pruebas' | 'desarrollo';
  enabled: boolean;
}

const ENV_LABEL = { produccion: 'Producción', pruebas: 'Pruebas', desarrollo: 'Desarrollo' };

const Laboratorio: React.FC<{ role: MyRole }> = ({ role }) => {
  const run = useReauth();
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ key: '', name: '' });

  const load = useCallback(() => {
    supabase
      .from('cloud_feature_flags')
      .select('id, app, key, name, description, environment, enabled')
      .or(`app.is.null,app.eq.${APP.slug}`)
      .order('key')
      .then(({ data, error: e }) => {
        if (e) setError('No se pudo leer el laboratorio. ¿Está el núcleo de la nube en Supabase?');
        else setFlags(data as Flag[]);
      });
  }, []);
  useEffect(load, [load]);

  const save = async (f: Pick<Flag, 'key' | 'name' | 'description' | 'environment' | 'enabled'>) => {
    setError('');
    try {
      await run(() =>
        cloudRpc('cloud_set_flag', { p_app: APP.slug, p_key: f.key, p_name: f.name, p_description: f.description, p_environment: f.environment, p_enabled: f.enabled })
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    }
  };

  const manage = canManage(role);
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">Laboratorio</h1>
        <p className="text-sm text-zinc-400">Funciones que se prenden o apagan sin publicar código. En la app: <code className="text-sky-300">useFlag(&apos;clave&apos;)</code>.</p>
      </div>
      {error && <ErrorNote text={error} />}
      {manage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const key = draft.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
            if (!key || !draft.name.trim()) return;
            save({ key, name: draft.name.trim(), description: '', environment: 'desarrollo', enabled: false }).then(() => setDraft({ key: '', name: '' }));
          }}
          className="flex flex-wrap gap-2"
        >
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Nombre (ej. Nuevo dashboard)" className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none" />
          <input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="clave_en_codigo" className="w-44 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none" />
          <button className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500">
            <Plus className="h-4 w-4" /> Crear
          </button>
        </form>
      )}
      <Panel title="Funciones">
        {!flags ? (
          <Loading />
        ) : flags.length === 0 ? (
          <Empty text="Todavía no hay funciones experimentales para esta app." />
        ) : (
          flags.map((f) => (
            <Line
              key={f.id}
              label={
                <span>
                  {f.name} <span className="font-mono text-[11px] text-zinc-500">{f.key}</span>
                  {f.app === null && <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">Todas las apps</span>}
                </span>
              }
              hint={ENV_LABEL[f.environment]}
              right={
                manage && f.app !== null ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={f.environment}
                      onChange={(e) => save({ ...f, environment: e.target.value as Flag['environment'] })}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs"
                    >
                      {Object.entries(ENV_LABEL).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => save({ ...f, enabled: !f.enabled })}
                      aria-pressed={f.enabled}
                      className={`relative h-6 w-11 rounded-full transition-colors ${f.enabled ? 'bg-sky-500' : 'bg-zinc-700'}`}
                      title={f.enabled ? 'Apagar' : 'Encender'}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${f.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                ) : (
                  <span className={`text-xs ${f.enabled ? 'text-emerald-300' : 'text-zinc-500'}`}>{f.enabled ? 'Encendida' : 'Apagada'}</span>
                )
              }
            />
          ))
        )}
      </Panel>
    </>
  );
};

interface AuditRow {
  id: number;
  actor_name: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  result: string;
  created_at: string;
}

const Auditoria: React.FC = () => {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    supabase
      .from('cloud_audit_log')
      .select('id, actor_name, action, resource_type, resource_id, result, created_at')
      .eq('app', APP.slug)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setRows((data ?? []) as AuditRow[]));
  }, []);
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">Auditoría</h1>
        <p className="text-sm text-zinc-400">Todo lo que hace el equipo en {APP.name}. Nadie puede editarlo ni borrarlo.</p>
      </div>
      <Panel title="Últimas 100 acciones">
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty text="Sin acciones registradas todavía." />
        ) : (
          rows.map((r) => (
            <Line
              key={r.id}
              label={
                <span>
                  {r.action} <span className="text-zinc-500">· {r.resource_type}{r.resource_id ? ` ${r.resource_id}` : ''}</span>
                </span>
              }
              hint={`${r.actor_name || 'Alguien del equipo'} · ${fmtDateTime(r.created_at)}`}
              right={r.result !== 'ok' ? <span className="text-xs text-rose-300">{r.result}</span> : undefined}
            />
          ))
        )}
      </Panel>
    </>
  );
};
