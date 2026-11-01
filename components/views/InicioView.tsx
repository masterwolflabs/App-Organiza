'use client';

import React from 'react';
import { Cloud, FlaskConical, Settings, Sparkles } from 'lucide-react';
import { APP } from '@/app.config';
import { AddTile, SectionHeader, SectionShell, HeaderAction } from '@/components/dashboard/DashboardUI';
import { ExpandPair } from '@/components/dashboard/ExpandPair';
import { AnimatedNumber } from '@/components/shell/AnimatedNumber';
import { useFlag } from '@/utils/cloud';

/**
 * Inicio de ejemplo: muestra las piezas del dashboard de Finance listas para
 * usar. Reemplaza los datos de ejemplo con los de tu app.
 */
export const InicioView: React.FC<{ onOpenSettings: () => void; onOpenCloud: () => void }> = ({ onOpenSettings, onOpenCloud }) => {
  const demoFlag = useFlag('plantilla_demo');
  const tools = [
    { label: 'Configuración', icon: Settings, run: onOpenSettings },
    { label: 'App Master Cloud', icon: Cloud, run: onOpenCloud },
  ];

  return (
    <div className="space-y-8">
      <SectionShell variant="neon">
        <SectionHeader
          size="lg"
          title="Cifra destacada"
          description="Así se ve un total importante: cuenta desde 0 la primera vez y brilla en neón. Úsalo solo para lo que de verdad importa."
          actions={<HeaderAction onClick={onOpenSettings}>Cambiar colores</HeaderAction>}
        />
        <div className="mt-6 font-display text-5xl font-bold text-white sm:text-6xl">
          <AnimatedNumber value={1250000} format={(n) => Math.round(n).toLocaleString('es-CL')} className="neon-num-sky" />
        </div>
        <p className="mt-2 text-sm text-zinc-400">Dato de ejemplo</p>
      </SectionShell>

      <ExpandPair
        labels={{ left: 'Herramientas', right: 'Registros' }}
        render={(side, expanded) =>
          side === 'left' ? (
            <SectionShell variant="glass" expanded={expanded} className="h-full">
              <SectionHeader title="Herramientas" description="Accesos directos a lo que más usas." stacked />
              <div className="mt-6 grid grid-cols-2 gap-3">
                {tools.map(({ label, icon: Icon, run }) => (
                  <button key={label} onClick={run} className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left hover:border-sky-400/50">
                    <Icon className="h-5 w-5 text-sky-300" />
                    <span className="text-sm font-semibold text-white">{label}</span>
                  </button>
                ))}
              </div>
            </SectionShell>
          ) : (
            <SectionShell variant="glass" expanded={expanded} className="h-full">
              <SectionHeader title="Registros" description="Aquí van los datos propios de tu app." stacked />
              <div className="mt-6 grid grid-cols-2 gap-3">
                <AddTile label="Agregar" onClick={() => undefined} className="min-h-[110px]" />
              </div>
            </SectionShell>
          )
        }
      />

      <SectionShell variant="assistant">
        <SectionHeader
          title={
            <span className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-sky-300" /> Conectada a {APP.cloudUrl.replace('https://', '')}
            </span>
          }
          description="Esta app comparte el login, el perfil y la Mente con App Master Cloud."
        />
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">
            <FlaskConical className="h-4 w-4 text-sky-300" />
            Laboratorio «plantilla_demo»: {demoFlag ? 'encendida' : 'apagada'}
          </span>
        </div>
      </SectionShell>
    </div>
  );
};
