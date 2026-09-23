import { summarisePlan } from '../model/calc';
import { newId, type AppData, type Plan } from '../model/types';
import { CatBars } from './CatBars';
import { navigate } from './router';
import { Checklist } from './SetupScreen';
import { useStore } from './state';

export function duplicatePlan(data: AppData, plan: Plan): Plan {
  const names = new Set(data.plans.map((p) => p.name));
  let name = `${plan.name} (copy)`;
  for (let i = 2; names.has(name); i++) name = `${plan.name} (copy ${i})`;
  return { ...structuredClone(plan), id: newId(), name, fills: plan.fills.map((f) => ({ ...structuredClone(f), id: newId() })) };
}

export function PlansScreen() {
  const { data, update } = useStore();

  const create = () => {
    const id = newId();
    update((d) => {
      d.plans.push({ id, name: `Plan ${d.plans.length + 1}`, notes: '', fills: [] });
    });
    navigate({ name: 'plan', id });
  };

  return (
    <div class="screen">
      <div class="section-head">
        <h1>Plans</h1>
        <button class="btn primary" onClick={create}>
          + New plan
        </button>
      </div>
      <Checklist compact />
      {data.plans.length === 0 ? (
        <p class="empty">
          No plans yet. A plan is one day’s feeding schedule. Make one per scenario (normal days, overnight away,
          cat-sitter), then compare them here.
        </p>
      ) : (
        data.plans.map((p) => <PlanCard plan={p} />)
      )}
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const { data, update } = useStore();
  const s = summarisePlan(data, plan);
  const manual = plan.fills.filter((f) => data.feeders.find((x) => x.id === f.feederId)?.kind !== 'auto').length;
  const auto = plan.fills.length - manual;

  return (
    <article class="card plan-card">
      <a class="plan-card-main" href={`#/plan/${plan.id}`}>
        <div class="plan-card-head">
          <h2>{plan.name || 'Untitled'}</h2>
          <span class="muted small">
            {manual} manual · {auto} auto
          </span>
        </div>
        {s.issues.length > 0 && (
          <div class="needs-setup small">
            Needs setup: {s.issues.length} {s.issues.length === 1 ? 'thing' : 'things'} missing
          </div>
        )}
        <CatBars totals={s.totals} />
        {s.sharedFeeders.length > 0 && (
          <div class="muted small">Includes an estimated split for shared feeders.</div>
        )}
      </a>
      <div class="card-actions">
        <button
          class="btn small"
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
        <a class="btn small" href={`#/plan/${plan.id}/sitter`}>
          Sitter sheet
        </a>
        <button
          class="btn small danger"
          onClick={() => {
            if (confirm(`Delete plan “${plan.name}”?`))
              update((d) => {
                d.plans = d.plans.filter((p) => p.id !== plan.id);
              });
          }}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
