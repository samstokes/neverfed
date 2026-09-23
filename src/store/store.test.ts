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

  it('rejects things that are not backups', () => {
    expect(() => migrate(42)).toThrow(ImportError);
    expect(() => migrate({})).toThrow(ImportError);
    expect(() => migrate({ schemaVersion: 1, cats: [] })).toThrow(/missing foods/);
    expect(() => migrate({ schemaVersion: 99, cats: [], foods: [], feeders: [], plans: [] })).toThrow(/newer version/);
  });
});
