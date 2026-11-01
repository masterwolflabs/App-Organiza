import { amountsHidden, MASK } from '@/utils/privacy';

export function formatCLP(amount: number): string {
  if (amountsHidden()) return `$ ${MASK}`;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUSD(amount: number): string {
  if (amountsHidden()) return `US$ ${MASK}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/** Strips everything but digits — used to read back a live-formatted amount input. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Formats a raw digit string/number with Chilean thousands separators (dot), no decimals, for live display inside an amount input. */
export function formatThousands(value: string | number): string {
  const raw = typeof value === 'number' ? String(value) : digitsOnly(value);
  if (!raw) return '';
  return new Intl.NumberFormat('es-CL').format(Number(raw));
}
