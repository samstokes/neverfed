import type { FillTime } from './types';

export const DAY = 24 * 60;

/** 'HH:MM' → minutes since midnight. Accepts '24:00' as end of day. */
export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isValidTime(hhmm: string, allowEndOfDay = false): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (allowEndOfDay && h === 24 && min === 0) return true;
  return h < 24 && min < 60;
}

export function fromMin(min: number): string {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Forward distance from a to b around the clock, in (0, DAY]. */
export function forwardDist(a: number, b: number): number {
  const d = (((b - a) % DAY) + DAY) % DAY;
  return d === 0 ? DAY : d;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function isAllDay(t: FillTime): boolean {
  return t.kind === 'window' && toMin(t.from) === 0 && toMin(t.to) >= DAY;
}

/** Sort key: a fill's time, or its window's start. */
export function startMin(t: FillTime): number {
  return toMin(t.kind === 'at' ? t.at : t.from);
}

export function formatFillTime(t: FillTime): string {
  if (t.kind === 'at') return t.at;
  if (isAllDay(t)) return 'Any time';
  return `${t.from}–${t.to}`;
}

/** Stable key used to group fills that happen at the same time / in the same visit window. */
export function timeKey(t: FillTime): string {
  return t.kind === 'at' ? `at ${t.at}` : `window ${t.from}-${t.to}`;
}
