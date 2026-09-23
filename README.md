# Neverfed

A mobile-friendly, offline-capable PWA for designing cat feeding schedules. It checks
each plan against every cat's daily calorie target and turns any plan into instructions
for a cat sitter.

It's local-first. Data lives in your browser's IndexedDB, with no backend and no accounts.
Nothing about your cats is in this repo: on first run the app walks you through entering
your cats, foods and feeders.

## Using it

1. **Setup**: add cats (daily kcal target), foods (dry or wet, kcal per cup or per can) and
   feeders (manual/microchip or automatic, which cats can use each one, what it accepts).
   Auto feeders also get a loaded food, a portion per dispense and an optional hopper size.
2. **Plans**: one day's schedule per scenario. Every plan card shows each cat's kcal against
   target, so comparing scenarios is just scanning the list. Duplicate a plan, then tweak it.
3. **Sitter sheet**: generated from a plan for a number of days away. You can copy it,
   share it, save it as `.txt` or print it (and print to PDF).
4. **Setup → Data**: export or import a JSON backup. Do this now and then, because clearing
   site data wipes the app.

## Model

The full design spec is in [`docs/spec.md`](docs/spec.md).

- **A fill is the unit, not a time slot.** A fill is what goes into one feeder at one
  time: one food, or several put down together (e.g. wet and dry). It counts as one
  feeding. If it's left down to graze, that changes the gap and wet-food checks, but its
  calories are still counted once.
- **Fill timing** is either a set time (your own feedings, auto dispenses) or a
  **visit window** for a sitter who comes whenever they can ("any time", or e.g. 09:00–18:00).
  The checks assume the worst case over the window.
- **Auto dispenses carry only a time.** Food and portion come from the feeder, as on the
  real device, so changing the portion updates every plan.
- **Shared feeders** split their calories between cats using an editable weight (default even).
  This is an estimate, and the plan screen always says so.
- **Unknown is not zero.** A missing kcal density, portion or target makes that total
  unknown, and the plan shows "needs setup" with a list of what's missing.
- Status: under < 95% of target ≤ on ≤ 105% < over.

Checks shown on each plan:

- Feedings per cat per day.
- Longest gap without food, including overnight. Grazing time counts as fed, and an
  open-ended graze lasts until that feeder's next fill.
- Wet food left down more than 4 hours.
- Hopper runway: how many days a full hopper lasts.
- Food needed for a trip.

The thresholds are constants: `WET_MAX_MINUTES` in `src/model/checks.ts` and
`LONG_GAP_MINUTES` in `src/ui/PlanScreen.tsx`.

## Development

```sh
npm install
npm run dev        # dev server
npm test           # unit tests (model + storage)
npm run build      # typecheck + production build into dist/
```

Code layout:

- `src/model/`: pure logic (types, units, calorie maths, checks, sitter text). Tested.
- `src/store/`: IndexedDB persistence and schema migrations.
- `src/ui/`: Preact components.

**Changing the data model:** bump `SCHEMA_VERSION` in `src/model/types.ts` and add a step
to `migrations` in `src/store/migrate.ts`. The step runs on stored data and on imported
backups.

## Deploying

`docs/github-pages-workflow.yml` tests and builds on every push and PR, and deploys `main`
to GitHub Pages. To install it:

1. Move it to `.github/workflows/deploy.yml`. It lives in `docs/` because the tool that
   created this repo wasn't allowed to write workflow files.
   `git mv docs/github-pages-workflow.yml .github/workflows/deploy.yml` then commit and push.
2. In **Settings → Pages → Source**, choose **GitHub Actions**.
