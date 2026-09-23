import { describe, expect, it } from 'vitest';
import { attributionFor, summarisePlan, statusFor } from './calc';
import { feedingsPerDay, foodForTrip, hopperRunway, longestGap, wetSittingOut } from './checks';
import { sitterText } from './sitter';
import { formatDuration, fromMin } from './time';
import type { AppData, Feeder, Fill, FillTime, Graze } from './types';
import { formatAmount, formatQty, parseQty } from './units';

// Fixture: made-up cats and foods. Real data lives only in the user's browser.
function fixture(): AppData {
  const feeder = (f: Partial<Feeder> & Pick<Feeder, 'id' | 'kind' | 'catIds'>): Feeder => ({
    name: f.id,
    accepts: f.kind === 'auto' ? ['dry'] : ['dry', 'wet'],
    loadedFoodId: null,
    portion: null,
    hopperCups: null,
    share: {},
    ...f,
  });
  return {
    schemaVersion: 1,
    cats: [
      { id: 'a', name: 'Alpha', dailyKcal: 200, color: '#f00' },
      { id: 'b', name: 'Bravo', dailyKcal: 250, color: '#00f' },
    ],
    foods: [
      { id: 'kib', name: 'Kibble', form: 'dry', kcalPerUnit: 400, notes: '' },
      { id: 'lite', name: 'Lite kibble', form: 'dry', kcalPerUnit: null, notes: '' },
      { id: 'tin', name: 'Tin', form: 'wet', kcalPerUnit: 80, notes: '' },
    ],
    feeders: [
      feeder({ id: 'fa', kind: 'microchip', catIds: ['a'] }),
      feeder({ id: 'fb', kind: 'microchip', catIds: ['b'] }),
      feeder({ id: 'auto', kind: 'auto', catIds: ['a', 'b'], loadedFoodId: 'kib', portion: 0.125, hopperCups: 4 }),
    ],
    plans: [],
  };
}

let n = 0;
function at(t: string): FillTime {
  return { kind: 'at', at: t };
}
function fill(feederId: string, time: FillTime, foodId: string | null = null, qty: number | null = null, graze: Graze = { kind: 'none' }): Fill {
  return { id: `f${n++}`, feederId, time, foodId, qty, graze, note: '' };
}

describe('units', () => {
  it('formats cups with scoops', () => {
    expect(formatAmount('dry', 0.5)).toBe('½ cup · 2 scoops');
    expect(formatAmount('dry', 0.125)).toBe('⅛ cup · ½ scoop');
    expect(formatAmount('dry', 0.375)).toBe('⅜ cup · 1½ scoops');
    expect(formatAmount('dry', 1.5)).toBe('1½ cups · 6 scoops');
    expect(formatAmount('wet', 0.5)).toBe('½ can');
    expect(formatAmount('wet', 3)).toBe('3 cans');
  });
  it('formats odd quantities as decimals', () => {
    expect(formatQty(0.3)).toBe('0.3');
    expect(formatQty(2 / 3)).toBe('⅔');
  });
  it('parses fractions', () => {
    expect(parseQty('1/8')).toBe(0.125);
    expect(parseQty('1 1/2')).toBe(1.5);
    expect(parseQty('½')).toBe(0.5);
    expect(parseQty('1½')).toBe(1.5);
    expect(parseQty('.25')).toBe(0.25);
    expect(parseQty('abc')).toBeNull();
    expect(parseQty('')).toBeNull();
  });
});

