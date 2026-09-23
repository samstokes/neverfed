import { useEffect, useRef, useState } from 'preact/hooks';
import type { FoodForm } from '../model/types';
import { AMOUNT_CHIPS, UNIT, formatAmount, formatQty, parseQty } from '../model/units';

/**
 * Runs fn when value changes, but not on mount. Effects run after paint, so a
 * mount-time sync could clobber a keystroke typed straight into a new field.
 */
function useOnChange<T>(value: T, fn: () => void) {
  const last = useRef(value);
  useEffect(() => {
    if (last.current !== value) {
      last.current = value;
      fn();
    }
  }, [value]);
}

/** A text input that commits on blur or Enter, so typing doesn't write on every keystroke. */
export function TextField(props: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  label?: string;
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  const [v, setV] = useState(props.value);
  useOnChange(props.value, () => setV(props.value));
  // The autofocus attribute only works on page load, so focus newly added fields by hand.
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (props.autoFocus) ref.current?.focus();
  }, []);
  // Read from the element, not state: blur can arrive before the last keystroke's re-render.
  const commit = (e: Event) => {
    const now = (e.target as HTMLInputElement).value;
    if (now !== props.value) props.onCommit(now);
  };
  const common = {
    value: v,
    placeholder: props.placeholder,
    'aria-label': props.label,
    ref,
    onInput: (e: Event) => setV((e.target as HTMLInputElement).value),
    onBlur: commit,
  };
  return props.multiline ? (
    <textarea rows={3} {...common} />
  ) : (
    <input type="text" {...common} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

/** A nullable number. Empty means "not entered yet", which is different from zero. */
export function NumberField(props: {
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder?: string;
  label?: string;
  suffix?: string;
  /** Commit on every valid keystroke rather than on blur (for forms with a Save button). */
  live?: boolean;
}) {
  const show = (n: number | null) => (n === null ? '' : formatQty(n));
  const [v, setV] = useState(show(props.value));
  useOnChange(props.value, () => {
    // Don't reformat what the user is typing ("1/" → "1") when a live commit echoes back.
    const typed = v.trim() === '' ? null : parseQty(v);
    if (typed === null || typed !== props.value) setV(show(props.value));
  });
  const commit = (e: Event) => {
    const text = (e.target as HTMLInputElement).value;
    const parsed = text.trim() === '' ? null : parseQty(text);
    if (parsed === null && text.trim() !== '') {
      setV(show(props.value));
      return;
    }
    if (parsed !== props.value) props.onCommit(parsed);
  };
  return (
    <span class="with-suffix">
      <input
        type="text"
        inputMode="decimal"
        value={v}
        placeholder={props.placeholder ?? 'not set'}
        aria-label={props.label}
        onInput={(e) => {
          const text = (e.target as HTMLInputElement).value;
          setV(text);
          if (props.live) {
            const parsed = text.trim() === '' ? null : parseQty(text);
            if ((parsed !== null || text.trim() === '') && parsed !== props.value) props.onCommit(parsed);
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {props.suffix && <span class="suffix">{props.suffix}</span>}
    </span>
  );
}

/** Amount entry: fraction chips plus a free field that takes "1/8", "0.125", "1½"… */
export function AmountField(props: { form: FoodForm; value: number | null; onChange: (v: number | null) => void }) {
  const unit = `${UNIT[props.form]}s`;
  return (
    <div class="amount">
      <div class="chips">
        {AMOUNT_CHIPS[props.form].map((q) => (
          <button
            type="button"
            class={`chip ${props.value !== null && Math.abs(props.value - q) < 1e-6 ? 'on' : ''}`}
            onClick={() => props.onChange(q)}
          >
            {formatQty(q)}
          </button>
        ))}
      </div>
      <label class="row">
        <NumberField live value={props.value} onCommit={props.onChange} suffix={unit} label={`Amount in ${unit}`} />
      </label>
      {props.value !== null && <div class="muted small">{formatAmount(props.form, props.value)}</div>}
    </div>
  );
}

export function Segmented<T extends string>(props: {
  /** null: nothing selected yet. */
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          class={props.value === o.value ? 'on' : ''}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
