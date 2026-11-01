'use client';

import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cloudRpc, formatBytes, mrrFrom, PLANS, usd } from "@/utils/mente";
import { ErrorNote, Loading, Panel, Stat } from "@/components/mente/ui";

export interface Overview {
  users_total: number;
  users_new_30d: number;
  users_active_7d: number;
  plans: Record<string, number>;
  tickets_open: number;
  ai_cost_today: number;
  ai_cost_month: number;
  storage_bytes: number;
  por_app: { app: string; nombre: string; icon: string | null; color: string | null; usuarios: number; activos_7d: number }[];
}

/** Inicio (copiado de MMHome de Finance) con filtro por app. app = null → todas. */
export const MMHome: React.FC<{ app: string | null; onUsers: () => void; onPickApp: (slug: string) => void }> = ({ app, onUsers, onPickApp }) => {
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setO(null);
    setError("");
    cloudRpc<Overview>("cloud_mm_overview", { p_app: app }).then(setO).catch((e) => setError(e.message));
  }, [app]);
  if (error) return <ErrorNote text={error} />;
  if (!o) return <Loading />;

  const day = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projection = (Number(o.ai_cost_month) / Math.max(1, day)) * daysInMonth;
  const finance = app === null || app === "finanzas";

  const alerts: string[] = [];
  if (o.tickets_open > 0) alerts.push(`${o.tickets_open} ${o.tickets_open === 1 ? "ticket de soporte espera" : "tickets de soporte esperan"} respuesta.`);
  if (projection > 50) alerts.push(`Al ritmo actual, la IA costará cerca de ${usd(projection)} este mes.`);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Usuarios" value={o.users_total} hint={`${o.users_active_7d} activos en 7 días`} onClick={onUsers} />
        <Stat label="Nuevos" value={`+${o.users_new_30d}`} hint="últimos 30 días" onClick={onUsers} />
        <Stat label="Ingresos" value={finance ? usd(mrrFrom(o.plans)) : "—"} hint={finance ? "estimado mensual · cobros no activos" : "esta app aún no tiene planes"} />
        <Stat label="Tickets abiertos" value={o.tickets_open} tone={o.tickets_open ? "text-amber-300" : "text-white"} />
        <Stat label="IA este mes" value={usd(o.ai_cost_month)} hint={`hoy ${usd(o.ai_cost_today)}`} />
        <Stat label="Almacenamiento" value={formatBytes(Number(o.storage_bytes))} />
        <div className="col-span-2 rounded-2xl border border-zinc-800 bg-[#111114] p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Planes {app === null ? "(Finance)" : ""}</p>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            {PLANS.map((p) => (
              <div key={p.id}>
                <p className="text-xl font-bold text-white">{finance ? o.plans[p.id] ?? 0 : "—"}</p>
                <p className="text-[10px] font-semibold tracking-wider text-zinc-500">{p.name.toUpperCase()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {app === null && (
        <Panel title="Apps">
          {o.por_app.map((a) => (
            <button key={a.app} onClick={() => onPickApp(a.app)} className="flex w-full items-center gap-3 border-t border-zinc-800/80 px-4 py-3 text-left first:border-t-0 hover:bg-white/[0.03]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base" style={{ background: a.color ?? "#3f3f46" }} aria-hidden="true">
                {a.icon ?? a.nombre.charAt(0)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{a.nombre}</span>
              <span className="text-xs text-zinc-400">
                {a.usuarios} usuarios · {a.activos_7d} activos en 7 días
              </span>
            </button>
          ))}
        </Panel>
      )}

      <Panel title="Alertas">
        {alerts.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Todo en orden por ahora.
          </p>
        ) : (
          alerts.map((a) => (
            <p key={a} className="flex items-center gap-3 border-t border-zinc-800/80 px-4 py-3 text-sm text-zinc-200 first:border-t-0">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" /> {a}
            </p>
          ))
        )}
      </Panel>
    </div>
  );
};