describe('calories', () => {
  it('splits shared feeders by normalised share, defaulting to even', () => {
    const d = fixture();
    const auto = d.feeders[2]!;
    expect(attributionFor(auto)).toEqual({ a: 0.5, b: 0.5 });
    expect(attributionFor({ ...auto, share: { a: 1, b: 3 } })).toEqual({ a: 0.25, b: 0.75 });
    expect(attributionFor({ ...auto, share: { a: 0, b: 0 } })).toEqual({ a: 0.5, b: 0.5 });
    expect(attributionFor(d.feeders[0]!)).toEqual({ a: 1 });
  });

  it('totals per cat, with auto food and amount from the feeder', () => {
    const d = fixture();
    const plan = {
      id: 'p', name: 'P', notes: '',
      fills: [
        fill('fa', at('08:00'), 'kib', 0.25, { kind: 'until', until: '14:00' }), // 100 → a
        fill('fb', at('08:00'), 'tin', 1), // 80 → b
        fill('auto', at('09:00')), // 50 → 25/25
        fill('auto', at('21:00')), // 50 → 25/25
      ],
    };
    const s = summarisePlan(d, plan);
    expect(s.issues).toEqual([]);
    const [a, b] = s.totals;
    expect(a!.kcal).toBe(150);
    expect(a!.manualKcal).toBe(100);
    expect(a!.autoKcal).toBe(50);
    expect(a!.status).toBe('under');
    expect(b!.kcal).toBe(130);
    expect(s.sharedFeeders.map((f) => f.id)).toEqual(['auto']);
  });

  it('treats missing densities as unknown, not zero', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [fill('fa', at('08:00'), 'lite', 0.5), fill('fb', at('08:00'), 'kib', 0.5)] };
    const s = summarisePlan(d, plan);
    expect(s.totals[0]!.kcal).toBeNull();
    expect(s.totals[0]!.status).toBe('unknown');
    expect(s.totals[1]!.kcal).toBe(200);
    expect(s.issues).toContain('Lite kibble has no kcal per cup');
  });

  it('flags an auto feeder with no portion', () => {
    const d = fixture();
    d.feeders[2]!.portion = null;
    const s = summarisePlan(d, { id: 'p', name: 'P', notes: '', fills: [fill('auto', at('09:00'))] });
    expect(s.totals.every((t) => t.kcal === null)).toBe(true);
    expect(s.issues).toContain('auto has no portion size set');
  });

  it('flags missing targets', () => {
    const d = fixture();
    d.cats[0]!.dailyKcal = null;
    const s = summarisePlan(d, { id: 'p', name: 'P', notes: '', fills: [] });
    expect(s.totals[0]!.status).toBe('unknown');
    expect(s.issues).toContain('Alpha has no daily kcal target');
  });

  it('classifies status at ±5%', () => {
    expect(statusFor(0.94)).toBe('under');
    expect(statusFor(0.96)).toBe('on');
    expect(statusFor(1.05)).toBe('on');
    expect(statusFor(1.06)).toBe('over');
  });
});

