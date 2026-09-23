import { useState } from 'preact/hooks';
import { sitterText } from '../model/sitter';
import { useStore } from './state';

const DAYS_KEY = 'neverfed.sitterDays';

function initialDays(): number {
  try {
    const n = Number(localStorage.getItem(DAYS_KEY));
    return n > 0 ? n : 3;
  } catch {
    return 3;
  }
}

export function SitterScreen({ id }: { id: string }) {
  const { data } = useStore();
  const plan = data.plans.find((p) => p.id === id);
  const [days, setDays] = useState(initialDays);
  const [copied, setCopied] = useState(false);

  if (!plan) {
    return (
      <div class="screen">
        <p class="empty">
          That plan doesn’t exist any more. <a href="#/">Back to plans</a>
        </p>
      </div>
    );
  }

  const text = sitterText(data, plan, days);
  const filename = `cat-feeding-${(plan.name || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;

  const setDaysSaved = (n: number) => {
    setDays(n);
    try {
      localStorage.setItem(DAYS_KEY, String(n));
    } catch {
      // Just a convenience.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Couldn’t copy. Select the text and copy it by hand.');
    }
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const canShare = typeof navigator.share === 'function';

  return (
    <div class="screen sitter">
      <a class="back no-print" href={`#/plan/${plan.id}`}>
        ‹ {plan.name || 'Plan'}
      </a>
      <h1 class="no-print">Sitter sheet</h1>
      <div class="no-print sitter-controls">
        <label class="row">
          Days away
          <input
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={days}
            onInput={(e) => {
              const n = Math.round(Number((e.target as HTMLInputElement).value));
              if (n > 0) setDaysSaved(n);
            }}
          />
        </label>
        <div class="button-row">
          <button class="btn primary" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy text'}
          </button>
          {canShare && (
            <button class="btn" onClick={() => navigator.share({ title: `Cat feeding: ${plan.name}`, text }).catch(() => {})}>
              Share…
            </button>
          )}
          <button class="btn" onClick={download}>
            Save .txt
          </button>
          <button class="btn" onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
        <p class="muted small">Only manual fills need a person. Auto feeder times are listed so the sitter knows not to worry.</p>
      </div>
      <pre class="sitter-text">{text}</pre>
    </div>
  );
}
