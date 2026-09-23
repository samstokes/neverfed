import { useEffect, useRef, useState } from 'preact/hooks';
import { attributionFor } from '../model/calc';
import { setupSteps } from '../model/setup';
import { newId, type AppData, type Cat, type Feeder, type Food, type FoodForm } from '../model/types';
import { formatAmount } from '../model/units';
import { ImportError, migrate } from '../store/migrate';
import { NumberField, Segmented, TextField } from './fields';
import { useStore } from './state';

export const CAT_COLORS = ['#d9822b', '#3b82c4', '#8a5cc2', '#2f9e6e', '#c2476b', '#7a7a2e'];

export function SetupScreen({ section }: { section?: string }) {
  useEffect(() => {
    if (section) document.getElementById(`setup-${section}`)?.scrollIntoView({ behavior: 'smooth' });
  }, [section]);
  return (
    <div class="screen">
      <h1>Setup</h1>
      <p class="muted">
        Everything the calculations use. Nothing is pre-filled: numbers you haven’t entered show as <em>not set</em>{' '}
        rather than zero.
      </p>
      <Checklist />
      <CatsSection />
      <FoodsSection />
      <FeedersSection />
      <DataSection />
    </div>
  );
}

export function Checklist({ compact }: { compact?: boolean }) {
  const { data } = useStore();
  const steps = setupSteps(data);
  const remaining = steps.filter((s) => !s.done && !s.optional);
  if (compact && remaining.length === 0) return null;
  return (
    <section class="card checklist">
      <h2>{remaining.length ? 'Getting started' : 'Setup complete'}</h2>
      <ol>
        {steps.map((s) => (
          <li class={s.done ? 'done' : ''}>
            <span class="tick" aria-hidden="true">{s.done ? '✓' : s.optional ? '○' : '•'}</span>
            <a href={s.section === 'plans' ? '#/' : `#/setup/${s.section}`}>{s.label}</a>
            {s.optional && <span class="muted small"> (optional)</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Section(props: { id: string; title: string; onAdd: () => void; addLabel: string; children: any; hint?: string }) {
  return (
    <section class="setup-section" id={`setup-${props.id}`}>
      <div class="section-head">
        <h2>{props.title}</h2>
        <button class="btn small" onClick={props.onAdd}>
          + {props.addLabel}
        </button>
      </div>
      {props.hint && <p class="muted small">{props.hint}</p>}
      {props.children}
    </section>
  );
}

function RemoveButton({ what, onRemove, blocker }: { what: string; onRemove: () => void; blocker?: string }) {
  return (
    <button
      class="btn danger small"
      onClick={() => {
        if (blocker) {
          alert(blocker);
          return;
        }
        if (confirm(`Delete ${what}?`)) onRemove();
      }}
    >
      Delete
    </button>
  );
}

// — Cats —

function CatsSection() {
  const { data, update } = useStore();
  const [focus, setFocus] = useState<string | null>(null);
  const add = () => {
    const id = newId();
    update((d) => {
      d.cats.push({ id, name: '', dailyKcal: null, color: CAT_COLORS[d.cats.length % CAT_COLORS.length]! });
    });
    setFocus(id);
  };
  return (
    <Section id="cats" title="Cats" onAdd={add} addLabel="Cat">
      {data.cats.length === 0 && <p class="empty">No cats yet.</p>}
      {data.cats.map((c) => (
        <CatEditor cat={c} autoFocus={c.id === focus} />
      ))}
    </Section>
  );
}

function usedBy(data: AppData, pred: (f: AppData['plans'][number]['fills'][number]) => boolean): string[] {
  return data.plans.filter((p) => p.fills.some(pred)).map((p) => p.name || 'Untitled');
}

function CatEditor({ cat, autoFocus }: { cat: Cat; autoFocus: boolean }) {
  const { update } = useStore();
  const set = (patch: Partial<Cat>) =>
    update((d) => {
      Object.assign(d.cats.find((c) => c.id === cat.id)!, patch);
    });
  return (
    <div class="card editor" style={{ borderLeftColor: cat.color }}>
      <label>
        Name
        <TextField value={cat.name} onCommit={(name) => set({ name })} placeholder="Cat’s name" autoFocus={autoFocus} />
      </label>
      <label>
        Daily target
        <NumberField value={cat.dailyKcal} onCommit={(dailyKcal) => set({ dailyKcal })} suffix="kcal/day" />
      </label>
      <div class="field">
        <span>Colour</span>
        <div class="swatches">
          {CAT_COLORS.map((col) => (
            <button
              type="button"
              class={`swatch ${col === cat.color ? 'on' : ''}`}
              style={{ background: col }}
              aria-label={`Colour ${col}`}
              onClick={() => set({ color: col })}
            />
          ))}
        </div>
      </div>
      <div class="editor-actions">
        <RemoveButton
          what={cat.name || 'this cat'}
          onRemove={() =>
            update((d) => {
              d.cats = d.cats.filter((c) => c.id !== cat.id);
              for (const f of d.feeders) {
                f.catIds = f.catIds.filter((id) => id !== cat.id);
                delete f.share[cat.id];
              }
            })
          }
        />
      </div>
    </div>
  );
}

// — Foods —

function FoodsSection() {
  const { data, update } = useStore();
  const [focus, setFocus] = useState<string | null>(null);
  const add = () => {
    const id = newId();
    update((d) => {
      d.foods.push({ id, name: '', form: 'dry', kcalPerUnit: null, notes: '' });
    });
    setFocus(id);
  };
  return (
    <Section
      id="foods"
      title="Foods"
      onAdd={add}
      addLabel="Food"
      hint="Calorie density is per cup for dry food and per can for wet. It’s usually printed as “ME” (metabolisable energy) on the bag or tin."
    >
      {data.foods.length === 0 && <p class="empty">No foods yet.</p>}
      {data.foods.map((f) => (
        <FoodEditor food={f} autoFocus={f.id === focus} />
      ))}
    </Section>
  );
}

function FoodEditor({ food, autoFocus }: { food: Food; autoFocus: boolean }) {
  const { data, update } = useStore();
  const set = (patch: Partial<Food>) =>
    update((d) => {
      Object.assign(d.foods.find((f) => f.id === food.id)!, patch);
    });
  const plans = usedBy(data, (fill) => fill.foodId === food.id);
  const loadedIn = data.feeders.filter((f) => f.loadedFoodId === food.id).map((f) => f.name);
  const blockers = [...plans.map((p) => `plan “${p}”`), ...loadedIn.map((f) => `feeder “${f}”`)];
  return (
    <div class="card editor">
      <label>
        Name
        <TextField value={food.name} onCommit={(name) => set({ name })} placeholder="e.g. brand and flavour" autoFocus={autoFocus} />
      </label>
      <div class="field">
        <span>Type</span>
        <Segmented<FoodForm>
          label="Food type"
          value={food.form}
          options={[
            { value: 'dry', label: 'Dry' },
            { value: 'wet', label: 'Wet' },
          ]}
          onChange={(form) => set({ form })}
        />
      </div>
      <label>
        Calorie density
        <NumberField
          value={food.kcalPerUnit}
          onCommit={(kcalPerUnit) => set({ kcalPerUnit })}
          suffix={food.form === 'dry' ? 'kcal/cup' : 'kcal/can'}
        />
      </label>
      <label>
        Notes
        <TextField value={food.notes} onCommit={(notes) => set({ notes })} placeholder="optional" />
      </label>
      <div class="editor-actions">
        <RemoveButton
          what={food.name || 'this food'}
          blocker={blockers.length ? `This food is still used by ${blockers.join(', ')}. Change those first.` : undefined}
          onRemove={() =>
            update((d) => {
              d.foods = d.foods.filter((f) => f.id !== food.id);
            })
          }
        />
      </div>
    </div>
  );
}

// — Feeders —

function FeedersSection() {
  const { data, update } = useStore();
  const [focus, setFocus] = useState<string | null>(null);
  const add = () => {
    const id = newId();
    update((d) => {
      d.feeders.push({
        id,
        name: '',
        kind: 'microchip',
        catIds: [],
        accepts: ['dry', 'wet'],
        loadedFoodId: null,
        portion: null,
        hopperCups: null,
        share: {},
      });
    });
    setFocus(id);
  };
  return (
    <Section
      id="feeders"
      title="Feeders"
      onAdd={add}
      addLabel="Feeder"
      hint="Manual feeders are filled by hand; they’re what go on the sitter sheet. Auto feeders dispense on a schedule: set their food and portion here, and just the times in each plan."
    >
      {data.feeders.length === 0 && <p class="empty">No feeders yet.</p>}
      {data.feeders.map((f) => (
        <FeederEditor feeder={f} autoFocus={f.id === focus} />
      ))}
    </Section>
  );
}

function FeederEditor({ feeder, autoFocus }: { feeder: Feeder; autoFocus: boolean }) {
  const { data, update } = useStore();
  const set = (fn: (f: Feeder) => void) =>
    update((d) => {
      fn(d.feeders.find((f) => f.id === feeder.id)!);
    });
  const auto = feeder.kind === 'auto';
  const dryFoods = data.foods.filter((f) => f.form === 'dry');
  const loaded = data.foods.find((f) => f.id === feeder.loadedFoodId);
  const plans = usedBy(data, (fill) => fill.feederId === feeder.id);

  return (
    <div class="card editor">
      <label>
        Name
        <TextField
          value={feeder.name}
          onCommit={(name) => set((f) => (f.name = name))}
          placeholder="e.g. “Kitchen auto feeder”"
          autoFocus={autoFocus}
        />
      </label>
      <div class="field">
        <span>Kind</span>
        <Segmented
          label="Feeder kind"
          value={feeder.kind}
          options={[
            { value: 'microchip', label: 'Manual (microchip)' },
            { value: 'auto', label: 'Automatic' },
          ]}
          onChange={(kind) =>
            set((f) => {
              f.kind = kind;
              if (kind === 'auto') f.accepts = ['dry'];
            })
          }
        />
      </div>
      <div class="field">
        <span>Cats that can use it</span>
        <div class="checks">
          {data.cats.length === 0 && <span class="muted small">Add cats first.</span>}
          {data.cats.map((c) => (
            <label class="check">
              <input
                type="checkbox"
                checked={feeder.catIds.includes(c.id)}
                onChange={(e) =>
                  set((f) => {
                    const on = (e.target as HTMLInputElement).checked;
                    f.catIds = on ? [...f.catIds, c.id] : f.catIds.filter((id) => id !== c.id);
                    if (!on) delete f.share[c.id];
                  })
                }
              />
              <span class="dot" style={{ background: c.color }} />
              {c.name || 'Unnamed'}
            </label>
          ))}
        </div>
      </div>
      {!auto && (
        <div class="field">
          <span>Accepts</span>
          <div class="checks">
            {(['dry', 'wet'] as const).map((form) => (
              <label class="check">
                <input
                  type="checkbox"
                  checked={feeder.accepts.includes(form)}
                  onChange={(e) =>
                    set((f) => {
                      const on = (e.target as HTMLInputElement).checked;
                      f.accepts = on ? [...new Set([...f.accepts, form])] : f.accepts.filter((x) => x !== form);
                    })
                  }
                />
                {form === 'dry' ? 'Dry' : 'Wet'}
              </label>
            ))}
          </div>
        </div>
      )}
      {auto && (
        <>
          <label>
            Loaded food
            <select
              value={feeder.loadedFoodId ?? ''}
              onChange={(e) => set((f) => (f.loadedFoodId = (e.target as HTMLSelectElement).value || null))}
            >
              <option value="">— not set —</option>
              {dryFoods.map((f) => (
                <option value={f.id}>{f.name || 'Unnamed'}</option>
              ))}
            </select>
          </label>
          <label>
            Portion per dispense
            <NumberField value={feeder.portion} onCommit={(v) => set((f) => (f.portion = v))} suffix="cups" />
          </label>
          {feeder.portion !== null && <div class="muted small">{formatAmount('dry', feeder.portion)}</div>}
          <label>
            Hopper capacity
            <NumberField
              value={feeder.hopperCups}
              onCommit={(v) => set((f) => (f.hopperCups = v))}
              suffix="cups"
              placeholder="optional"
            />
          </label>
          {loaded && loaded.kcalPerUnit !== null && feeder.portion !== null && (
            <div class="muted small">≈ {Math.round(loaded.kcalPerUnit * feeder.portion)} kcal per dispense</div>
          )}
        </>
      )}
      {feeder.catIds.length > 1 && <ShareEditor feeder={feeder} />}
      <div class="editor-actions">
        <RemoveButton
          what={feeder.name || 'this feeder'}
          blocker={plans.length ? `This feeder is used in ${plans.map((p) => `“${p}”`).join(', ')}. Remove those fills first.` : undefined}
          onRemove={() =>
            update((d) => {
              d.feeders = d.feeders.filter((f) => f.id !== feeder.id);
            })
          }
        />
      </div>
    </div>
  );
}

/** How a shared feeder's calories are credited. A slider for two cats, percentages for more. */
function ShareEditor({ feeder }: { feeder: Feeder }) {
  const { data, update } = useStore();
  const cats = feeder.catIds.map((id) => data.cats.find((c) => c.id === id)).filter((c): c is Cat => !!c);
  const attr = attributionFor(feeder);
  const setShare = (share: Record<string, number>) =>
    update((d) => {
      d.feeders.find((f) => f.id === feeder.id)!.share = share;
    });
  const isDefault = Object.keys(feeder.share).length === 0;

  return (
    <div class="field share">
      <span>Who eats what from it?</span>
      <p class="muted small">
        An estimate: there’s no way to know the real split without weighing. Each cat’s totals are only as good as
        this.{isDefault && ' Currently the default, an even split.'}
      </p>
      {cats.length === 2 ? (
        <TwoCatSlider
          a={cats[0]!}
          b={cats[1]!}
          valueA={attr[cats[0]!.id] ?? 0.5}
          onChange={(pa) => setShare({ [cats[0]!.id]: pa, [cats[1]!.id]: 1 - pa })}
        />
      ) : (
        cats.map((c) => (
          <label>
            <span>
              <span class="dot" style={{ background: c.color }} /> {c.name}
            </span>
            <NumberField
              value={Math.round((attr[c.id] ?? 0) * 100)}
              suffix="%"
              onCommit={(v) => {
                const next: Record<string, number> = {};
                for (const x of cats) next[x.id] = Math.round((attr[x.id] ?? 0) * 100);
                next[c.id] = v ?? 0;
                setShare(next);
              }}
            />
          </label>
        ))
      )}
    </div>
  );
}

function TwoCatSlider(props: { a: Cat; b: Cat; valueA: number; onChange: (a: number) => void }) {
  const pct = Math.round(props.valueA * 100);
  const [live, setLive] = useState(pct);
  useEffect(() => setLive(pct), [pct]);
  return (
    <div class="slider">
      <div class="slider-labels">
        <span style={{ color: props.a.color }}>
          {props.a.name} {live}%
        </span>
        <span style={{ color: props.b.color }}>
          {100 - live}% {props.b.name}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={live}
        aria-label={`Share going to ${props.a.name}`}
        style={{ '--a': props.a.color, '--b': props.b.color, '--pct': `${live}%` } as any}
        onInput={(e) => setLive(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => props.onChange(Number((e.target as HTMLInputElement).value) / 100)}
      />
    </div>
  );
}

// — Data —

function DataSection() {
  const { data, replace } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neverfed-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const next = migrate(JSON.parse(await file.text()));
      const summary = `${next.cats.length} cats, ${next.foods.length} foods, ${next.feeders.length} feeders, ${next.plans.length} plans`;
      if (confirm(`Replace everything in this app with the backup (${summary})?`)) {
        replace(next);
        setMsg(`Imported ${summary}.`);
      }
    } catch (e) {
      setMsg(e instanceof ImportError ? e.message : `Couldn’t read that file: ${(e as Error).message}`);
    }
  };

  return (
    <section class="setup-section" id="setup-data">
      <h2>Data</h2>
      <p class="muted small">
        Everything is stored only in this browser. Export a backup now and then: it’s how your data survives
        clearing site data or moving to a new phone.
      </p>
      <div class="button-row">
        <button class="btn" onClick={exportJson}>
          Export backup
        </button>
        <button class="btn" onClick={() => fileRef.current?.click()}>
          Import backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) void importJson(f);
            (e.target as HTMLInputElement).value = '';
          }}
        />
      </div>
      {msg && <p class="small">{msg}</p>}
    </section>
  );
}
