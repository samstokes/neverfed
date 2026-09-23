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
      fills: p.fills.map(({ foodId, qty, ...f }: any) => ({
        ...f,
        items: foodId || qty != null ? [{ foodId: foodId ?? null, qty: qty ?? null }] : [],
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
    d = step(d);
  }
  for (const key of ['cats', 'foods', 'feeders', 'plans'] as const) {
    if (!Array.isArray(d[key])) throw new ImportError(`Not a Neverfed backup: missing ${key}.`);
  }
  return d as AppData;
}
