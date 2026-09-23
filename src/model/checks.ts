import type { ResolvedFill } from './calc';
import { DAY, forwardDist, toMin } from './time';
import type { AppData, Feeder, Fill, Food, Plan } from './types';

/** Wet food left down longer than this is flagged as a spoilage risk. */
export const WET_MAX_MINUTES = 4 * 60;

/** Fills this cat can physically get at: manual fills in its feeders, plus shared auto dispenses. */
export function fillsForCat(data: AppData, plan: Plan, catId: string): Fill[] {
  return plan.fills.filter((fill) => {
    const feeder = data.feeders.find((f) => f.id === fill.feederId);
    return feeder?.catIds.includes(catId) ?? false;
  });
}

export function feedingsPerDay(data: AppData, plan: Plan, catId: string): number {
  return fillsForCat(data, plan, catId).length;
}

export interface Gap {
  minutes: number;
  /** Start and end of the gap, minutes since midnight. */
  from: number;
  to: number;
  /** True if the plan has visit windows, so this is the worst case over when visits happen. */
  worstCase: boolean;
}

interface Interval {
  start: number;
  len: number;
}

/**
 * Longest stretch with no food available to a cat, including the overnight
 * wrap-around. Food counts as available from when it's put down until its
 * graze window ends: an open-ended graze lasts until the feeder's next fill.
 * Fills with a visit window are tried at each end of their window, and the
 * worst result is reported.
 *
 * Returns null if the cat has no feedings at all.
 */
export function longestGap(data: AppData, plan: Plan, catId: string): Gap | null {
  const fills = fillsForCat(data, plan, catId);
  if (fills.length === 0) return null;

  const windowKeys = [
    ...new Set(fills.flatMap((f) => (f.time.kind === 'window' ? [`${f.time.from}-${f.time.to}`] : []))),
  ];
  // Fills sharing a window are one visit, so they move together.
  const combos: Record<string, 'from' | 'to'>[] = [];
  if (windowKeys.length <= 8) {
    for (let mask = 0; mask < 1 << windowKeys.length; mask++) {
      combos.push(Object.fromEntries(windowKeys.map((k, i) => [k, mask & (1 << i) ? 'to' : 'from'])));
    }
  } else {
    combos.push(Object.fromEntries(windowKeys.map((k) => [k, 'from'])));
    combos.push(Object.fromEntries(windowKeys.map((k) => [k, 'to'])));
  }

  let worst: Gap | null = null;
  for (const combo of combos) {
    const startOf = (f: Fill): number => {
      if (f.time.kind === 'at') return toMin(f.time.at) % DAY;
      const end = combo[`${f.time.from}-${f.time.to}`] === 'to' ? f.time.to : f.time.from;
      return toMin(end) % DAY;
    };
    const intervals: Interval[] = fills.map((f) => {
      const start = startOf(f);
      let len = 0;
      if (f.graze.kind === 'until') {
        const d = forwardDist(start, toMin(f.graze.until));
        len = d === DAY ? 0 : d;
      } else if (f.graze.kind === 'open') {
        const others = plan.fills.filter((o) => o.feederId === f.feederId && o.id !== f.id);
        len = others.length === 0 ? DAY : Math.min(...others.map((o) => forwardDist(start, startOf(o))));
      }
      return { start, len };
    });
    const gap = maxCircularGap(intervals);
    if (!worst || gap.minutes > worst.minutes) worst = { ...gap, worstCase: windowKeys.length > 0 };
  }
  return worst;
}

function maxCircularGap(intervals: Interval[]): Omit<Gap, 'worstCase'> {
  if (intervals.some((i) => i.len >= DAY)) return { minutes: 0, from: 0, to: 0 };
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const first = sorted[0]!;
  // Anything from the previous day that's still running when the first fill lands.
  let reach = Math.max(first.start + first.len, ...sorted.map((i) => i.start + i.len - DAY));
  let best = { minutes: 0, from: 0, to: 0 };
  const lap = [...sorted.slice(1), { start: first.start + DAY, len: first.len }];
  for (const iv of lap) {
    if (iv.start > reach && iv.start - reach > best.minutes) {
      best = { minutes: iv.start - reach, from: reach % DAY, to: iv.start % DAY };
    }
    reach = Math.max(reach, iv.start + iv.len);
  }
  return best;
}

export interface WetWarning {
  fill: Fill;
  food: Food;
  feeder: Feeder;
  /** Minutes it may sit out, or null if open-ended. */
  minutes: number | null;
}

/** Wet fills that may sit out longer than WET_MAX_MINUTES. */
export function wetSittingOut(fills: ResolvedFill[]): WetWarning[] {
  const out: WetWarning[] = [];
  for (const rf of fills) {
    if (!rf.food || !rf.feeder || rf.food.form !== 'wet') continue;
    const { graze, time } = rf.fill;
    if (graze.kind === 'open') {
      out.push({ fill: rf.fill, food: rf.food, feeder: rf.feeder, minutes: null });
    } else if (graze.kind === 'until') {
      // Worst case for a visit window: put down at the start of it.
      const start = toMin(time.kind === 'at' ? time.at : time.from);
      const d = forwardDist(start, toMin(graze.until));
      if (d > WET_MAX_MINUTES && d < DAY) out.push({ fill: rf.fill, food: rf.food, feeder: rf.feeder, minutes: d });
    }
  }
  return out;
}

export interface Runway {
  feeder: Feeder;
  dispensesPerDay: number;
  /** null if the portion isn't set. */
  cupsPerDay: number | null;
  /** null if the hopper size or portion isn't set. */
  days: number | null;
}

export function hopperRunway(data: AppData, plan: Plan): Runway[] {
  return data.feeders
    .filter((f) => f.kind === 'auto')
    .map((feeder) => {
      const dispensesPerDay = plan.fills.filter((f) => f.feederId === feeder.id).length;
      const cupsPerDay = feeder.portion !== null ? feeder.portion * dispensesPerDay : null;
      const days =
        feeder.hopperCups !== null && cupsPerDay !== null && cupsPerDay > 0 ? feeder.hopperCups / cupsPerDay : null;
      return { feeder, dispensesPerDay, cupsPerDay, days };
    })
    .filter((r) => r.dispensesPerDay > 0);
}

export interface FoodNeed {
  food: Food;
  /** Per-day amount, in the food's unit, from manual fills. */
  manualPerDay: number;
  /** Per-day amount from auto feeders. */
  autoPerDay: number;
  total: number;
}

/** Total of each food a plan uses over a number of days. */
export function foodForTrip(fills: ResolvedFill[], days: number): FoodNeed[] {
  const byFood = new Map<string, FoodNeed>();
  for (const rf of fills) {
    if (!rf.food || rf.qty === null || !Number.isFinite(rf.qty)) continue;
    let need = byFood.get(rf.food.id);
    if (!need) {
      need = { food: rf.food, manualPerDay: 0, autoPerDay: 0, total: 0 };
      byFood.set(rf.food.id, need);
    }
    if (rf.manual) need.manualPerDay += rf.qty;
    else need.autoPerDay += rf.qty;
  }
  const needs = [...byFood.values()];
  for (const n of needs) n.total = (n.manualPerDay + n.autoPerDay) * days;
  return needs;
}
