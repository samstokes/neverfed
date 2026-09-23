import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { AppData } from '../model/types';
import { load, requestPersistence, save } from '../store/db';

interface Store {
  data: AppData;
  /** Apply a mutation to a copy of the data, then persist it. */
  update: (fn: (draft: AppData) => void) => void;
  replace: (data: AppData) => void;
  saveError: string | null;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export function StoreProvider({ children }: { children: ComponentChildren }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Writes are chained so they land in order.
  const pending = useRef<Promise<void>>(Promise.resolve());
  const current = useRef<AppData | null>(null);

  useEffect(() => {
    load()
      .then((d) => {
        current.current = d;
        setData(d);
        void requestPersistence();
      })
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  const commit = (next: AppData) => {
    current.current = next;
    setData(next);
    pending.current = pending.current
      .then(() => save(next))
      .then(() => setSaveError(null))
      .catch((e) => setSaveError(String(e?.message ?? e)));
  };

  if (loadError) {
    return (
      <div class="screen">
        <div class="card warn">
          <h2>Couldn’t open local storage</h2>
          <p>{loadError}</p>
          <p class="muted">Private browsing modes can block IndexedDB. Try a normal window.</p>
        </div>
      </div>
    );
  }
  if (!data) return <div class="screen muted">Loading…</div>;

  const store: Store = {
    data,
    update: (fn) => {
      const draft = structuredClone(current.current!);
      fn(draft);
      commit(draft);
    },
    replace: commit,
    saveError,
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
