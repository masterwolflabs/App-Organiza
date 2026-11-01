'use client';

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock, Search } from "lucide-react";
import { AppInfo, cloudRpc, CloudRole, fmtDateTime, formatBytes, planName, ROLE_LABEL, usd } from "@/utils/mente";
import { Empty, ErrorNote, Line, Loading, Panel, Soon } from "@/components/mente/ui";

interface UserRow {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  plan: string;
  role: CloudRole | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  tickets_open: number;
  ai_cost_month: number;
  storage_bytes: number;
  apps: { app: string; last_seen: string }[];
}
interface UserDetail {
  providers: string[];
  sessions: { created_at: string; updated_at: string | null; user_agent: string | null; ip: string | null; aal: string | null }[];
  apps: { app: string; nombre: string | null; icon: string | null; first_seen: string; last_seen: string; opens: number }[];
  usage_month: Record<string, { calls: number; cost: number }>;
  credits_month: number;
  files: number;
  tickets: { id: string; number: number; subject: string; status: "abierto" | "en_revision" | "resuelto"; updated_at: string }[];
}

const PURPOSE_LABEL: Record<string, string> = { chat: "Chat", report: "Reportes", random: "Dato random", title: "Títulos", attachment: "Documentos", transcription: "Audio", memory: "Memoria", voice: "Voz", support: "Soporte" };
const STATUS_LABEL = { abierto: "Abierto", en_revision: "En revisión", resuelto: "Resuelto" };
const ticketCode = (n: number) => `#MF-${String(n).padStart(6, "0")}`;

function device(ua: string | null) {
  if (!ua) return "Dispositivo desconocido";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "Otro";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "App";
  return `${br} · ${os}`;
}

const AppChip: React.FC<{ info?: AppInfo; slug: string }> = ({ info, slug }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-300" title={info?.name ?? slug}>
    <span aria-hidden="true">{info?.icon ?? "•"}</span>
    {info?.name.replace(/^Master Wolf /, "") ?? slug}
  </span>
);

/** Detalle (copiado de UserDetailView de Finance) + qué apps usa. Nunca muestra finanzas. */
const UserDetailView: React.FC<{ user: UserRow; apps: Record<string, AppInfo>; onBack: () => void }> = ({ user, apps, onBack }) => {
  const [d, setD] = useState<UserDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    cloudRpc<UserDetail>("cloud_mm_user_detail", { p_user: user.id }).then(setD).catch((e) => setError(e.message));
  }, [user.id]);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
        <ArrowLeft className="h-3.5 w-3.5" /> Usuarios
      </button>
      <div>
        <p className="flex items-center gap-2 text-xl font-bold text-white">
          {user.name || "Sin nombre"}
          {user.role && <span className="rounded-md bg-violet-500/15 px-1.5 py-px text-[10px] font-semibold text-violet-300">{ROLE_LABEL[user.role]}</span>}
        </p>
        <p className="text-sm text-zinc-500">{user.email}</p>
      </div>
      {error && <ErrorNote text={error} />}

      <Panel title="Cuenta">
        <Line label="Registro" value={fmtDateTime(user.created_at)} />
        <Line label="Último inicio de sesión" value={fmtDateTime(user.last_sign_in_at)} />
        <Line label="Estado" value={user.banned ? <span className="text-rose-300">Suspendido</span> : <span className="text-emerald-300">Activo</span>} />
        <Line label="Métodos de acceso" value={d ? d.providers.map((p) => (p === "email" ? "Correo" : p === "google" ? "Google" : p)).join(" · ") || "—" : "…"} />
        <Line label="Plan en Finance" value={planName(user.plan)} />
      </Panel>

      {!d ? (
        <Loading />
      ) : (
        <>
          <Panel title="Apps que usa">
            {d.apps.length === 0 ? (
              <Empty text="Todavía no ha abierto ninguna app." />
            ) : (
              d.apps.map((a) => (
                <Line
                  key={a.app}
                  label={
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true">{a.icon ?? apps[a.app]?.icon ?? "•"}</span> {a.nombre ?? a.app}
                    </span>
                  }
                  hint={`Desde ${fmtDateTime(a.first_seen)}${a.app === "finanzas" ? "" : ` · ${a.opens} ${a.opens === 1 ? "apertura" : "aperturas"}`}`}
                  value={<span className="text-xs">Últ. uso {fmtDateTime(a.last_seen)}</span>}
                />
              ))
            )}
          </Panel>

          <Panel title="Consumo este mes">
            <Line label="Costo de IA" value={usd(user.ai_cost_month, 3)} />
            <Line label="Créditos usados" value={Math.round(d.credits_month).toLocaleString("es-CL")} />
            {Object.entries(d.usage_month).map(([k, v]) => (
              <Line key={k} label={PURPOSE_LABEL[k] ?? k} hint={`${v.calls} llamadas`} value={usd(v.cost, 3)} />
            ))}
            <Line label="Archivos" hint={`${d.files} archivos`} value={formatBytes(Number(user.storage_bytes))} />
          </Panel>

          <Panel title="Sesiones y dispositivos">
            {d.sessions.length === 0 ? (
              <Empty text="Sin sesiones activas." />
            ) : (
              d.sessions.map((s, i) => <Line key={i} label={device(s.user_agent)} hint={`IP ${s.ip ?? "—"} · ${s.aal === "aal2" ? "con 2FA" : "sin 2FA"}`} value={fmtDateTime(s.updated_at ?? s.created_at)} />)
            )}
          </Panel>

          <Panel title="Tickets">
            {d.tickets.length === 0 ? <Empty text="Sin tickets de soporte." /> : d.tickets.map((t) => <Line key={t.id} label={`${ticketCode(t.number)} · ${t.subject}`} value={STATUS_LABEL[t.status]} />)}
          </Panel>

          <Panel title="Diagnóstico técnico">
            <Line label="Errores de la app" right={<Soon />} />
            <Line label="Actividad sospechosa" right={<Soon />} />
          </Panel>

          <div className="flex items-start gap-2.5 rounded-2xl border border-zinc-800 px-4 py-3 text-xs text-zinc-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            La información privada del usuario (finanzas, notas, mensajes) no se muestra aquí. Solo puede verse con su autorización temporal, pedida desde un ticket de soporte.
          </div>
        </>
      )}
    </div>
  );
};

