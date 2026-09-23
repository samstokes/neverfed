import type { ResolvedFill } from './calc';
import { DAY, forwardDist, toMin } from './time';
import type { AppData, Cat, Feeder, Fill, Food, Plan } from './types';

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

/** A cat that hasn't said how it eats is treated as a grazer. */
export function grazes(cat: Cat | undefined): boolean {
  return cat?.eats !== 'meals';
}

/**
 * Longest stretch with no food available to a cat, including the overnight
 * wrap-around.
 *
 * A cat that eats in one go has food only at the moment each fill lands. A
 * grazer keeps having food while it's left down: until it's picked up, or
 * until that feeder's next fill. That only applies to feeders the cat has to
 * itself; in a shared feeder the other cat may eat the rest, so those fills
 * count as a single moment.
 *
 * Fills with a visit window are tried at each end of their window, and the
 * worst result is reported.
 *
 * Returns null if the cat has no feedings at all.
 */
export function longestGap(data: AppData, plan: Plan, catId: string): Gap | null {
  const fills = fillsForCat(data, plan, catId);
  if (fills.length === 0) return null;
  const grazer = grazes(data.cats.find((c) => c.id === catId));
  const ownFeeder = (f: Fill) => data.feeders.find((x) => x.id === f.feederId)?.catIds.length === 1;

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
      if (!grazer || !ownFeeder(f)) return { start, len: 0 };
      // Left down until the feeder's next fill, or until it's picked up if that's sooner.
      const others = plan.fills.filter((o) => o.feederId === f.feederId && o.id !== f.id);
      let len = others.length === 0 ? DAY : Math.min(...others.map((o) => forwardDist(start, startOf(o))));
      if (f.pickUpAt !== null && f.time.kind === 'at') {
        const d = forwardDist(start, toMin(f.pickUpAt));
        len = Math.min(len, d === DAY ? 0 : d);
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
  /** The wet food in the fill, and how much. */
  food: Food;
  qty: number | null;
  feeder: Feeder;
  /** Minutes it may sit out, or null if it isn't picked up. */
  minutes: number | null;
}

/**
 * Wet fills that may sit out longer than WET_MAX_MINUTES. Only fills a grazing
 * cat can get at: a cat that eats in one go finishes it before it spoils.
 */
export function wetSittingOut(data: AppData, fills: ResolvedFill[]): WetWarning[] {
  const out: WetWarning[] = [];
  for (const rf of fills) {
    if (!rf.feeder || !rf.manual) continue;
    if (!rf.feeder.catIds.some((id) => grazes(data.cats.find((c) => c.id === id)))) continue;
    const { pickUpAt, time } = rf.fill;
    let minutes: number | null = null;
    if (pickUpAt !== null && time.kind === 'at') {
      const d = forwardDist(toMin(time.at), toMin(pickUpAt));
      if (d <= WET_MAX_MINUTES || d >= DAY) continue;
      minutes = d;
    }
    for (const item of rf.items) {
      if (item.food?.form === 'wet') {
        out.push({ fill: rf.fill, food: item.food, qty: item.qty, feeder: rf.feeder, minutes });
      }
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
    for (const { food, qty } of rf.items) {
      if (!food || qty === null || !Number.isFinite(qty)) continue;
      let need = byFood.get(food.id);
      if (!need) {
        need = { food, manualPerDay: 0, autoPerDay: 0, total: 0 };
        byFood.set(food.id, need);
      }
      if (rf.manual) need.manualPerDay += qty;
      else need.autoPerDay += qty;
    }
  }
  const needs = [...byFood.values()];
  for (const n of needs) n.total = (n.manualPerDay + n.autoPerDay) * days;
  return needs;
}
