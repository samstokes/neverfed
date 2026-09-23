import { useState } from 'preact/hooks';
import { fromMin, isValidTime, toMin } from '../model/time';
import { newId, type AppData, type Fill, type FillItem } from '../model/types';
import { formatAmount } from '../model/units';
import { AmountField, Segmented } from './fields';

const ALL_DAY = { from: '00:00', to: '24:00' };

export function blankFill(data: AppData): Fill {
  const feeder = data.feeders.find((f) => f.kind !== 'auto') ?? data.feeders[0];
  return {
    id: newId(),
    feederId: feeder?.id ?? '',
    time: { kind: 'at', at: '09:00' },
    items: [{ foodId: null, qty: null }],
    pickUpAt: null,
    note: '',
  };
}

export function FillEditor(props: {
  data: AppData;
  initial: Fill;
  isNew: boolean;
  onSave: (f: Fill) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { data } = props;
  const [f, setF] = useState<Fill>(props.initial);
  const set = (patch: Partial<Fill>) => setF((prev) => ({ ...prev, ...patch }));

  const feeder = data.feeders.find((x) => x.id === f.feederId);
  const auto = feeder?.kind === 'auto';
  const foods = data.foods.filter((x) => !feeder || feeder.accepts.includes(x.form));
  const setItem = (i: number, patch: Partial<FillItem>) =>
    setF((prev) => ({ ...prev, items: prev.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const loaded = auto ? data.foods.find((x) => x.id === feeder.loadedFoodId) : undefined;

  const errors: string[] = [];
  if (!feeder) errors.push('Choose a feeder.');
  if (f.time.kind === 'at' && !isValidTime(f.time.at)) errors.push('Enter a time.');
  if (f.time.kind === 'window' && (!isValidTime(f.time.from) || !isValidTime(f.time.to, true)))
    errors.push('Enter the window’s start and end.');
  if (!auto) {
    if (f.items.length === 0 || f.items.some((i) => !data.foods.some((x) => x.id === i.foodId))) errors.push('Choose a food.');
    if (f.items.some((i) => i.qty === null || i.qty <= 0)) errors.push('Enter an amount.');
    if (f.pickUpAt !== null && !isValidTime(f.pickUpAt)) errors.push('Enter when it’s picked up.');
  }

  const save = () => {
    if (errors.length) return;
    // Auto dispenses take food and amount from the feeder, at a set time.
    const out: Fill = auto
      ? { ...f, items: [], pickUpAt: null, time: f.time.kind === 'at' ? f.time : { kind: 'at', at: f.time.from } }
      : f;
    props.onSave(out);
  };

  const allDay = f.time.kind === 'window' && f.time.from === ALL_DAY.from && f.time.to === ALL_DAY.to;

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.isNew ? 'Add fill' : 'Edit fill'}>
        <h2>{props.isNew ? 'Add a fill' : 'Edit fill'}</h2>

        <label>
          Feeder
          <select
            value={f.feederId}
            onChange={(e) => {
              const id = (e.target as HTMLSelectElement).value;
              const next = data.feeders.find((x) => x.id === id);
              const patch: Partial<Fill> = { feederId: id };
              if (next?.kind === 'auto' && f.time.kind === 'window') patch.time = { kind: 'at', at: '09:00' };
              if (next && next.kind !== 'auto') {
                // Keep what the new feeder can take; always leave at least one row to fill in.
                const kept = f.items.map((it) => {
                  const food = data.foods.find((x) => x.id === it.foodId);
                  return food && !next.accepts.includes(food.form) ? { foodId: null, qty: null } : it;
                });
                patch.items = kept.length ? kept : [{ foodId: null, qty: null }];
              }
              set(patch);
            }}
          >
            {data.feeders.map((x) => (
              <option value={x.id}>
                {x.name || 'Unnamed'} {x.kind === 'auto' ? '(auto)' : '(manual)'}
              </option>
            ))}
          </select>
        </label>

        {!auto && (
          <div class="field">
            <span>When</span>
            <Segmented
              label="Timing"
              value={f.time.kind}
              options={[
                { value: 'at', label: 'At a set time' },
                { value: 'window', label: 'Sitter visit window' },
              ]}
              onChange={(kind) => {
                if (kind === f.time.kind) return;
                if (kind === 'window') {
                  set({ time: { kind: 'window', ...ALL_DAY }, pickUpAt: null });
                } else {
                  set({ time: { kind: 'at', at: f.time.kind === 'window' && f.time.from !== '00:00' ? f.time.from : '09:00' } });
                }
              }}
            />
            {f.time.kind === 'window' && (
              <p class="muted small">
                For fills a sitter does whenever they visit. The checks assume the worst case over the window.
              </p>
            )}
          </div>
        )}

        {f.time.kind === 'at' && (
          <label>
            {auto ? 'Dispense at' : 'Time'}
            <input type="time" value={f.time.at} onInput={(e) => set({ time: { kind: 'at', at: (e.target as HTMLInputElement).value } })} />
          </label>
        )}
        {f.time.kind === 'window' && (
          <div class="field">
            <label class="check">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) =>
                  set({ time: { kind: 'window', ...((e.target as HTMLInputElement).checked ? ALL_DAY : { from: '09:00', to: '18:00' }) } })
                }
              />
              Any time of day
            </label>
            {!allDay && f.time.kind === 'window' && (
              <div class="time-range">
                <input
                  type="time"
                  aria-label="Window start"
                  value={f.time.from}
                  onInput={(e) => set({ time: { kind: 'window', from: (e.target as HTMLInputElement).value, to: (f.time as { to: string }).to } })}
                />
                <span>to</span>
                <input
                  type="time"
                  aria-label="Window end"
                  value={f.time.to === '24:00' ? '23:59' : f.time.to}
                  onInput={(e) => set({ time: { kind: 'window', from: (f.time as { from: string }).from, to: (e.target as HTMLInputElement).value } })}
                />
              </div>
            )}
          </div>
        )}

        {auto && feeder && (
          <p class="muted">
            Dispenses {feeder.portion !== null && loaded ? `${formatAmount('dry', feeder.portion)} of ${loaded.name}` : 'its programmed portion'}. Food and
            portion are set on the feeder in Setup, so changing them updates every plan.
          </p>
        )}

        {!auto && (
          <>
            <div class="field">
              <span>{f.items.length > 1 ? 'Foods, put down together' : 'Food'}</span>
              {f.items.map((it, i) => {
                const food = data.foods.find((x) => x.id === it.foodId);
                return (
                  <div class="fill-item" key={i}>
                    <div class="fill-item-head">
                      <select
                        aria-label={`Food ${i + 1}`}
                        value={it.foodId ?? ''}
                        onChange={(e) => {
                          const next = data.foods.find((x) => x.id === (e.target as HTMLSelectElement).value);
                          // Cups and cans don't convert, so clearing the food or changing its form clears the amount.
                          const keepQty = next && food && next.form === food.form;
                          setItem(i, { foodId: next?.id ?? null, qty: keepQty ? it.qty : null });
                        }}
                      >
                        <option value="">— choose —</option>
                        {foods.map((x) => (
                          <option value={x.id}>
                            {x.name || 'Unnamed'} ({x.form})
                          </option>
                        ))}
                      </select>
                      {f.items.length > 1 && (
                        <button
                          type="button"
                          class="btn small danger"
                          aria-label={`Remove food ${i + 1}`}
                          onClick={() => set({ items: f.items.filter((_, j) => j !== i) })}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {food && <AmountField form={food.form} value={it.qty} onChange={(qty) => setItem(i, { qty })} />}
                  </div>
                );
              })}
              <button
                type="button"
                class="btn small add-food"
                onClick={() => set({ items: [...f.items, { foodId: null, qty: null }] })}
              >
                + Add another food
              </button>
            </div>
            {f.time.kind === 'at' && (
              <div class="field">
                <label class="check">
                  <input
                    type="checkbox"
                    checked={f.pickUpAt !== null}
                    onChange={(e) =>
                      set({
                        pickUpAt: (e.target as HTMLInputElement).checked
                          ? fromMin(toMin((f.time as { at: string }).at) + 4 * 60)
                          : null,
                      })
                    }
                  />
                  Someone picks up what’s left
                </label>
                {f.pickUpAt !== null && (
                  <input
                    type="time"
                    aria-label="Picked up at"
                    value={f.pickUpAt}
                    onInput={(e) => set({ pickUpAt: (e.target as HTMLInputElement).value })}
                  />
                )}
                <p class="muted small">
                  Otherwise the food stays down until it’s eaten.
                  {f.items.length > 1 && ' Applies to everything in this fill.'}
                </p>
              </div>
            )}
            <label>
              Note for the sitter sheet
              <input type="text" value={f.note} placeholder="optional" onInput={(e) => set({ note: (e.target as HTMLInputElement).value })} />
            </label>
          </>
        )}

        {errors.length > 0 && <p class="error small">{errors[0]}</p>}
        <div class="sheet-actions">
          {!props.isNew && (
            <button class="btn danger" onClick={props.onDelete}>
              Delete
            </button>
          )}
          <span class="spacer" />
          <button class="btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button class="btn primary" onClick={save} disabled={errors.length > 0}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
