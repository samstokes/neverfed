# Neverfed — design spec

A mobile-friendly PWA that replaces a cat-feeding spreadsheet. It designs feeding schedules,
checks they hit each cat's calorie target, and generates cat-sitter instructions.

> **About this copy.** This is the original design spec, updated with the decisions made
> while building the first version. Those are summarised under [Revisions](#revisions) and
> marked **(revised)** where they appear. The repo is public, so the household-specific
> details from the original (cat names, food brands, feeding times, the scenarios to
> migrate) have been replaced with generic descriptions.

## Background

The household has two cats and three feeders:

- a **microchip feeder** for each cat, which only that cat can open. It takes wet and dry
  food but has to be filled by hand;
- an **automatic feeder**, shared by both cats, which dispenses dry food on a programmable
  schedule.

The cats are fed several times a day, on a mix of wet and dry foods with different calorie
densities. The goal is to make it easy to plan different schedules speculatively, check
they provide enough calories, and generate instructions for a cat sitter covering the
manual feedings.

---

## 1. The three ideas that make this better than the spreadsheet

**1. The unit is a *fill*, not a time slot.**
In the spreadsheet, a morning portion that one cat grazes on all day is a single merged
cell spanning several rows: one portion put down in the morning, not several feedings.
Treating rows as slots would count that portion several times. So the basic unit is a
**fill**: what's put into one feeder at one time. **(revised)** That can be one food or
several put down together, such as wet and dry in the same bowl, and it counts as one
feeding either way. Whether it's grazed or eaten in one go, and whether anyone picks up
what's left, changes the gap and wet-food checks, but never the calorie count.

**2. Food is a first-class record with a calorie density.**
A footnote like "amounts assume food A, multiply by 1.5 for food B" is a calorie conversion
done by hand. If each food stores its kcal per cup (dry) or per can (wet), the multiplier
disappears. Swapping foods in a plan recomputes automatically, and the ×1.5 simply falls
out of the two densities.

**3. Manual vs. automatic is the axis everything hangs off.**
The microchip feeders have to be filled by hand; the auto feeder fills itself. That one
flag drives the whole sitter feature: sitter instructions are just *the manual fills*,
formatted. There's no separate "sitter mode" data to maintain, so a sitter plan is just a
plan with fewer, larger manual fills.

---

## 2. Data model

```ts
Cat {
  id, name,
  dailyKcal: number | null,   // target; null until entered
  color,                      // identity colour used throughout the UI
  eats: 'grazes' | 'meals' | null  // (revised) grazes, or eats in one go; null = not said,
                                   // treated as grazing
}

Food {
  id, name,
  form: 'dry' | 'wet',
  kcalPerUnit: number | null, // per cup (dry) or per can (wet): the "ME" figure on the bag or tin
  notes
}

Feeder {
  id, name,
  kind: 'microchip' | 'auto',
  catIds: string[],           // who can physically get at it
  accepts: ('dry' | 'wet')[],

  // auto feeders only. These live on the device, not on each dispense:
  loadedFoodId,               // the hopper holds one dry food at a time
  portion,                    // cups per dispense (the feeder's programmed setting)
  hopperCups,                 // optional capacity, for "lasts N days"
  share: { [catId]: number }  // how a shared feeder's food is split between cats; see §3
}

Plan {
  id, name, notes,
  fills: Fill[]
}

Fill {                                                        // (revised)
  id, feederId,
  time: { kind: 'at', at: 'HH:MM' }                           // a set time
      | { kind: 'window', from: 'HH:MM', to: 'HH:MM' },       // a sitter visit window

  // manual fills only:
  items: { foodId, qty }[],   // (revised) one or more foods put down together;
                              // qty in the food's unit: cups or cans
  pickUpAt: 'HH:MM' | null,   // (revised) when someone picks up what's left; null = it
                              // stays down until eaten. Whole fill; set-time fills only
  note
}

AppData { schemaVersion, cats, foods, feeders, plans }
```

**Fill timing (revised).** A sitter's visit time is unpredictable: they come whenever they
can within a broad window. So a fill happens either **at a set time** (your own feedings,
and every auto dispense) or **in a visit window**, which defaults to any time of day
(`00:00`–`24:00`). The checks assume the worst case over the window (§4). A windowed fill
can't have a pick-up time, because the time it goes down isn't known.

**Eating style and pick-up (revised).** You can't control when a cat finishes eating, only
whether someone takes the food away. So a fill records only an optional pick-up time, and
each cat records whether it grazes or eats in one go. Together these say how long food is
really available, which is what the gap and wet-food checks need.

**Why auto dispenses have no food or amount.** A programmable feeder has one hopper and one
portion setting; what you program is the *times*. So an auto fill is `{feederId, time}`,
and its food and amount come from the feeder. One edit to the feeder's portion updates
every auto dispense in every plan, which is how the real device behaves.

**Units.** Amounts are stored in cups or cans and displayed in the vocabulary from the
spreadsheet: a scoop is ¼ cup, so ½ cup shows as "½ cup · 2 scoops" and ⅛ cup as
"⅛ cup · ½ scoop". Amount entry offers fraction chips as well as a number field: ⅛ ¼ ⅜ ½ ⅝
¾ 1 for cups, and ¼ ⅓ ½ ⅔ ¾ 1 for cans. The field also accepts `1/8`, `1 1/2`, `½` and
`0.125`, because nobody wants to type 0.125 on a phone.

---

## 3. Calorie calculation

```
fill_kcal   = Σ over items of qty × food.kcalPerUnit   // (revised) unknown if any item's is
attribution = feeder.catIds.length === 1
                ? { [thatCat]: 1 }
                : normalise(feeder.share)      // weights, default even
cat_total   = Σ over fills of fill_kcal × attribution[cat]
```

**The shared auto feeder is the one genuinely ambiguous part of the model.** Both cats can
eat from it, so its calories have to be split somehow, and there's no way to know the real
split without weighing. The spreadsheet sidesteps this by listing the auto dispenses under
only one cat, i.e. crediting that cat with almost all of it. Instead, the split is an
explicit, editable setting on the feeder: a slider between the two cats, defaulting to
50/50. It's shown on the plan screen so it never becomes a hidden assumption, and the UI
says it's an estimate: each cat's totals are only as good as this number.

**Status per cat:** `under` if below 95% of target, `on` if within ±5%, `over` if above
105%. The actual percentage is shown, not just the verdict.

**Missing data must look different from zero.** If a food has no kcal density or an auto
feeder has no portion set, the total is *unknown*, not low. Such plans show a "needs
setup" state listing what's missing, rather than a misleadingly small number.

---

## 4. Derived checks

Beyond the calorie total, each plan shows:

- **Feedings per cat per day.** This checks "several times a day" for each cat, counting
  both manual fills and the auto dispenses that cat can get at.
- **Longest gap** without food, including the overnight wrap-around. A plan that hits the
  calorie target with two feedings 14 hours apart should say so.
  **(revised)** For a cat that grazes, food in a feeder it has to itself counts as
  available until it's picked up or that feeder's next fill. For a cat that eats in one
  go, each fill is a single moment. Fills in shared feeders are always a single moment,
  since the other cat may eat what's left. For windowed fills, each visit window is tried at
  both ends and the worst result is shown, labelled "worst case". Gaps over 12 hours are
  highlighted.
- **Wet food sitting out.** A wet fill left down for a long or open-ended time is a
  spoilage risk. Flag wet fills left down more than 4 hours. **(revised)** Only where a
  grazing cat can get at it: a cat that eats in one go finishes it first.
- **Hopper runway:** `hopperCups ÷ (portion × dispenses per day)`, i.e. how many days the
  auto feeder runs unattended. This is the number that matters when you're away.
- **Food needed for a trip:** for a given number of days, total cups of each dry food and
  cans of each wet food, including what goes through the auto feeder. This goes on the
  sitter sheet so you know what to leave out.

---

## 5. Screens

**Plans (home).** All plans as cards. Each card shows every cat's kcal against target as
a bar with a target marker, plus the status. This doubles as the comparison view: the
speculative "does this schedule work?" question is answered by scanning the list. Actions:
new, duplicate, delete. Duplicating and then tweaking is the main way plans get written,
since the spreadsheet's scenarios are near-copies of each other.
**(revised)** Until setup is complete, the home screen also shows the first-run checklist
(§7).

**Plan detail.** A timeline of the day, in time order. Each row shows the time (or visit
window), feeder, the cat(s) it feeds, food and amount, kcal, and a manual/auto badge. Fills
that are left down show how long for. Above the timeline are the per-cat totals, the
shared-feeder estimate and the §4 checks. Fills are added, edited and deleted here.

**Sitter sheet.** Generated from one plan for a given number of days away. It contains:

- Which feeder belongs to which cat, and that each one is microchip-locked to that cat.
- The manual fills grouped by time of day, or by visit window (**revised**), with amounts
  in both cups and scoops.
- For each fill, whether to leave it down or pick up what's left at a set time
  (**revised**).
- The auto feeder: its schedule, marked *no action needed*, plus a hopper top-up reminder
  and the runway figure.
- The total food to leave out for the trip.
- The plan's free-text notes.

It's output as copyable text, a share button (where the device supports it), a saved
`.txt` file, and a print view that can be saved as PDF. The sitter wants something they
can keep open on a phone or stick to the fridge.

**Setup.** Cats (name, daily kcal target, colour); foods (name, wet or dry, kcal per cup or
per can); feeders (name, kind, which cats can use it, what it accepts). Auto feeders also
have a loaded food, portion, hopper size and share. Setup also has JSON export and import.

---

## 6. Build notes

The app is single-user with a small amount of data, and needs to work on a phone in a
kitchen with bad wifi. So it's **local-first**: IndexedDB for storage, no backend, no
accounts. A service worker and web app manifest make it installable and usable offline.
It's hosted as static files on GitHub Pages, built straight from the repo.

- **Stack (revised):** Vite, TypeScript and Preact, with `vite-plugin-pwa` for the service
  worker. The calorie maths, checks and sitter text are plain functions with unit tests.
- **JSON export and import.** The whole store is a few KB. This is the backup plan, and
  it's how the data survives a browser clearing site data.
- **Schema versioning and migrations,** since the model will change while it's in use.
  The same migrations run on stored data and on imported backups.
- **No calorie figures hardcoded.** Everything in §7 is entered by the user, so wrong
  numbers are theirs to fix rather than hidden defaults waiting to be discovered.
- **No seed data (revised).** The repo is public, so it contains nothing about specific
  cats, foods or feeding times, not even in tests. A fresh install starts empty, and the
  user enters everything during onboarding.

---

## 7. Data to enter on first run

**(revised)** The app starts empty and shows a "Getting started" checklist on the home
screen and in Setup:

| Step | Why it's needed |
|---|---|
| Add the cats | |
| Each cat's daily kcal target | Nothing to check against without them |
| Whether each cat grazes or eats in one go *(optional)* | Used by the gap and wet-food checks; treated as grazing until set |
| Add the foods | |
| kcal per cup / per can for each food | Hand-applied conversion factors become unnecessary once these are known; confirm them from the packaging |
| Add the feeders and which cats can use each | |
| Each auto feeder's loaded food and portion per dispense | Needed for every auto dispense |
| Shared feeder split *(optional)* | Defaults to 50/50; the spreadsheet may imply something very different |
| Hopper capacity *(optional)* | Enables the runway figure |
| First plan | |

---

## 8. Migrating plans from the spreadsheet

The spreadsheet's scenarios are re-entered by hand as plans. None are shipped with the app.
They're typically:

- **Everyday schedules:** several small manual fills at set times, one morning fill left
  down to graze until the afternoon, and two or three auto dispenses.
- **Out-overnight schedules:** one large morning fill left down all day for one cat, with
  extra auto dispenses covering the evening and night.
- **Sitter schedules:** one sitter visit a day with fewer, larger fills left down to graze,
  sometimes wet and dry together, plus more auto dispenses.

The sitter schedules are the real test of the model: fewer, larger fills in a visit window
with long graze times, which is exactly what the sitter sheet (manual fills only) should
make obvious. Wet food in those plans that's left down will be flagged as a spoilage risk.

Where the spreadsheet only says "morning", "evening" or "night", pick real times when
entering the plan. The worst-case gap check will show if a choice matters.

---

## Revisions

Decisions made while building the first version, compared with the original spec:

1. **Sitter visit windows.** Sitter visit times are unpredictable, so `Fill.at` became
   `Fill.time`: either a set time or a visit window (default all day). Your own feedings
   and auto dispenses keep set times. Checks take the worst case over each window, and the
   sitter sheet groups fills by visit ("Once a day, any time", "Once, any time
   09:00–18:00").
2. **Leaving food down.** `grazesUntil?` became an optional `pickUpAt` time: food stays
   down until eaten unless someone picks it up. An earlier "eaten now" option was dropped,
   because nobody controls when a cat finishes. Whether food lasts is now a property of
   the cat (`eats`: grazes or eats in one go), and the gap and wet-food checks use both.
   Schema version 3 migrates existing data: "eaten now" and "left down" become no
   pick-up time, "until a time" becomes a pick-up time, and cats start with no eating
   style set.
3. **No seed data.** The repo is public, so nothing specific to the household is committed.
   §7 is a first-run checklist and §8 is re-entered by hand.
4. **Stack.** Vite, TypeScript and Preact, with a GitHub Pages workflow. The workflow file
   is stored at `docs/github-pages-workflow.yml` until it's moved into
   `.github/workflows/`.
5. **Several foods per fill.** `foodId` and `qty` on a fill became `items`, so wet and dry
   put down together are one fill: one timeline row, one feeding in the count, and one line
   on the sitter sheet ("½ can … + ¼ cup …"). Leaving food down applies to the whole fill,
   and only the wet items are flagged for sitting out. Schema version 2 migrates existing
   data and imported backups.
6. **Thresholds.** Gaps over 12 hours are highlighted. Feedings per day are shown without a
   warning threshold.
