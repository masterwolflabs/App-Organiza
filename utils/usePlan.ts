'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { APP } from '@/app.config';
import { monthStartISO, PlanDef, planById } from '@/utils/plans';

/**
 * El plan de la persona (tabla compartida `user_plans`, la misma de Finance; sin fila = Free) y los
 * créditos de IA que gastó este mes EN ESTA APP (cada app tiene su cupo: cloud_ai_credits_used).
 * Los planes se asignan solo desde SQL; todavía no hay pagos.
 */
export function usePlan(userId: string) {
  const [planId, setPlanId] = useState('free');
  const [status, setStatus] = useState<'active' | 'canceled' | 'past_due'>('active');
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [{ data: row }, { data: used }] = await Promise.all([
      supabase.from('user_plans').select('plan, status').eq('user_id', userId).maybeSingle(),
      supabase.rpc('cloud_ai_credits_used', { p_app: APP.slug, p_since: monthStartISO() }),
    ]);
    const r = row as { plan?: string; status?: 'active' | 'canceled' | 'past_due' } | null;
    setPlanId(r && r.status !== 'canceled' ? (r.plan ?? 'free') : 'free');
    setStatus(r?.status ?? 'active');
    setCreditsUsed(Number(used) || 0);
    setLoading(false);
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);
  const plan: PlanDef = planById(planId);
  return { plan, status, creditsUsed, loading, reload: load };
}
