import { PlanScreen } from './PlanScreen';
import { PlansScreen } from './PlansScreen';
import { useRoute } from './router';
import { SetupScreen } from './SetupScreen';
import { SitterScreen } from './SitterScreen';
import { StoreProvider, useStore } from './state';

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { saveError } = useStore();
  const tab = route.name === 'setup' ? 'setup' : 'plans';

  return (
    <>
      {saveError && <div class="banner error">Couldn’t save: {saveError}. Export a backup from Setup.</div>}
      <main>
        {route.name === 'plans' && <PlansScreen />}
        {route.name === 'plan' && <PlanScreen key={route.id} id={route.id} />}
        {route.name === 'sitter' && <SitterScreen key={route.id} id={route.id} />}
        {route.name === 'setup' && <SetupScreen section={route.section} />}
      </main>
      <nav class="tabbar no-print" aria-label="Main">
        <a href="#/" class={tab === 'plans' ? 'on' : ''} aria-current={tab === 'plans' ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16M4 12h16M4 19h10" />
          </svg>
          Plans
        </a>
        <a href="#/setup" class={tab === 'setup' ? 'on' : ''} aria-current={tab === 'setup' ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
          </svg>
          Setup
        </a>
      </nav>
    </>
  );
}
