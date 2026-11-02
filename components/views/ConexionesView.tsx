'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Check, Copy, RefreshCw } from 'lucide-react';
import { authFetch } from '@/lib/authFetch';
import { supabase } from '@/lib/supabaseClient';
import { useSpace } from '@/components/organiza/space';
import { useDb } from '@/components/organiza/db';

const panel = 'rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10';
const main = 'inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-50';
const soft = 'inline-flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]';
type Conn = { provider: string; account: string; updated_at: string };
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const toKey = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

/** Google, Apple y Notion, y los avisos de este dispositivo. */
export const ConexionesView: React.FC = () => {
  const { space, userId } = useSpace();
  const db = useDb();
  const [conns, setConns] = useState<Conn[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [feed, setFeed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dbs, setDbs] = useState<{ id: string; title: string }[]>([]);
  const [push, setPush] = useState<'idle' | 'on' | 'no'>('idle');

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('organiza_connections_status');
    setConns((data ?? []) as Conn[]);
  }, []);
  useEffect(() => {
    load();
    const r = new URLSearchParams(window.location.search).get('conexion');
    if (r) {
      setMsg(r === 'error' ? 'No se pudo conectar. Inténtalo otra vez.' : `¡${r === 'google' ? 'Google Calendar' : 'Notion'} quedó conectado!`);
      history.replaceState(history.state, '', `/${window.location.hash}`);
    }
    db.select<{ token: string }>('organiza_feeds').then((l) => l[0] && setFeed(l[0].token));
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((r2) => r2?.pushManager.getSubscription()).then((s) => s && setPush('on'));
  }, [db, load]);

  const google = conns.find((c) => c.provider === 'google');
  const notion = conns.find((c) => c.provider === 'notion');
  useEffect(() => {
    if (!notion) return;
    authFetch('/api/notion/databases').then((r) => r.json()).then((b) => setDbs(b.databases ?? []));
  }, [notion]);

  const connect = async (provider: 'google' | 'notion') => {
    setBusy(provider);
    const r = await authFetch(`/api/${provider}/start`, { method: 'POST' });
    const b = await r.json().catch(() => ({}));
    if (b.url) return window.location.assign(b.url);
    setBusy('');
    setMsg(r.status === 503 ? 'Esta conexión está lista, pero falta poner sus llaves en Vercel. Están en docs/CONEXIONES.md.' : 'No se pudo abrir la conexión.');
  };
  const disconnect = async (provider: string) => {
    await authFetch(`/api/conexiones?provider=${provider}`, { method: 'DELETE' });
    await load();
  };
  const sync = async () => {
    setBusy('sync');
    const r = await authFetch('/api/google/sync', { method: 'POST' });
    const b = await r.json().catch(() => ({}));
    const x = b.reports?.[0];
    setMsg(x && !x.error ? `Sincronizado: ${x.sent} enviados y ${x.received} recibidos.` : 'No se pudo sincronizar con Google.');
    setBusy('');
  };
  const makeFeed = async () => {
    const [row] = await db.insert<{ token: string }>('organiza_feeds', { owner_id: userId });
    if (row) setFeed(row.token);
  };
  const importDb = async (id: string, title: string) => {
    setBusy(id);
    const r = await authFetch('/api/notion/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ databaseId: id, title, space }) });
    const b = await r.json().catch(() => ({}));
    setBusy('');
    setMsg(r.ok ? (b.kind === 'horario' ? `Listo: ${b.count} tareas en Horario, en vista previa.` : `Listo: ${b.count} eventos en tu Calendario.`) : b.error || 'No se pudo traer esa base.');
  };
  const enablePush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID) return setPush('no');
      if ((await Notification.requestPermission()) !== 'granted') return setPush('no');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID) })).toJSON();
      await db.upsert('organiza_push', { owner_id: userId, endpoint: sub.endpoint, p256dh: sub.keys?.p256dh, auth: sub.keys?.auth, device: navigator.userAgent.slice(0, 120) }, 'endpoint');
      setPush('on');
    } catch {
      setPush('no');
    }
  };

  const https = typeof window === 'undefined' ? '' : `${window.location.origin}/api/ics/${feed}.ics`;
  return (
    <div className="mx-auto max-w-3xl space-y-4" data-tour="conexiones">
      <header className="mb-6">
        <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">Conexiones</h1>
        <p className="mt-2 text-zinc-400">Une Organiza con los calendarios y notas que ya usas.</p>
      </header>
      {msg && <p role="status" className="rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-200 ring-1 ring-sky-400/20">{msg}</p>}

      <section className={panel}>
        <h2 className="font-semibold text-white">Avisos en este dispositivo</h2>
        <p className="mt-1 text-sm text-zinc-400">Recibe tus alarmas aunque Organiza esté cerrada. En iPhone, primero agrégala a tu pantalla de inicio desde Safari.</p>
        <button type="button" onClick={enablePush} disabled={push === 'on'} className={`${main} mt-3`}>{push === 'on' ? <Check className="h-4 w-4" /> : <BellRing className="h-4 w-4" />} {push === 'on' ? 'Avisos activados' : 'Activar avisos'}</button>
        {push === 'no' && <p className="mt-2 text-sm text-rose-300">Este dispositivo no pudo activar los avisos. Revisa el permiso de notificaciones.</p>}
      </section>

      <section className={panel}>
        <h2 className="font-semibold text-white">Google Calendar</h2>
        <p className="mt-1 text-sm text-zinc-400">Lo que crees aquí aparece en Google, y lo que cambies allá aparece aquí.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {google ? (
            <>
              <span className="text-sm text-emerald-300">Conectado con {google.account}</span>
              <button type="button" onClick={sync} disabled={busy === 'sync'} className={soft}><RefreshCw className="h-4 w-4" /> Sincronizar ahora</button>
              <button type="button" onClick={() => disconnect('google')} className="text-sm font-semibold text-zinc-400 hover:text-white">Desconectar</button>
            </>
          ) : <button type="button" onClick={() => connect('google')} disabled={busy === 'google'} className={main}>Conectar Google Calendar</button>}
        </div>
      </section>

      <section className={panel}>
        <h2 className="font-semibold text-white">Calendario de Apple</h2>
        <p className="mt-1 text-sm text-zinc-400">
          La forma completa: en tu iPhone entra a Ajustes, Calendario, Cuentas, y agrega tu cuenta de Google. Así todo lo de Organiza llega a tu Calendario.
        </p>
        <p className="mt-2 text-sm text-zinc-400">Si no usas Google, suscríbete a tu calendario de Organiza (solo se lee):</p>
        {feed ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={https.replace(/^https?:/, 'webcal:')} className={main}>Suscribirme en Apple</a>
            <button type="button" onClick={async () => { await navigator.clipboard.writeText(https); setCopied(true); }} className={soft}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar dirección</button>
          </div>
        ) : <button type="button" onClick={makeFeed} className={`${soft} mt-3`}>Crear mi dirección privada</button>}
      </section>

      <section className={panel}>
        <h2 className="font-semibold text-white">Notion</h2>
        <p className="mt-1 text-sm text-zinc-400">Trae tus bases: las que van por día entran como horario, y las que tienen fechas entran al calendario. Puedes volver a traerlas para actualizar.</p>
        {notion ? (
          <>
            <p className="mt-3 text-sm text-emerald-300">Conectado con {notion.account}</p>
            <ul className="mt-2 divide-y divide-white/5">
              {dbs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm text-white">{d.title}</span>
                  <button type="button" disabled={busy === d.id} onClick={() => importDb(d.id, d.title)} className={soft}>{busy === d.id ? 'Trayendo…' : 'Traer'}</button>
                </li>
              ))}
              {!dbs.length && <li className="py-2 text-sm text-zinc-500">No hay bases compartidas con Organiza todavía.</li>}
            </ul>
            <button type="button" onClick={() => disconnect('notion')} className="mt-2 text-sm font-semibold text-zinc-400 hover:text-white">Desconectar</button>
          </>
        ) : <button type="button" onClick={() => connect('notion')} disabled={busy === 'notion'} className={`${main} mt-3`}>Conectar Notion</button>}
      </section>
    </div>
  );
};
