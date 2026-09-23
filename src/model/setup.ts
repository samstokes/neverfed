import type { AppData } from './types';

export interface SetupStep {
  id: string;
  label: string;
  done: boolean;
  /** Optional steps don't block anything but unlock extra checks. */
  optional?: boolean;
  section: 'cats' | 'foods' | 'feeders' | 'plans';
}

/** The first-run checklist: everything the calculations depend on that only the user can enter. */
export function setupSteps(data: AppData): SetupStep[] {
  const autos = data.feeders.filter((f) => f.kind === 'auto');
  const shared = data.feeders.filter((f) => f.catIds.length > 1);
  const steps: SetupStep[] = [
    { id: 'cats', section: 'cats', label: 'Add your cats', done: data.cats.length > 0 },
    {
      id: 'targets',
      section: 'cats',
      label: 'Enter each cat’s daily kcal target',
      done: data.cats.length > 0 && data.cats.every((c) => c.dailyKcal !== null),
    },
    {
      id: 'eats',
      section: 'cats',
      label: 'Say whether each cat grazes or eats in one go',
      done: data.cats.length > 0 && data.cats.every((c) => c.eats !== null),
      optional: true,
    },
    { id: 'foods', section: 'foods', label: 'Add the foods you feed', done: data.foods.length > 0 },
    {
      id: 'density',
      section: 'foods',
      label: 'Enter kcal per cup / per can for each food (the ME figure on the packet)',
      done: data.foods.length > 0 && data.foods.every((f) => f.kcalPerUnit !== null),
    },
    {
      id: 'feeders',
      section: 'feeders',
      label: 'Add your feeders and say which cats can use each',
      done: data.feeders.length > 0 && data.feeders.every((f) => f.catIds.length > 0),
    },
  ];
  if (autos.length) {
    steps.push({
      id: 'auto',
      section: 'feeders',
      label: 'Set each auto feeder’s loaded food and portion per dispense',
      done: autos.every((f) => f.loadedFoodId !== null && f.portion !== null),
    });
    steps.push({
      id: 'hopper',
      section: 'feeders',
      label: 'Enter hopper capacity, to see how long it runs unattended',
      done: autos.every((f) => f.hopperCups !== null),
      optional: true,
    });
  }
  if (shared.length) {
    steps.push({
      id: 'share',
      section: 'feeders',
      label: 'Check how each shared feeder’s food splits between cats (defaults to even)',
      done: shared.every((f) => Object.keys(f.share).length > 0),
      optional: true,
    });
  }
  steps.push({ id: 'plan', section: 'plans', label: 'Create your first plan', done: data.plans.length > 0 });
  return steps;
}
