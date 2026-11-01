'use client';

import React from 'react';
import { digitsOnly, formatThousands } from '@/utils/formatters';

interface CurrencyInputProps {
  /** Raw numeric value as a digit string, e.g. "1500000" — no dots, no currency symbol. */
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  prefix?: string;
  className?: string;
}

const BASE_CLASS =
  'w-full rounded-xl bg-zinc-900 p-3 text-white border border-zinc-700 font-mono focus:border-sky-500 focus:outline-none';

/** Amount input that shows Chilean thousands separators (e.g. "1.500.000") while typing, but keeps the underlying state as a plain digit string. */
export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
  disabled,
  id,
  prefix = '$',
  className,
}) => {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">{prefix}</span>
      )}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatThousands(value)}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        className={`${className ?? BASE_CLASS} ${prefix ? 'pl-7' : ''} disabled:opacity-40`}
      />
    </div>
  );
};
