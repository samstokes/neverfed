import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyData } from '../model/types';
import { load, save } from './db';
import { ImportError, migrate } from './migrate';

describe('store', () => {
  it('starts empty and round-trips', async () => {
    expect(await load()).toEqual(emptyData());
    const d = emptyData();
    d.cats.push({ id: 'x', name: 'Test', dailyKcal: 100, color: '#000' });
    await save(d);
    expect(await load()).toEqual(d);
  });

  it('migrates v1 single-food fills to items', () => {
    const v1 = {
      schemaVersion: 1, cats: [], foods: [], feeders: [],
      plans: [{ id: 'p', name: 'P', notes: '', fills: [
        { id: 'a', feederId: 'm', time: { kind: 'at', at: '08:00' }, foodId: 'x', qty: 0.5, graze: { kind: 'none' }, note: '' },
        { id: 'b', feederId: 'auto', time: { kind: 'at', at: '09:00' }, foodId: null, qty: null, graze: { kind: 'none' }, note: '' },
      ] }],
    };
    const d = migrate(v1);
    expect(d.schemaVersion).toBe(2);
    expect(d.plans[0]!.fills.map((f) => f.items)).toEqual([[{ foodId: 'x', qty: 0.5 }], []]);
    expect(d.plans[0]!.fills[0]).not.toHaveProperty('foodId');
  });

  it('rejects things that are not backups', () => {
    expect(() => migrate(42)).toThrow(ImportError);
    expect(() => migrate({})).toThrow(ImportError);
    expect(() => migrate({ schemaVersion: 2, cats: [] })).toThrow(/missing foods/);
    expect(() => migrate({ schemaVersion: 1, cats: [] })).toThrow(/missing foods/);
    expect(() => migrate({ schemaVersion: 99, cats: [], foods: [], feeders: [], plans: [] })).toThrow(/newer version/);
  });
});
