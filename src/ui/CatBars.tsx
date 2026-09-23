import type { CatTotal } from '../model/calc';

// The bar's full width is this multiple of the target, so the target marker sits at 1/SCALE.
const SCALE = 1.25;

const STATUS_LABEL = { under: 'Under', on: 'On target', over: 'Over', unknown: '' } as const;

export function CatBars({ totals }: { totals: CatTotal[] }) {
  return (
    <div class="bars">
      {totals.map((t) => (
        <CatBar total={t} />
      ))}
    </div>
  );
}

export function CatBar({ total: t }: { total: CatTotal }) {
  const target = t.cat.dailyKcal;
  const shown = t.kcal ?? t.knownKcal;
  const width = target ? Math.min(100, (shown / (target * SCALE)) * 100) : 0;
  const pct = t.ratio !== null ? Math.round(t.ratio * 100) : null;

  let figure: string;
  if (t.kcal === null) figure = `≥ ${Math.round(t.knownKcal)} kcal · incomplete`;
  else if (target === null) figure = `${Math.round(t.kcal)} kcal · no target`;
  else figure = `${Math.round(t.kcal)} / ${Math.round(target)} kcal`;

  return (
    <div class={`bar-row status-${t.status}`}>
      <div class="bar-head">
        <span class="cat-name">
          <span class="dot" style={{ background: t.cat.color }} />
          {t.cat.name || 'Unnamed'}
        </span>
        <span class="bar-figure">{figure}</span>
        {pct !== null && (
          <span class={`status-chip ${t.status}`}>
            {pct}% · {STATUS_LABEL[t.status]}
          </span>
        )}
      </div>
      <div
        class="bar"
        role="meter"
        aria-label={`${t.cat.name}: ${figure}`}
        aria-valuemin={0}
        aria-valuemax={target ? target * SCALE : 0}
        aria-valuenow={shown}
      >
        <div
          class={`bar-fill ${t.kcal === null ? 'incomplete' : ''}`}
          style={{ width: `${width}%`, background: t.cat.color }}
        />
        {target !== null && <div class="bar-target" style={{ left: `${100 / SCALE}%` }} title="Target" />}
      </div>
    </div>
  );
}
