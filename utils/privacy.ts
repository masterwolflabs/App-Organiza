// "Ocultar montos" (the eye in the Topbar). A module-level flag read by the
// money formatters (formatCLP / formatUSD / formatMoney), so every amount in
// the app switches to "$ •••••" at once — like a bank app. The Dashboard
// keeps it in React state (so everything re-renders) + localStorage, and
// syncs it here on every render. Only for display: never use the formatters
// to build data that gets saved or sent to the server.

export const PRIVACY_KEY = 'mf-privacy';
export const MASK = '•••••';

let hidden = false;

export function setAmountsHidden(value: boolean) {
  hidden = value;
}

export function amountsHidden() {
  return hidden;
}
