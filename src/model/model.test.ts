import { describe, expect, it } from 'vitest';
import { attributionFor, describeItems, summarisePlan, statusFor } from './calc';
import { feedingsPerDay, foodForTrip, hopperRunway, longestGap, wetSittingOut } from './checks';
import { sitterText } from './sitter';
import { formatDuration, fromMin } from './time';
import type { AppData, Feeder, Fill, FillTime } from './types';
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
    schemaVersion: 3,
    cats: [
      { id: 'a', name: 'Alpha', dailyKcal: 200, color: '#f00', eats: 'meals' },
      { id: 'b', name: 'Bravo', dailyKcal: 250, color: '#00f', eats: 'grazes' },
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
// Feeder fa is Alpha's (eats in one go), fb is Bravo's (grazes), auto is shared.
function fill(feederId: string, time: FillTime, foodId: string | null = null, qty: number | null = null, pickUpAt: string | null = null): Fill {
  return { id: `f${n++}`, feederId, time, items: foodId ? [{ foodId, qty }] : [], pickUpAt, note: '' };
}
function mixed(feederId: string, time: FillTime, items: [string, number][], pickUpAt: string | null = null): Fill {
  return { id: `f${n++}`, feederId, time, items: items.map(([foodId, qty]) => ({ foodId, qty })), pickUpAt, note: '' };
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
        fill('fa', at('08:00'), 'kib', 0.25, '14:00'), // 100 → a
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
    expect(describeItems(s.fills[0]!.items)).toBe('Kibble (amount not set)');
    d.feeders[2]!.loadedFoodId = null;
    expect(describeItems(summarisePlan(d, { id: 'p', name: 'P', notes: '', fills: [fill('auto', at('09:00'))] }).fills[0]!.items)).toBe('food not set');
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

describe('fills with several foods', () => {
  it('sums calories and counts as one feeding', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [mixed('fa', at('08:00'), [['tin', 0.5], ['kib', 0.25]])] };
    const s = summarisePlan(d, plan);
    expect(s.totals[0]!.kcal).toBe(140); // 40 + 100
    expect(feedingsPerDay(d, plan, 'a')).toBe(1);
  });

  it('is unknown if any food is missing a density', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [mixed('fa', at('08:00'), [['tin', 0.5], ['lite', 0.25]])] };
    const s = summarisePlan(d, plan);
    expect(s.totals[0]!.kcal).toBeNull();
    expect(s.totals[0]!.knownKcal).toBe(0);
  });

  it('flags only the wet part when left down, and totals each food for a trip', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [mixed('fb', at('08:00'), [['tin', 0.5], ['kib', 0.25]])] };
    const s = summarisePlan(d, plan);
    expect(wetSittingOut(d, s.fills).map((w) => [w.food.id, w.qty])).toEqual([['tin', 0.5]]);
    expect(foodForTrip(s.fills, 2).map((x) => [x.food.id, x.total])).toEqual([['tin', 1], ['kib', 0.5]]);
  });

  it('shows as one line on the sitter sheet', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [mixed('fa', at('08:00'), [['tin', 0.5], ['kib', 0.25]])] };
    expect(sitterText(d, plan, 1)).toContain('fa (Alpha): ½ can Tin + ¼ cup · 1 scoop Kibble, leave it down');
  });

  it('flags an empty manual fill', () => {
    const d = fixture();
    const s = summarisePlan(d, { id: 'p', name: 'P', notes: '', fills: [mixed('fa', at('08:00'), [])] });
    expect(s.totals[0]!.kcal).toBeNull();
    expect(s.issues).toContain('A fill in fa has no food chosen');
    expect(sitterText(d, { id: 'p', name: 'P', notes: '', fills: [mixed('fa', at('08:00'), [])] }, 1)).toContain('fa (Alpha): no food chosen, leave it down');
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

  it('a grazer has food until it is picked up', () => {
    const d = fixture();
    const plan = {
      id: 'p', name: 'P', notes: '',
      fills: [fill('fb', at('08:00'), 'kib', 0.25, '14:00'), fill('fb', at('18:00'), 'kib', 0.25, '23:00')],
    };
    const g = longestGap(d, plan, 'b')!;
    expect(formatDuration(g.minutes)).toBe('9h'); // 23:00 → 08:00; 14:00 → 18:00 is 4h
  });

  it('handles pick-ups after midnight', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [fill('fb', at('20:00'), 'kib', 0.25, '06:00'), fill('fb', at('12:00'), 'kib', 0.25, '13:00')] };
    const g = longestGap(d, plan, 'b')!;
    expect(g.minutes).toBe(7 * 60); // 13:00 → 20:00; 06:00 → 12:00 is only 6h
    expect(fromMin(g.from)).toBe('13:00');
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

  it('left-down food lasts until the next fill for a grazer, but not for a one-go eater', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [fill('fa', at('08:00'), 'kib', 0.5), fill('fb', at('08:00'), 'kib', 0.5), fill('fb', at('20:00'), 'kib', 0.5)] };
    expect(longestGap(d, plan, 'b')!.minutes).toBe(0);
    expect(longestGap(d, plan, 'a')!.minutes).toBe(24 * 60);
    d.cats[0]!.eats = null; // not said: treated as grazing
    expect(longestGap(d, plan, 'a')!.minutes).toBe(0);
  });

  it('counts shared-feeder fills as a moment even for a grazer', () => {
    const d = fixture();
    const plan = { id: 'p', name: 'P', notes: '', fills: [fill('auto', at('09:00')), fill('auto', at('21:00'))] };
    expect(longestGap(d, plan, 'b')!.minutes).toBe(12 * 60);
  });

  it('flags wet food left down where a grazer can get at it', () => {
    const d = fixture();
    const plan = {
      id: 'p', name: 'P', notes: '',
      fills: [
        fill('fa', at('08:00'), 'tin', 0.5), // Alpha eats in one go: fine
        fill('fb', at('08:00'), 'tin', 0.5, '10:00'), // picked up after 2h: fine
        fill('fb', at('08:00'), 'tin', 0.5, '18:00'), // 10h
        fill('fb', { kind: 'window', from: '00:00', to: '24:00' }, 'tin', 0.5), // never picked up
        fill('fb', at('08:00'), 'kib', 0.5), // dry: fine
      ],
    };
    expect(wetSittingOut(d, summarisePlan(d, plan).fills).map((x) => x.minutes)).toEqual([600, null]);
    d.cats[0]!.eats = 'grazes';
    expect(wetSittingOut(d, summarisePlan(d, plan).fills).map((x) => x.minutes)).toEqual([null, 600, null]);
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
        fill('fa', win, 'kib', 0.25),
        fill('fb', win, 'kib', 0.375),
        fill('fb', at('18:00'), 'tin', 0.5, '19:00'),
        fill('auto', at('09:00')),
        fill('auto', at('21:00')),
      ],
    };
    const text = sitterText(d, plan, 3);
    expect(text).toContain('Away · 3 days');
    expect(text).toContain('fa: microchip-locked: only opens for Alpha');
    expect(text).toContain('Once a day, any time');
    expect(text).toContain('fa (Alpha): ½ can Tin, leave it down');
    expect(text).toContain('fb (Bravo): ⅜ cup · 1½ scoops Kibble, leave it down');
    expect(text).toContain('At 18:00\n  • fb (Bravo): ½ can Tin, pick up what’s left at 19:00');
    expect(text).toContain('AUTO: NO ACTION NEEDED');
    expect(text).toContain('at 09:00, 21:00');
    expect(text).toContain('lasts about 16 days, so it only needs filling before the trip');
    expect(text).toContain('Tin: 3 cans');
    expect(text).toContain('Water bowl in the hall.');
    expect(text.match(/Once a day/g)).toHaveLength(1);
  });
});
