// Data model. See README for the reasoning behind the shapes here.

export type FoodForm = 'dry' | 'wet' | 'treat';

export const FOOD_FORMS: FoodForm[] = ['dry', 'wet', 'treat'];

export interface Cat {
  id: string;
  name: string;
  /** Daily calorie target; null until entered. */
  dailyKcal: number | null;
  /** Identity colour used throughout the UI. */
  color: string;
  /**
   * Whether the cat grazes on food left down or finishes it in one go. Only the
   * gap and wet-food checks use it. null = not said yet, treated as grazing.
   */
  eats: EatingStyle | null;
}

export type EatingStyle = 'grazes' | 'meals';

export interface Food {
  id: string;
  name: string;
  form: FoodForm;
  /**
   * kcal per cup (dry), per can (wet) or per treat: the "ME" figure on the bag or tin.
   * Treat bags often give kcal/kg instead, so the per-treat figure is usually an estimate.
   */
  kcalPerUnit: number | null;
  notes: string;
}

export type FeederKind = 'microchip' | 'auto';

export interface Feeder {
  id: string;
  name: string;
  /** Manual feeders are hand-filled; auto feeders dispense on a schedule. */
  kind: FeederKind;
  /** Who can physically access it. */
  catIds: string[];
  accepts: FoodForm[];

  // Auto feeders only. These live on the device, not on each dispense.
  /** The hopper holds one dry food at a time. */
  loadedFoodId: string | null;
  /** Cups per dispense (the feeder's programmed setting). */
  portion: number | null;
  /** Optional hopper capacity in cups, for "lasts N days". */
  hopperCups: number | null;
  /** How a shared feeder's output is attributed between cats: relative weights. */
  share: Record<string, number>;
}

/**
 * When a fill happens. Your own feedings and auto dispenses happen at a set
 * time; a sitter's visit can happen any time in a window.
 */
export type FillTime =
  | { kind: 'at'; at: string }
  | { kind: 'window'; from: string; to: string };

/** One food in a fill. */
export interface FillItem {
  foodId: string | null;
  /** In the food's unit: cups (dry), cans (wet) or treats. */
  qty: number | null;
}

export interface Fill {
  id: string;
  feederId: string;
  time: FillTime;

  // Manual fills only. Auto dispenses take food and amount from the feeder.
  /** What's put down together, e.g. wet and dry in the same bowl. One feeding however many foods. */
  items: FillItem[];
  /**
   * Food stays down until it's eaten. Set this if someone picks up what's left at a
   * given time. Applies to everything in the fill. Set-time fills only.
   */
  pickUpAt: string | null;
  note: string;
}

export interface Plan {
  id: string;
  name: string;
  notes: string;
  fills: Fill[];
}

export const SCHEMA_VERSION = 3;

export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION;
  cats: Cat[];
  foods: Food[];
  feeders: Feeder[];
  plans: Plan[];
}

export function emptyData(): AppData {
  return { schemaVersion: SCHEMA_VERSION, cats: [], foods: [], feeders: [], plans: [] };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
