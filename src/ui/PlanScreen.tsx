import { useState } from 'preact/hooks';
import { attributionFor, describeItems, summarisePlan, type PlanSummary, type ResolvedFill } from '../model/calc';
import { feedingsPerDay, hopperRunway, longestGap, wetSittingOut, WET_MAX_MINUTES } from '../model/checks';
import { formatDuration, formatFillTime, fromMin, startMin } from '../model/time';
import type { AppData, Fill, Plan } from '../model/types';
import { formatAmount, formatQty } from '../model/units';
import { CatBar } from './CatBars';
import { TextField } from './fields';
import { blankFill, FillEditor } from './FillEditor';
import { duplicatePlan } from './PlansScreen';
import { navigate } from './router';
import { useStore } from './state';

/** A gap longer than this is highlighted. */
const LONG_GAP_MINUTES = 12 * 60;

export function PlanScreen({ id }: { id: string }) {
  const { data, update } = useStore();
  const plan = data.plans.find((p) => p.id === id);
  const [editing, setEditing] = useState<{ fill: Fill; isNew: boolean } | null>(null);

  if (!plan) {
    return (
      <div class="screen">
        <p class="empty">
          That plan doesn’t exist any more. <a href="#/">Back to plans</a>
        </p>
      </div>
    );
  }

  const s = summarisePlan(data, plan);
  const setPlan = (fn: (p: Plan) => void) =>
    update((d) => {
      fn(d.plans.find((p) => p.id === id)!);
    });

  const saveFill = (fill: Fill) => {
    setPlan((p) => {
      const i = p.fills.findIndex((f) => f.id === fill.id);
      if (i >= 0) p.fills[i] = fill;
      else p.fills.push(fill);
    });
    setEditing(null);
  };

  return (
    <div class="screen">
      <a class="back" href="#/">
        ‹ Plans
      </a>
      <div class="plan-title">
        <TextField value={plan.name} onCommit={(name) => setPlan((p) => (p.name = name))} label="Plan name" placeholder="Plan name" />
      </div>
      <div class="button-row">
        <a class="btn" href={`#/plan/${plan.id}/sitter`}>
          Sitter sheet
        </a>
        <button
          class="btn"
          onClick={() => {
            const copy = duplicatePlan(data, plan);
            update((d) => {
              d.plans.splice(d.plans.findIndex((p) => p.id === plan.id) + 1, 0, copy);
            });
            navigate({ name: 'plan', id: copy.id });
          }}
        >
          Duplicate
        </button>
        <button
          class="btn danger"
          onClick={() => {
            if (confirm(`Delete plan “${plan.name}”?`)) {
              update((d) => {
                d.plans = d.plans.filter((p) => p.id !== id);
              });
              navigate({ name: 'plans' });
            }
          }}
        >
          Delete
        </button>
      </div>

      <section class="card">
        <h2>Daily calories</h2>
        {data.cats.length === 0 && <p class="empty">Add cats in Setup to see totals.</p>}
        <div class="bars">
          {s.totals.map((t) => (
            <CatBar total={t} />
          ))}
        </div>
        {s.sharedFeeders.map((f) => {
          const a = attributionFor(f);
          return (
            <p class="estimate small">
              <strong>Estimate:</strong> {f.name} is shared, so its food is split{' '}
              {f.catIds
                .map((cid) => `${data.cats.find((c) => c.id === cid)?.name ?? '?'} ${Math.round((a[cid] ?? 0) * 100)}%`)
                .join(' / ')}
              {Object.keys(f.share).length === 0 && ' (the default even split)'}. <a href="#/setup/feeders">Change</a>
            </p>
          );
        })}
        {s.issues.length > 0 && <NeedsSetup issues={s.issues} />}
      </section>

      <Checks data={data} plan={plan} summary={s} />

      <section class="card">
        <div class="section-head">
          <h2>Day</h2>
          <button
            class="btn primary small"
            disabled={data.feeders.length === 0}
            onClick={() => setEditing({ fill: blankFill(data), isNew: true })}
          >
            + Add fill
          </button>
        </div>
        {data.feeders.length === 0 && (
          <p class="empty">
            Add feeders in <a href="#/setup/feeders">Setup</a> first.
          </p>
        )}
        {plan.fills.length === 0 && data.feeders.length > 0 && <p class="empty">No fills yet.</p>}
        <Timeline data={data} fills={s.fills} onEdit={(fill) => setEditing({ fill, isNew: false })} />
      </section>

      <section class="card">
        <h2>Notes</h2>
        <p class="muted small">Printed at the end of the sitter sheet.</p>
        <TextField
          multiline
          value={plan.notes}
          onCommit={(notes) => setPlan((p) => (p.notes = notes))}
          placeholder="e.g. where the food is kept, vet’s number…"
          label="Plan notes"
        />
      </section>

      {editing && (
        <FillEditor
          data={data}
          initial={editing.fill}
          isNew={editing.isNew}
          onSave={saveFill}
          onCancel={() => setEditing(null)}
          onDelete={() => {
            setPlan((p) => {
              p.fills = p.fills.filter((f) => f.id !== editing.fill.id);
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function NeedsSetup({ issues }: { issues: string[] }) {
  return (
    <div class="needs-setup">
      <strong>Needs setup.</strong> These totals are incomplete until you fill in:
      <ul>
        {issues.map((i) => (
          <li>{i}</li>
        ))}
      </ul>
      <a href="#/setup">Go to Setup</a>
    </div>
  );
}

function Checks({ data, plan, summary }: { data: AppData; plan: Plan; summary: PlanSummary }) {
  const wet = wetSittingOut(summary.fills);
  const runways = hopperRunway(data, plan);
  if (data.cats.length === 0 && runways.length === 0) return null;

  return (
    <section class="card">
      <h2>Checks</h2>
      <ul class="checks-list">
        {data.cats.map((c) => {
          const n = feedingsPerDay(data, plan, c.id);
          const gap = longestGap(data, plan, c.id);
          const long = gap !== null && gap.minutes > LONG_GAP_MINUTES;
          return (
            <li class={long || n === 0 ? 'warn' : ''}>
              <span class="dot" style={{ background: c.color }} />
              <strong>{c.name}:</strong> {n} {n === 1 ? 'feeding' : 'feedings'} a day
              {gap === null
                ? ''
                : gap.minutes === 0
                  ? ', food down all day'
                  : `, longest gap ${formatDuration(gap.minutes)} (${fromMin(gap.from)}–${fromMin(gap.to)}${gap.worstCase ? ', worst case' : ''})`}
            </li>
          );
        })}
        {wet.map((w) => (
          <li class="warn">
            Wet food: {w.qty !== null ? formatAmount('wet', w.qty) : '?'} {w.food.name} in {w.feeder.name}{' '}
            {w.minutes === null
              ? 'is left down with no pick-up time'
              : `sits out for ${formatDuration(w.minutes)}`}
            . Wet food shouldn’t stay down more than {formatDuration(WET_MAX_MINUTES)}.
          </li>
        ))}
        {runways.map((r) => (
          <li>
            {r.feeder.name}: {r.dispensesPerDay} {r.dispensesPerDay === 1 ? 'dispense' : 'dispenses'} a day
            {r.cupsPerDay !== null && `, ${formatAmount('dry', r.cupsPerDay).split(' · ')[0]} a day`}
            {r.days !== null
              ? `. A full hopper lasts ${formatQty(Math.floor(r.days * 10) / 10)} days.`
              : r.feeder.hopperCups === null
                ? '. Set the hopper size in Setup to see how long it lasts.'
                : '.'}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Timeline({ data, fills, onEdit }: { data: AppData; fills: ResolvedFill[]; onEdit: (f: Fill) => void }) {
  const sorted = [...fills].sort((a, b) => startMin(a.fill.time) - startMin(b.fill.time));
  return (
    <ol class="timeline">
      {sorted.map((rf) => {
        const cats = (rf.feeder?.catIds ?? []).map((id) => data.cats.find((c) => c.id === id)).filter((c) => !!c);
        const g = rf.fill.graze;
        return (
          <li>
            <button class={`tl-row ${rf.manual ? 'manual' : 'auto'}`} onClick={() => onEdit(rf.fill)}>
              <span class="tl-time">
                {formatFillTime(rf.fill.time)}
                {g.kind === 'until' && <span class="tl-graze">→ {g.until}</span>}
                {g.kind === 'open' && <span class="tl-graze">→ left down</span>}
              </span>
              <span class="tl-body">
                <span class="tl-feeder">
                  {rf.feeder?.name ?? 'Missing feeder'}
                  <span class="tl-cats">
                    {cats.map((c) => (
                      <span class="dot" style={{ background: c!.color }} title={c!.name} />
                    ))}
                  </span>
                </span>
                <span class="tl-food">
                  {rf.items.length ? describeItems(rf.items) : '?'}
                </span>
                {rf.fill.note && <span class="tl-note">{rf.fill.note}</span>}
              </span>
              <span class="tl-side">
                <span class={`badge ${rf.manual ? 'manual' : 'auto'}`}>{rf.manual ? 'Manual' : 'Auto'}</span>
                <span class="tl-kcal">{rf.kcal === null ? '? kcal' : `${Math.round(rf.kcal)} kcal`}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
