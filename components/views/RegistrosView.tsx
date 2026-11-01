'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { SectionHeader, SectionShell } from '@/components/dashboard/DashboardUI';
import { DataTable, type Col, type ViewDef } from '@/components/tables/table';
import { Field, Modal, Pill, btnPrimary, fmt, fmtDate, inputCls, newId } from '@/components/tables/ui';

/**
 * Sección de ejemplo con la tabla estilo Notion de Finance (Empresa):
 * vistas en pestañas (Tabla / Galería / Calendario), filtros, orden, columnas
 * que se ocultan, reordenan y ensanchan, columnas propias "+" (texto, número,
 * selección, fecha, casilla, enlace, fórmula), relaciones y resúmenes. Todo eso
 * lo agrega <DataTable> solo; la app solo le pasa sus filas y columnas.
 * Las vistas se guardan por usuario en app_table_views.
 *
 * Los datos de este ejemplo viven en memoria: reemplázalos por los de tu app.
 */
type Estado = 'Pendiente' | 'En curso' | 'Listo';
type Registro = { id: string; nombre: string; estado: Estado; responsable: string; fecha: string; monto: number };

const hoy = new Date();
const dia = (d: number) => new Date(hoy.getFullYear(), hoy.getMonth(), d).toISOString().slice(0, 10);
const EJEMPLO: Registro[] = [
  { id: newId(), nombre: 'Diseño de la portada', estado: 'Listo', responsable: 'Emanuel', fecha: dia(3), monto: 350000 },
  { id: newId(), nombre: 'Integración con la nube', estado: 'En curso', responsable: 'Moisés', fecha: dia(12), monto: 520000 },
  { id: newId(), nombre: 'Textos de bienvenida', estado: 'Pendiente', responsable: 'Alfonso', fecha: dia(18), monto: 90000 },
  { id: newId(), nombre: 'Pruebas con usuarios', estado: 'Pendiente', responsable: 'Emanuel', fecha: dia(24), monto: 150000 },
];

// Tonos de <Pill> (components/tables/ui.tsx): pagado = verde, parcial = acento, pendiente = ámbar…
const TONE: Record<Estado, string> = { Pendiente: 'pendiente', 'En curso': 'parcial', Listo: 'pagado' };

const VISTAS: ViewDef[] = [
  { name: 'Todos' },
  { name: 'Pendientes', filters: [{ col: 'estado', op: 'en', value: 'Pendiente|En curso' }] },
  { name: 'Galería', type: 'gallery', hidden: ['monto'] },
  { name: 'Calendario', type: 'calendar' },
];

export const RegistrosView: React.FC = () => {
  const [rows, setRows] = useState<Registro[]>(EJEMPLO);
  const [open, setOpen] = useState<Registro | null>(null);

  const save = (r: Registro) => {
    setRows((rs) => (rs.some((x) => x.id === r.id) ? rs.map((x) => (x.id === r.id ? r : x)) : [...rs, r]));
    setOpen(null);
  };

  const columns: Col<Registro>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
      cell: (r) => (
        <button onClick={() => setOpen(r)} className="text-left font-semibold text-white hover:text-sky-300 hover:underline">
          {r.nombre}
        </button>
      ),
    },
    { key: 'estado', label: 'Estado', cell: (r) => <Pill tone={TONE[r.estado]}>{r.estado}</Pill> },
    { key: 'responsable', label: 'Responsable', cell: (r) => r.responsable },
    { key: 'fecha', label: 'Fecha', cell: (r) => fmtDate(r.fecha) },
    { key: 'monto', label: 'Monto', right: true, mono: true, cell: (r) => fmt(r.monto) },
  ];

  return (
    <div className="space-y-6">
      <SectionShell variant="glass">
        <SectionHeader
          title="Registros"
          description="Tabla estilo Notion: crea vistas con «+ Nueva vista» (Tabla, Galería, Calendario), filtra, ordena, oculta columnas con clic derecho y agrega columnas propias con «+». Haz clic en un nombre para abrir su ventana."
          actions={
            <button
              className={btnPrimary}
              onClick={() => setOpen({ id: newId(), nombre: '', estado: 'Pendiente', responsable: '', fecha: new Date().toISOString().slice(0, 10), monto: 0 })}
            >
              <Plus className="h-4 w-4" /> Nuevo
            </button>
          }
        />
        <div className="mt-6">
          <DataTable id="registros" title="Registros" columns={columns} rows={rows} rowKey={(r) => r.id} defaultViews={VISTAS} minWidth={760} empty="Sin registros todavía." />
        </div>
      </SectionShell>

      {open && <RegistroWindow key={open.id} registro={open} onClose={() => setOpen(null)} onSave={save} />}
    </div>
  );
};

/** Ventana tipo Notion (flotante, lateral o página completa — menú junto a la X). */
const RegistroWindow: React.FC<{ registro: Registro; onClose: () => void; onSave: (r: Registro) => void }> = ({ registro, onClose, onSave }) => {
  const [r, setR] = useState(registro);
  return (
    <Modal
      title={registro.nombre || 'Nuevo registro'}
      subtitle="Cambia entre ventana flotante, lateral o página completa con los botones de arriba."
      onClose={onClose}
      footer={
        <button className={btnPrimary} disabled={!r.nombre.trim()} onClick={() => onSave({ ...r, nombre: r.nombre.trim() })}>
          Guardar
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input autoFocus value={r.nombre} onChange={(e) => setR({ ...r, nombre: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Estado">
          <select value={r.estado} onChange={(e) => setR({ ...r, estado: e.target.value as Estado })} className={inputCls}>
            {(Object.keys(TONE) as Estado[]).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Responsable">
          <input value={r.responsable} onChange={(e) => setR({ ...r, responsable: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Fecha">
          <input type="date" value={r.fecha} onChange={(e) => setR({ ...r, fecha: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Monto">
          <input type="number" value={r.monto} onChange={(e) => setR({ ...r, monto: Number(e.target.value) || 0 })} className={inputCls} />
        </Field>
      </div>
    </Modal>
  );
};
