import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyData } from '../model/types';
import { load, save } from './db';
import { ImportError, migrate } from './migrate';

describe('store', () => {
  it('starts empty and round-trips', async () => {
    expect(await load()).toEqual(emptyData());
    const d = emptyData();
    d.cats.push({ id: 'x', name: 'Test', dailyKcal: 100, color: '#000', eats: null });
    await save(d);
    expect(await load()).toEqual(d);
  });

  it('migrates v1 → v3', () => {
    const v1 = {
      schemaVersion: 1, foods: [], feeders: [],
      cats: [{ id: 'c', name: 'C', dailyKcal: null, color: '#000' }],
      plans: [{ id: 'p', name: 'P', notes: '', fills: [
        { id: 'a', feederId: 'm', time: { kind: 'at', at: '08:00' }, foodId: 'x', qty: 0.5, graze: { kind: 'none' }, note: '' },
        { id: 'b', feederId: 'auto', time: { kind: 'at', at: '09:00' }, foodId: null, qty: null, graze: { kind: 'none' }, note: '' },
        { id: 'c', feederId: 'm', time: { kind: 'at', at: '08:00' }, foodId: 'x', qty: 1, graze: { kind: 'until', until: '14:00' }, note: '' },
        { id: 'd', feederId: 'm', time: { kind: 'window', from: '00:00', to: '24:00' }, foodId: 'x', qty: 1, graze: { kind: 'open' }, note: '' },
      ] }],
    };
    const d = migrate(v1);
    expect(d.schemaVersion).toBe(3);
    expect(d.cats[0]!.eats).toBeNull();
    const fills = d.plans[0]!.fills;
    expect(fills.map((f) => f.items)).toEqual([[{ foodId: 'x', qty: 0.5 }], [], [{ foodId: 'x', qty: 1 }], [{ foodId: 'x', qty: 1 }]]);
    expect(fills.map((f) => f.pickUpAt)).toEqual([null, null, '14:00', null]);
    expect(fills[0]).not.toHaveProperty('foodId');
    expect(fills[0]).not.toHaveProperty('graze');
  });

  it('rejects things that are not backups', () => {
    expect(() => migrate(42)).toThrow(ImportError);
    expect(() => migrate({})).toThrow(ImportError);
    expect(() => migrate({ schemaVersion: 3, cats: [] })).toThrow(/missing foods/);
    expect(() => migrate({ schemaVersion: 1, cats: [] })).toThrow(/missing foods/);
    // Malformed data from any version is a clear import error, not a crash.
    const base = { cats: [], foods: [], feeders: [] };
    const fill = { id: 'f', feederId: 'm', time: { kind: 'at', at: '08:00' }, items: [], pickUpAt: null, note: '' };
    const malformed = [
      { plans: [{ id: 'p' }] },
      { plans: [null] },
      { plans: [{ id: 'p', name: 'P', fills: [null] }] },
      { plans: [{ id: 'p', name: 'P', fills: [{ ...fill, time: null }] }] },
      { plans: [], cats: [null] },
      { plans: [], feeders: [{ id: 'x', name: 'X', kind: 'auto' }] },
    ];
    for (const v of [1, 2, 3]) {
      for (const bad of malformed) {
        expect(() => migrate({ schemaVersion: v, ...base, ...bad }), JSON.stringify({ v, bad })).toThrow(ImportError);
      }
    }
    // v1 fills had no items (the upgrade builds them from foodId/qty); from v2 on they're checked.
    for (const items of [undefined, [null]]) {
      const bad = { plans: [{ id: 'p', name: 'P', fills: [{ ...fill, items }] }] };
      expect(() => migrate({ schemaVersion: 2, ...base, ...bad })).toThrow(ImportError);
      expect(() => migrate({ schemaVersion: 3, ...base, ...bad })).toThrow(ImportError);
    }
    expect(() => migrate({ schemaVersion: 99, cats: [], foods: [], feeders: [], plans: [] })).toThrow(/newer version/);
  });
});
