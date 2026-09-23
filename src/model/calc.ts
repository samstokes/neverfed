import type { AppData, Cat, Feeder, Fill, Food, Plan } from './types';

/** A fill with its food and amount resolved (from the fill if manual, from the feeder if auto). */
export interface ResolvedFill {
  fill: Fill;
  feeder: Feeder | undefined;
  food: Food | undefined;
  qty: number | null;
  manual: boolean;
  /** null when it can't be computed; see issues. */
  kcal: number | null;
  /** Fraction of this fill's calories credited to each cat. */
  attribution: Record<string, number>;
  issues: string[];
}

export type Status = 'under' | 'on' | 'over' | 'unknown';

export interface CatTotal {
  cat: Cat;
  /** null if any fill reaching this cat has unknown calories. */
  kcal: number | null;
  /** Calories from the fills we could compute, even when the total is unknown. */
  knownKcal: number;
  manualKcal: number;
  autoKcal: number;
  /** kcal / target, or null. */
  ratio: number | null;
  status: Status;
}

export interface PlanSummary {
  plan: Plan;
  fills: ResolvedFill[];
  totals: CatTotal[];
  /** Things to fill in before the numbers mean anything. Deduplicated. */
  issues: string[];
  /** Shared feeders used by this plan, whose split is an estimate. */
  sharedFeeders: Feeder[];
}

export const TOLERANCE = 0.05;

export function statusFor(ratio: number | null): Status {
  if (ratio === null) return 'unknown';
  if (ratio < 1 - TOLERANCE) return 'under';
  if (ratio > 1 + TOLERANCE) return 'over';
  return 'on';
}

/** Normalised calorie split for a feeder, over the cats that can access it. */
export function attributionFor(feeder: Feeder): Record<string, number> {
  const ids = feeder.catIds;
  if (ids.length === 0) return {};
  if (ids.length === 1) return { [ids[0]!]: 1 };
  const weights = ids.map((id) => {
    const w = feeder.share[id];
    return w === undefined || !Number.isFinite(w) || w < 0 ? 1 : w;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  ids.forEach((id, i) => {
    out[id] = sum > 0 ? weights[i]! / sum : 1 / ids.length;
  });
  return out;
}

export function resolveFill(data: AppData, fill: Fill): ResolvedFill {
  const issues: string[] = [];
  const feeder = data.feeders.find((f) => f.id === fill.feederId);
  if (!feeder) {
    return {
      fill, feeder, food: undefined, qty: null, manual: true, kcal: null, attribution: {},
      issues: ['A fill uses a feeder that no longer exists'],
    };
  }
  const manual = feeder.kind !== 'auto';
  const foodId = manual ? fill.foodId : feeder.loadedFoodId;
  const food = foodId ? data.foods.find((f) => f.id === foodId) : undefined;
  const qty = manual ? fill.qty : feeder.portion;

  if (!food) {
    issues.push(manual ? `A fill in ${feeder.name} has no food chosen` : `${feeder.name} has no food loaded`);
  } else if (food.kcalPerUnit === null) {
    issues.push(`${food.name} has no kcal per ${food.form === 'dry' ? 'cup' : 'can'}`);
  }
  if (qty === null || !Number.isFinite(qty)) {
    issues.push(manual ? `A fill in ${feeder.name} has no amount` : `${feeder.name} has no portion size set`);
  }
  if (feeder.catIds.length === 0) {
    issues.push(`${feeder.name} isn't assigned to any cats`);
  }
  if (food && !feeder.accepts.includes(food.form)) {
    issues.push(`${feeder.name} doesn't take ${food.form} food (${food.name})`);
  }

  const kcal =
    food && food.kcalPerUnit !== null && qty !== null && Number.isFinite(qty) ? qty * food.kcalPerUnit : null;

  return { fill, feeder, food, qty, manual, kcal, attribution: attributionFor(feeder), issues };
}

export function summarisePlan(data: AppData, plan: Plan): PlanSummary {
  const fills = plan.fills.map((f) => resolveFill(data, f));
  const issues = new Set<string>();
  for (const rf of fills) rf.issues.forEach((i) => issues.add(i));

  const totals: CatTotal[] = data.cats.map((cat) => {
    let known = 0;
    let manualKcal = 0;
    let autoKcal = 0;
    let unknown = false;
    for (const rf of fills) {
      const share = rf.attribution[cat.id] ?? 0;
      if (share === 0) continue;
      if (rf.kcal === null) {
        unknown = true;
        continue;
      }
      const k = rf.kcal * share;
      known += k;
      if (rf.manual) manualKcal += k;
      else autoKcal += k;
    }
    if (cat.dailyKcal === null) issues.add(`${cat.name} has no daily kcal target`);
    const kcal = unknown ? null : known;
    const ratio = kcal !== null && cat.dailyKcal ? kcal / cat.dailyKcal : null;
    return { cat, kcal, knownKcal: known, manualKcal, autoKcal, ratio, status: statusFor(ratio) };
  });

  const sharedFeeders = data.feeders.filter(
    (f) => f.catIds.length > 1 && plan.fills.some((fill) => fill.feederId === f.id),
  );

  return { plan, fills, totals, issues: [...issues], sharedFeeders };
}