/** Usuarios (copiado de MMUsers de Finance) con filtro por app y las apps de cada uno. */
export const MMUsers: React.FC<{ app: string | null; apps: Record<string, AppInfo> }> = ({ app, apps }) => {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<UserRow | null>(null);

  useEffect(() => {
    setRows(null);
    setError("");
    setOpen(null);
    cloudRpc<UserRow[]>("cloud_mm_users", { p_app: app }).then(setRows).catch((e) => setError(e.message));
  }, [app]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((u) => !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [rows, q]);

  if (open) return <UserDetailView user={open} apps={apps} onBack={() => setOpen(null)} />;
  if (error) return <ErrorNote text={error} />;
  if (!rows) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o correo"
          className="w-full rounded-xl border border-zinc-800 bg-[#111114] py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none"
        />
      </div>
      <Panel>
        {list.length === 0 ? (
          <Empty text={rows.length ? "Sin resultados." : "Esta app todavía no tiene usuarios."} />
        ) : (
          list.map((u) => (
            <Line
              key={u.id}
              onClick={() => setOpen(u)}
              label={
                <span className="flex flex-wrap items-center gap-1.5">
                  {u.name || "Sin nombre"}
                  {u.role && <span className="rounded-md bg-violet-500/15 px-1.5 py-px text-[10px] font-semibold text-violet-300">{ROLE_LABEL[u.role]}</span>}
                  {u.tickets_open > 0 && <span className="rounded-full bg-amber-400/15 px-1.5 text-[10px] font-semibold text-amber-300">{u.tickets_open} ticket</span>}
                  {u.apps.map((a) => (
                    <AppChip key={a.app} slug={a.app} info={apps[a.app]} />
                  ))}
                </span>
              }
              hint={u.email}
              value={
                <span className="text-xs">
                  {u.last_sign_in_at ? `Últ. ingreso ${new Date(u.last_sign_in_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}` : "Sin ingresos"}
                </span>
              }
            />
          ))
        )}
      </Panel>
      <p className="px-1 text-[11px] text-zinc-600">
        {rows.length} {rows.length === 1 ? "usuario" : "usuarios"} {app ? "en esta app" : rows.length === 1 ? "registrado" : "registrados"}.
      </p>
    </div>
  );
};
