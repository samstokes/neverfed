import { describeItems, summarisePlan, type ResolvedFill } from './calc';
import { foodForTrip, hopperRunway } from './checks';
import { formatFillTime, isAllDay, startMin, timeKey } from './time';
import type { AppData, Plan } from './types';
import { formatAmount, formatQty } from './units';

export interface SitterGroup {
  label: string;
  fills: ResolvedFill[];
}

/** Manual fills grouped by time of day (or visit window), in order. */
export function manualGroups(fills: ResolvedFill[]): SitterGroup[] {
  const groups = new Map<string, SitterGroup>();
  const manual = fills.filter((rf) => rf.manual).sort((a, b) => startMin(a.fill.time) - startMin(b.fill.time));
  for (const rf of manual) {
    const key = timeKey(rf.fill.time);
    let g = groups.get(key);
    if (!g) {
      const t = rf.fill.time;
      const label =
        t.kind === 'at' ? `At ${t.at}` : isAllDay(t) ? 'Once a day, any time' : `Once, any time ${t.from}–${t.to}`;
      g = { label, fills: [] };
      groups.set(key, g);
    }
    g.fills.push(rf);
  }
  return [...groups.values()];
}

export function pickUpInstruction(rf: ResolvedFill): string {
  const at = rf.fill.pickUpAt;
  return at !== null && rf.fill.time.kind === 'at' ? `pick up what’s left at ${at}` : 'leave it down';
}

function catNames(data: AppData, ids: string[]): string {
  const names = ids.map((id) => data.cats.find((c) => c.id === id)?.name ?? '?');
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function days(n: number): string {
  return `${formatQty(n)} ${n === 1 ? 'day' : 'days'}`;
}

/** Plain-text instructions for a cat sitter: the manual fills, plus what to leave out. */
export function sitterText(data: AppData, plan: Plan, daysAway: number): string {
  const summary = summarisePlan(data, plan);
  const lines: string[] = [];
  const hr = '';

  lines.push(`CAT FEEDING INSTRUCTIONS`);
  lines.push(`${plan.name} · ${days(daysAway)}`);
  lines.push(hr);

  // Feeders
  const usedFeederIds = new Set(plan.fills.map((f) => f.feederId));
  const feeders = data.feeders.filter((f) => usedFeederIds.has(f.id));
  if (feeders.length) {
    lines.push('FEEDERS');
    for (const f of feeders) {
      if (f.kind === 'microchip') {
        const who = catNames(data, f.catIds);
        const locked = f.catIds.length === 1 ? `microchip-locked: only opens for ${who}` : `microchip feeder for ${who}`;
        lines.push(`• ${f.name}: ${locked}`);
      } else {
        lines.push(`• ${f.name}: automatic, shared by ${catNames(data, f.catIds)}. Feeds itself, no action needed.`);
      }
    }
    lines.push(hr);
  }

  // Manual fills
  const groups = manualGroups(summary.fills);
  lines.push('EVERY DAY');
  if (groups.length === 0) {
    lines.push('Nothing to put out by hand.');
  }
  for (const g of groups) {
    lines.push(g.label);
    for (const rf of g.fills) {
      const feederName = rf.feeder?.name ?? '?';
      const who = rf.feeder ? catNames(data, rf.feeder.catIds) : '?';
      lines.push(`  • ${feederName} (${who}): ${describeItems(rf.items)}, ${pickUpInstruction(rf)}`);
      if (rf.fill.note.trim()) lines.push(`    ${rf.fill.note.trim()}`);
    }
  }
  lines.push(hr);

  // Auto feeders
  const runways = hopperRunway(data, plan);
  for (const r of runways) {
    const f = r.feeder;
    const food = data.foods.find((x) => x.id === f.loadedFoodId);
    const times = plan.fills
      .filter((x) => x.feederId === f.id)
      .map((x) => formatFillTime(x.time))
      .sort();
    lines.push(`${f.name.toUpperCase()}: NO ACTION NEEDED`);
    const portion = f.portion !== null && food ? `${formatAmount(food.form, f.portion)} ${food.name}` : 'a portion';
    lines.push(`Dispenses ${portion} at ${times.join(', ')}.`);
    if (r.days !== null) {
      const topUp =
        r.days >= daysAway
          ? `A full hopper lasts about ${days(Math.floor(r.days))}, so it only needs filling before the trip.`
          : `A full hopper lasts about ${days(Math.floor(r.days))}. Top it up${food ? ` with ${food.name}` : ''} at least every ${days(Math.max(1, Math.floor(r.days)))}.`;
      lines.push(topUp);
    } else {
      lines.push(`Check the hopper each visit and top it up${food ? ` with ${food.name}` : ''} if it’s low.`);
    }
    lines.push(hr);
  }

  // Food to leave out
  const needs = foodForTrip(summary.fills, daysAway);
  if (needs.length) {
    lines.push(`FOOD FOR ${days(daysAway).toUpperCase()}`);
    for (const n of needs) {
      let line = `• ${n.food.name}: ${formatAmount(n.food.form, n.total)}`;
      if (n.autoPerDay > 0 && n.manualPerDay > 0) {
        line += ` (${formatAmount(n.food.form, n.autoPerDay * daysAway)} of it goes through the auto feeder)`;
      } else if (n.autoPerDay > 0) {
        line += ' (all through the auto feeder)';
      }
      lines.push(line);
    }
    lines.push(hr);
  }

  if (plan.notes.trim()) {
    lines.push('NOTES');
    lines.push(plan.notes.trim());
    lines.push(hr);
  }

  return lines.join('\n').trim() + '\n';
}
