import { SCHEMA_VERSION, emptyData, type AppData } from '../model/types';

/**
 * Upgrades stored or imported data to the current schema. Add a step here
 * whenever the model changes: `migrations[n]` turns version n into n + 1.
 */
const migrations: Record<number, (d: any) => any> = {
  // v2: a fill can hold several foods (e.g. wet and dry put down together).
  1: (d) => ({
    ...d,
    schemaVersion: 2,
    plans: !Array.isArray(d.plans) ? d.plans : d.plans.map((p: any) => ({
      ...p,
      fills: !Array.isArray(p?.fills) ? p?.fills : p.fills.map(({ foodId, qty, ...f }: any) => ({
        ...f,
        items: foodId || qty != null ? [{ foodId: foodId ?? null, qty: qty ?? null }] : [],
      })),
    })),
  }),
  // v3: no "eaten now" option; a fill is left down unless picked up at a set time.
  // Cats say whether they graze or eat in one go.
  2: (d) => ({
    ...d,
    schemaVersion: 3,
    cats: !Array.isArray(d.cats) ? d.cats : d.cats.map((c: any) => ({ ...c, eats: c.eats ?? null })),
    plans: !Array.isArray(d.plans) ? d.plans : d.plans.map((p: any) => ({
      ...p,
      fills: !Array.isArray(p?.fills) ? p?.fills : p.fills.map(({ graze, ...f }: any) => ({
        ...f,
        pickUpAt: graze?.kind === 'until' && f.time?.kind === 'at' ? graze.until : null,
      })),
    })),
  }),
};

export class ImportError extends Error {}

export function migrate(raw: unknown): AppData {
  if (raw === null || raw === undefined) return emptyData();
  if (typeof raw !== 'object') throw new ImportError('Not a Neverfed backup: expected a JSON object.');
  let d = raw as any;
  if (typeof d.schemaVersion !== 'number') throw new ImportError('Not a Neverfed backup: no schemaVersion.');
  if (d.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError(`This backup is from a newer version of the app (schema ${d.schemaVersion}). Reload to update, then try again.`);
  }
  while (d.schemaVersion < SCHEMA_VERSION) {
    const step = migrations[d.schemaVersion];
    if (!step) throw new ImportError(`Don't know how to upgrade schema version ${d.schemaVersion}.`);
    try {
      d = step(d);
    } catch {
      // Steps assume the previous version's shape; anything else is a malformed backup.
      throw new ImportError(`Not a Neverfed backup: couldn't upgrade it from schema version ${d.schemaVersion}.`);
    }
  }
  validate(d);
  return d as AppData;
}

const isObject = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isString = (x: unknown): x is string => typeof x === 'string';
const isNullableNumber = (x: unknown) => x === null || typeof x === 'number';
const isNullableString = (x: unknown) => x === null || typeof x === 'string';

/**
 * Checks the shape of everything the app reads, so a malformed backup is
 * rejected on import rather than crashing a screen later.
 */
function validate(d: any): void {
  const fail = (what: string): never => {
    throw new ImportError(`Not a Neverfed backup: ${what}.`);
  };
  for (const key of ['cats', 'foods', 'feeders', 'plans'] as const) {
    if (!Array.isArray(d[key])) fail(`missing ${key}`);
  }
  for (const c of d.cats) {
    if (!isObject(c) || !isString(c.id) || !isString(c.name) || !isNullableNumber(c.dailyKcal)) fail('a cat is malformed');
  }
  for (const f of d.foods) {
    if (!isObject(f) || !isString(f.id) || !isString(f.name) || !['dry', 'wet'].includes(f.form) || !isNullableNumber(f.kcalPerUnit)) {
      fail('a food is malformed');
    }
  }
  for (const f of d.feeders) {
    if (
      !isObject(f) || !isString(f.id) || !isString(f.name) || !['microchip', 'auto'].includes(f.kind) ||
      !Array.isArray(f.catIds) || !Array.isArray(f.accepts) || !isObject(f.share) ||
      !isNullableString(f.loadedFoodId) || !isNullableNumber(f.portion) || !isNullableNumber(f.hopperCups)
    ) {
      fail('a feeder is malformed');
    }
  }
  for (const p of d.plans) {
    if (!isObject(p) || !isString(p.id) || !Array.isArray(p.fills)) fail('a plan is malformed');
    for (const f of p.fills) {
      const t = f?.time;
      const timeOk = isObject(t) && ((t.kind === 'at' && isString(t.at)) || (t.kind === 'window' && isString(t.from) && isString(t.to)));
      const itemsOk =
        Array.isArray(f?.items) && f.items.every((i: any) => isObject(i) && isNullableString(i.foodId) && isNullableNumber(i.qty));
      if (!isObject(f) || !isString(f.id) || !isString(f.feederId) || !timeOk || !itemsOk || !isNullableString(f.pickUpAt)) {
        fail(`a fill in plan “${isString(p.name) ? p.name : p.id}” is malformed`);
      }
    }
  }
}
