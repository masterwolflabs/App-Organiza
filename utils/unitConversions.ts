export interface UnitDef {
  label: string;
  /** Multiply by this to convert 1 of this unit into the category's base unit. Unused for temperature. */
  factor?: number;
}

export interface UnitCategory {
  label: string;
  units: Record<string, UnitDef>;
  baseUnit: string;
}

export const UNIT_CATEGORIES: Record<string, UnitCategory> = {
  longitud: {
    label: 'Longitud',
    baseUnit: 'm',
    units: {
      km: { label: 'Kilómetros', factor: 1000 },
      m: { label: 'Metros', factor: 1 },
      cm: { label: 'Centímetros', factor: 0.01 },
      mm: { label: 'Milímetros', factor: 0.001 },
      mi: { label: 'Millas', factor: 1609.344 },
      yd: { label: 'Yardas', factor: 0.9144 },
      ft: { label: 'Pies', factor: 0.3048 },
      in: { label: 'Pulgadas', factor: 0.0254 },
    },
  },
  peso: {
    label: 'Peso y Masa',
    baseUnit: 'kg',
    units: {
      t: { label: 'Toneladas', factor: 1000 },
      kg: { label: 'Kilogramos', factor: 1 },
      g: { label: 'Gramos', factor: 0.001 },
      mg: { label: 'Miligramos', factor: 0.000001 },
      lb: { label: 'Libras', factor: 0.45359237 },
      oz: { label: 'Onzas', factor: 0.028349523125 },
    },
  },
  temperatura: {
    label: 'Temperatura',
    baseUnit: 'c',
    units: {
      c: { label: 'Celsius' },
      f: { label: 'Fahrenheit' },
      k: { label: 'Kelvin' },
    },
  },
  volumen: {
    label: 'Volumen',
    baseUnit: 'l',
    units: {
      l: { label: 'Litros', factor: 1 },
      ml: { label: 'Mililitros', factor: 0.001 },
      m3: { label: 'Metros cúbicos', factor: 1000 },
      galUS: { label: 'Galones (US)', factor: 3.785411784 },
      cupUS: { label: 'Tazas (US)', factor: 0.2365882365 },
    },
  },
  area: {
    label: 'Área',
    baseUnit: 'm2',
    units: {
      m2: { label: 'Metros²', factor: 1 },
      km2: { label: 'Kilómetros²', factor: 1_000_000 },
      ha: { label: 'Hectáreas', factor: 10_000 },
      ft2: { label: 'Pies²', factor: 0.09290304 },
      acre: { label: 'Acres', factor: 4046.8564224 },
    },
  },
  velocidad: {
    label: 'Velocidad',
    baseUnit: 'ms',
    units: {
      ms: { label: 'Metros/segundo', factor: 1 },
      kmh: { label: 'Kilómetros/hora', factor: 1 / 3.6 },
      mph: { label: 'Millas/hora', factor: 0.44704 },
      nudo: { label: 'Nudos', factor: 0.5144444444 },
    },
  },
};

function celsiusToUnit(celsius: number, unit: string): number {
  switch (unit) {
    case 'c':
      return celsius;
    case 'f':
      return celsius * (9 / 5) + 32;
    case 'k':
      return celsius + 273.15;
    default:
      return celsius;
  }
}

function unitToCelsius(value: number, unit: string): number {
  switch (unit) {
    case 'c':
      return value;
    case 'f':
      return (value - 32) * (5 / 9);
    case 'k':
      return value - 273.15;
    default:
      return value;
  }
}

export function convertValue(categoryKey: string, value: number, fromUnit: string, toUnit: string): number {
  if (categoryKey === 'temperatura') {
    return celsiusToUnit(unitToCelsius(value, fromUnit), toUnit);
  }
  const category = UNIT_CATEGORIES[categoryKey];
  const from = category.units[fromUnit];
  const to = category.units[toUnit];
  if (!from?.factor || !to?.factor) return NaN;
  return (value * from.factor) / to.factor;
}
