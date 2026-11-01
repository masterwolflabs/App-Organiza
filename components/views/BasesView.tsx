'use client';

import React, { useState } from 'react';
import { DatabasesView } from '@/components/databases/DatabasesView';

/**
 * Bases de datos estilo Notion que crea el usuario (copiadas de Finance):
 * plantillas, columnas con tipo (texto, número, selección, fecha, casilla,
 * enlace, fórmula), fórmulas tipo Notion y edición en línea. Guardadas por
 * usuario y por app en app_databases / app_database_rows.
 */
export const BasesView: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);
  return <DatabasesView openId={openId} onOpenChange={setOpenId} />;
};
