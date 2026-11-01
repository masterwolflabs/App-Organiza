// Currency codes the converter offers, mapped to their display label.
// Values in the live rates table are "units of this currency per 1 USD"
// (fiat rates already come in that shape; crypto prices are inverted to match).
export const CURRENCY_UNITS: Record<string, string> = {
  usd: 'Dólar EE.UU. (USD)',
  clp: 'Peso Chileno (CLP)',
  eur: 'Euro (EUR)',
  gbp: 'Libra Esterlina (GBP)',
  ars: 'Peso Argentino (ARS)',
  brl: 'Real Brasileño (BRL)',
  mxn: 'Peso Mexicano (MXN)',
  pen: 'Sol Peruano (PEN)',
  cop: 'Peso Colombiano (COP)',
  jpy: 'Yen Japonés (JPY)',
  btc: 'Bitcoin (BTC)',
  eth: 'Ethereum (ETH)',
  usdt: 'Tether (USDT)',
  bnb: 'BNB',
  sol: 'Solana (SOL)',
  xrp: 'XRP',
  ada: 'Cardano (ADA)',
  doge: 'Dogecoin (DOGE)',
};

export function convertCurrency(value: number, from: string, to: string, ratesToUSD: Record<string, number>): number {
  const fromRate = ratesToUSD[from];
  const toRate = ratesToUSD[to];
  if (!fromRate || !toRate) return NaN;
  const usdValue = value / fromRate;
  return usdValue * toRate;
}
