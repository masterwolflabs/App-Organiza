'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UNIT_CATEGORIES, convertValue } from '@/utils/unitConversions';
import { CURRENCY_UNITS, convertCurrency } from '@/utils/currencyConversion';
import { CurrencyInput } from '@/components/calculator/CurrencyInput';
import { ArrowLeftRight, RefreshCw, Loader2 } from 'lucide-react';

// "Moneda" comes first — it's the category people reach for most.
const CATEGORY_KEYS = ['moneda', ...Object.keys(UNIT_CATEGORIES)];
const CATEGORY_LABELS: Record<string, string> = {
  moneda: 'Moneda',
  ...Object.fromEntries(Object.entries(UNIT_CATEGORIES).map(([key, cat]) => [key, cat.label])),
};

function formatConverted(value: number): string {
  if (!isFinite(value)) return '—';
  const digits = Math.abs(value) < 1 ? 8 : Math.abs(value) < 100 ? 6 : 2;
  const rounded = parseFloat(value.toPrecision(10));
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: digits }).format(rounded);
}

function formatUpdatedAt(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

export const CalculatorConverter: React.FC = () => {
  const [category, setCategory] = useState('moneda');
  const [fromUnit, setFromUnit] = useState('usd');
  const [toUnit, setToUnit] = useState('clp');
  const [rawValue, setRawValue] = useState('1');

  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState('');
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const loadRates = useCallback(async () => {
    setRatesLoading(true);
    setRatesError('');
    try {
      const res = await fetch('/api/currency-rates');
      const data = await res.json();
      if (!res.ok || data.error) {
        setRatesError(data.error || 'No se pudieron obtener las tasas.');
        return;
      }
      setRates(data.ratesToUSD);
      setFetchedAt(data.fetchedAt);
    } catch {
      setRatesError('Error de conexión al obtener tasas.');
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  useEffect(() => {
    if (category === 'moneda') {
      setFromUnit('usd');
      setToUnit('clp');
      return;
    }
    const keys = Object.keys(UNIT_CATEGORIES[category].units);
    setFromUnit(keys[0]);
    setToUnit(keys[1] ?? keys[0]);
  }, [category]);

  const optionEntries: [string, string][] = useMemo(() => {
    if (category === 'moneda') return Object.entries(CURRENCY_UNITS);
    return Object.entries(UNIT_CATEGORIES[category].units).map(([key, unit]) => [key, unit.label]);
  }, [category]);

  const inputValue = Number(rawValue || '0');
  const result = useMemo(() => {
    if (category === 'moneda') {
      if (!rates) return NaN;
      return convertCurrency(inputValue, fromUnit, toUnit, rates);
    }
    return convertValue(category, inputValue, fromUnit, toUnit);
  }, [category, inputValue, fromUnit, toUnit, rates]);

  const swap = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
              category === key ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-medium text-zinc-400">De</label>
        <div className="flex gap-2">
          <select
            value={fromUnit}
            onChange={(e) => setFromUnit(e.target.value)}
            className="w-1/2 rounded-xl border border-zinc-700 bg-zinc-900 p-2.5 text-xs text-white focus:border-sky-500 focus:outline-none"
          >
            {optionEntries.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <div className="w-1/2">
            <CurrencyInput value={rawValue} onChange={setRawValue} prefix="" />
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={swap}
          title="Invertir"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-medium text-zinc-400">A</label>
        <div className="flex gap-2">
          <select
            value={toUnit}
            onChange={(e) => setToUnit(e.target.value)}
            className="w-1/2 rounded-xl border border-zinc-700 bg-zinc-900 p-2.5 text-xs text-white focus:border-sky-500 focus:outline-none"
          >
            {optionEntries.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex w-1/2 items-center rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 py-2.5">
            {category === 'moneda' && ratesLoading && !rates ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
            ) : (
              <span className="truncate font-mono text-sm font-semibold text-white">{formatConverted(result)}</span>
            )}
          </div>
        </div>
      </div>

      {category === 'moneda' ? (
        <div className="mt-auto flex items-center justify-between gap-2 text-[10px] text-zinc-500">
          {ratesError ? (
            <span className="text-rose-400">{ratesError}</span>
          ) : (
            <span>
              Fiat: open.er-api.com · Cripto: CoinGecko
              {fetchedAt && ` · Actualizado ${formatUpdatedAt(fetchedAt)}`}
            </span>
          )}
          <button
            onClick={loadRates}
            disabled={ratesLoading}
            title="Actualizar tasas"
            className="flex shrink-0 items-center gap-1 rounded-lg bg-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${ratesLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      ) : (
        <p className="mt-auto text-[10px] text-zinc-500">Conversión de unidades físicas.</p>
      )}
    </div>
  );
};
