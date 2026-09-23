import type { FoodForm } from './types';

/** A scoop is a quarter cup. */
export const CUPS_PER_SCOOP = 0.25;

const VULGAR: Record<string, string> = {
  '1/8': '⅛', '1/4': '¼', '3/8': '⅜', '1/2': '½', '5/8': '⅝', '3/4': '¾', '7/8': '⅞',
  '1/3': '⅓', '2/3': '⅔', '1/6': '⅙', '5/6': '⅚',
};

const EPS = 1e-6;

/**
 * Formats a quantity as a mixed fraction in eighths or thirds where it fits
 * (1.5 → "1½", 0.375 → "⅜"), otherwise as a short decimal.
 */
export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '?';
  const whole = Math.floor(n + EPS);
  const frac = n - whole;
  if (frac < EPS) return String(whole);
  for (const den of [2, 3, 4, 6, 8]) {
    const num = Math.round(frac * den);
    if (num > 0 && num < den && Math.abs(frac - num / den) < EPS) {
      const g = gcd(num, den);
      const glyph = VULGAR[`${num / g}/${den / g}`];
      if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph;
    }
  }
  return String(Math.round(n * 100) / 100);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function unitName(form: FoodForm, qty: number): string {
  if (form === 'dry') return 'cup';
  return Math.abs(qty - 1) < EPS || qty < 1 ? 'can' : 'cans';
}

/** "½ cup · 2 scoops", "⅛ cup · ½ scoop", "½ can". */
export function formatAmount(form: FoodForm, qty: number): string {
  if (form === 'wet') return `${formatQty(qty)} ${unitName('wet', qty)}`;
  const cups = `${formatQty(qty)} ${qty > 1 + EPS ? 'cups' : 'cup'}`;
  const scoops = qty / CUPS_PER_SCOOP;
  const scoopWord = scoops > 1 + EPS ? 'scoops' : 'scoop';
  return `${cups} · ${formatQty(scoops)} ${scoopWord}`;
}

/** Quick-entry chips for amounts. */
export const AMOUNT_CHIPS: Record<FoodForm, number[]> = {
  dry: [1 / 8, 1 / 4, 3 / 8, 1 / 2, 5 / 8, 3 / 4, 1],
  wet: [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1],
};

/** Parses "0.125", "1/8", "1 1/2", "½", "1½". Returns null if unparseable. */
export function parseQty(input: string): number | null {
  let s = input.trim();
  if (!s) return null;
  for (const [frac, glyph] of Object.entries(VULGAR)) {
    s = s.replace(glyph, ` ${frac}`);
  }
  s = s.trim();
  const parts = s.split(/\s+/);
  let total = 0;
  for (const p of parts) {
    const f = /^(\d+)\/(\d+)$/.exec(p);
    if (f) {
      const den = Number(f[2]);
      if (den === 0) return null;
      total += Number(f[1]) / den;
    } else if (/^\d*\.?\d+$/.test(p)) {
      total += Number(p);
    } else {
      return null;
    }
  }
  return total;
}