describe('checks', () => {
  it('counts feedings including shared auto dispenses', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [fill('fa', at('08:00'), 'kib', 0.25), fill('auto', at('09:00')), fill('fb', at('10:00'), 'kib', 0.25)] };
    expect(feedingsPerDay(d, plan, 'a')).toBe(2);
    expect(feedingsPerDay(d, plan, 'b')).toBe(2);
  });

  it('finds the longest gap across midnight', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [fill('fa', at('08:00'), 'kib', 0.25), fill('fa', at('18:00'), 'kib', 0.25)] };
    const g = longestGap(d, plan, 'a')!;
    expect(g.minutes).toBe(14 * 60);
    expect(fromMin(g.from)).toBe('18:00');
    expect(fromMin(g.to)).toBe('08:00');
    expect(g.worstCase).toBe(false);
    expect(longestGap(d, plan, 'b')).toBeNull();
  });

  it('counts grazing time as fed', () => {
    const d = fixture();
    const plan = {
      id: 'p', name: 'P', notes: '',
      fills: [fill('fa', at('08:00'), 'kib', 0.25, { kind: 'until', until: '14:00' }), fill('fa', at('18:00'), 'kib', 0.25), fill('fa', at('23:00'), 'kib', 0.25)],
    };
    const g = longestGap(d, plan, 'a')!;
    expect(formatDuration(g.minutes)).toBe('9h'); // 23:00 → 08:00
  });

  it('handles grazing that runs past midnight', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [fill('fa', at('20:00'), 'kib', 0.25, { kind: 'until', until: '06:00' }), fill('fa', at('12:00'), 'kib', 0.25)] };
    const g = longestGap(d, plan, 'a')!;
    expect(g.minutes).toBe(8 * 60); // 12:00 → 20:00; 06:00 → 12:00 is only 6h
    expect(fromMin(g.from)).toBe('12:00');
  });

  it('assumes the worst case for visit windows', () => {
    const d = fixture();
    const plan = {
      id: 'p', name: 'P', notes: '',
      fills: [fill('fa', { kind: 'window', from: '09:00', to: '18:00' }, 'kib', 0.25), fill('auto', at('12:00'))],
    };
    const g = longestGap(d, plan, 'a')!;
    // Visit at 09:00: gaps 3h and 21h. At 18:00: 6h and 18h. Worst = 21h.
    expect(g.minutes).toBe(21 * 60);
    expect(g.worstCase).toBe(true);
  });

  it('treats an open-ended graze as lasting until the next fill', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [fill('fa', at('08:00'), 'kib', 0.5, { kind: 'open' })] };
    expect(longestGap(d, plan, 'a')!.minutes).toBe(0);
  });

  it('flags wet food left down', () => {
    const d = fixture();
    const plan = {
      id: 'p', name: 'P', notes: '',
      fills: [
        fill('fa', at('08:00'), 'tin', 0.5, { kind: 'until', until: '10:00' }),
        fill('fa', at('08:00'), 'tin', 0.5, { kind: 'until', until: '18:00' }),
        fill('fb', { kind: 'window', from: '00:00', to: '24:00' }, 'tin', 0.5, { kind: 'open' }),
        fill('fb', at('08:00'), 'kib', 0.5, { kind: 'open' }),
      ],
    };
    const w = wetSittingOut(summarisePlan(d, plan).fills);
    expect(w.map((x) => x.minutes)).toEqual([600, null]);
  });

  it('computes hopper runway and trip food', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [fill('auto', at('09:00')), fill('auto', at('21:00')), fill('fa', at('08:00'), 'kib', 0.25), fill('fb', at('08:00'), 'tin', 0.5)] };
    const [r] = hopperRunway(d, plan);
    expect(r!.cupsPerDay).toBe(0.25);
    expect(r!.days).toBe(16);
    const needs = foodForTrip(summarisePlan(d, plan).fills, 4);
    expect(needs.map((x) => [x.food.id, x.total, x.autoPerDay])).toEqual([
      ['kib', 2, 0.25],
      ['tin', 2, 0],
    ]);
  });
});

describe('sitter sheet', () => {
  it('lists manual fills by visit and states the auto feeder needs nothing', () => {
    const d = fixture();
    const win: FillTime = { kind: 'window', from: '00:00', to: '24:00' };
    const plan = {
      id: 'p', name: 'Away', notes: 'Water bowl in the hall.',
      fills: [
        fill('fa', win, 'tin', 0.5),
        fill('fa', win, 'kib', 0.25, { kind: 'open' }),
        fill('fb', win, 'kib', 0.375, { kind: 'open' }),
        fill('auto', at('09:00')),
        fill('auto', at('21:00')),
      ],
    };
    const text = sitterText(d, plan, 3);
    expect(text).toContain('Away · 3 days');
    expect(text).toContain('fa: microchip-locked: only opens for Alpha');
    expect(text).toContain('Once a day, any time');
    expect(text).toContain('fa (Alpha): ½ can Tin, eaten straight away');
    expect(text).toContain('fb (Bravo): ⅜ cup · 1½ scoops Kibble, leave it down to graze');
    expect(text).toContain('AUTO: NO ACTION NEEDED');
    expect(text).toContain('at 09:00, 21:00');
    expect(text).toContain('lasts about 16 days, so it only needs filling before the trip');
    expect(text).toContain('Tin: 1½ cans');
    expect(text).toContain('Water bowl in the hall.');
    expect(text.match(/Once a day/g)).toHaveLength(1);
  });
});
