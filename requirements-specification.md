# Goal
Build a production‑ready, writable time‑series grid component to capture gas nominations (AS4 NOMINT context) **one week at a time**. The grid is **local-time aware (Europe/Copenhagen)**, aligned to the **gas day (06:00 → 06:00 local)**, while **persisting/returning values in UTC**. The component must handle DST transitions (23/24/25‑hour gas days) and arbitrary **resolution** (5/15/30/60 minutes), including cases where the local clock jumps forward/back.

---

## Tech & Libraries (hard constraints)
- **React** (latest) + **TypeScript**
- **MUI X Data Grid Pro/Premium** (licensed)
- **Luxon** for date/time (zone: `Europe/Copenhagen`)
- **next-intl** for i18n
- **Sonner** for toasts (errors/info)

---

## Stakeholder Decisions (confirmed)
- **Unit:** kWh (display and summaries).
- **Max value:** 100,000 per step (safety cap).
- **Values:** integers ≥ 0 only (no decimals).
- **Direction (`entry`/`exit`):** used in fetch key and included on submit; does **not** affect validation.
- **Prefill source:** last submitted nomination for the **exact** week + direction + resolution.
- **Partial prefill:** default missing steps to **0**.
- **Clipboard/CSV:** autoparse delimiters (comma/semicolon/tab); accept decimal comma for parsing, but decimals are **not allowed** → surface validation error.
- **Time labeling (fall back):** duplicated hours shown with **offset badges** (e.g., 02:00 (+02), 02:00 (+01)).
- **Default week:** show the **current ISO week** even if some days/steps are in the past.
- **Editable scope:** you can nominate for **partial weeks**; past steps are read‑only. For **today**, steps are editable only **from the end of the current hour + 1 hour** onward (see Editability Gating).
- **Resolutions:** support **5, 15, 30, 60 minutes**; each gas day length is divisible by the chosen resolution.
- **Accessibility & theming:** standard good‑practice a11y; existing MUI theme already set up.
- **Toasts:** use Sonner; prefill error message: “failed to prefill nomination”.
- **Submission flow:** component **emits** changes; parent handles submit.
- **Past display:** show **prior values (read‑only)** if they exist; otherwise show **0**.

---

## UX Overview
- A **Week Selector** (date‑esque control) lets user choose the target week. Default to current ISO week (Mon–Sun). Show the week number.
- A **Direction Toggle**: `entry` | `exit`.
- A **Resolution Selector** (e.g., 60/30/15 minutes), ensuring each gas day has a whole‑number of steps given the DST‑affected length.
- The **Editable Grid** shows 7 rows (one per local calendar day within the selected week) and **dynamic columns** representing time steps from **06:00 local** to **next day 06:00 local** (exclusive). The number of columns per day is dynamic: **23/24/25 hours × (60 / resolution)**.
- **Values are non‑negative numbers (including 0)**. Editing supports keyboard entry, copy/paste, multi‑cell fill, and bulk tools (see below).
- **Prefill** from prior nominations when available; show diffs/overrides. Provide **Reset to previous** (or to 0 if none) per cell, per day, and for entire week.
- **Summaries**: per‑day total and weekly total (computed in the **nominated units**). Totals update live.

---

## Functional Requirements

### 1) Week selection
- Control: MUI X **DateCalendar** or **DatePicker** configured to pick any date; internally snap to its ISO week (Mon–Sun). Display the chosen week’s start (Mon 00:00 local) and ISO week number.
- Changing the week triggers re‑computation of daily time steps and prefill fetch.

### 2) Resolution
- Prop `resolutionMinutes`: **5 | 15 | 30 | 60** (extensible).
- Ensure each **gas day duration in minutes** (including 23/24/25‑hour cases) is divisible by `resolutionMinutes`. Reject/disable invalid selections.
- For 5‑minute resolution: 23h=**276** steps, 24h=**288** steps, 25h=**300** steps.

### 3) Time‑step generation (Luxon)
 Time‑step generation (Luxon)
- For each local **gas day** in the selected week, compute the interval `[D@06:00, D+1@06:00)` in **Europe/Copenhagen**.
- Split into `resolution` steps by **iterating in local time**, not UTC.
- For **spring forward** (23h gas day): skip the missing local interval (e.g., jump from 01:45 → 03:00 for 15‑min resolution). Step count shrinks accordingly.
- For **fall back** (25h gas day): include the repeated hour **twice**; disambiguate with zone offset in labels (e.g., `02:00 (+02)` vs `02:00 (+01)`).
- For each step, compute and store: `{ startLocal, endLocal, startUTC, endUTC }` (ISO strings), plus `stepIndex`.
- Grid **labels** display local times; tooltips include UTC and offset.

### 4) Data model & I/O
- **Integer values only**; validation enforces whole numbers ≥ 0.
- **All persisted times** are in **UTC**.

```ts
type Direction = 'entry' | 'exit';
type StepValue = number; // integer ≥ 0

interface PreviousNominationStep {
  startUTC: string; // ISO
  endUTC: string;   // ISO
  value: StepValue; // integer ≥ 0
}

interface NominationGridProps {
  weekAnchor: string; // ISO date within the week (local, Europe/Copenhagen)
  direction: Direction;
  resolutionMinutes: 5 | 15 | 30 | 60;
  unit?: 'kWh'; // fixed to kWh for now
  maxValue?: number; // defaults to 100000 (kWh)

  // Prefill callbacks
  fetchPreviousNomination?: (args: {
    direction: Direction;
    weekStartLocalISO: string; // Monday 00:00 local ISO
    resolutionMinutes: number;
  }) => Promise<PreviousNominationStep[]>;

  // Lifecycle & outputs
  onChange?: (payload: NominationSubmission) => void; // debounced
  onValidate?: (report: ValidationReport) => void;

  // Testing/override hooks
  nowISO?: string; // optional injection for "current time" (UTC ISO) to compute editability
}) => Promise<PreviousNominationStep[]>;

  // Lifecycle & outputs
  onChange?: (payload: NominationSubmission) => void; // debounced
  onValidate?: (report: ValidationReport) => void;

  // Testing/override hooks
  nowISO?: string; // optional injection for "current time" (UTC ISO) to compute editability
}

interface NominationSubmission {
  direction: Direction;
  resolutionMinutes: number;
  weekStartLocalISO: string; // Monday 00:00 local
  days: Array<{
    dateLocalISO: string; // YYYY-MM-DD (local day)
    steps: Array<{
      startUTC: string;
      endUTC: string;
      value: StepValue;
      source: 'user' | 'previous' | 'default';
      editable: boolean; // false for past steps
      labelLocal: string; // e.g., "02:00 (+02)"
    }>;
    dayTotal: number;
    editable: boolean; // day-level gate
  }>;
  weekTotal: number;
}

interface ValidationReport {
  issues: Array<{
    level: 'error' | 'warning';
    code: 'NEGATIVE' | 'NAN' | 'DECIMAL' | 'EXCEEDS_MAX' | 'PAST_EDIT' | string;
    message: string;
    context?: Record<string, unknown>;
  }>;
}
```ts
  type Direction = 'entry' | 'exit';
  type StepValue = number; // >= 0, may be decimal per props
  interface PreviousNominationStep {
    startUTC: string; // ISO
    endUTC: string;   // ISO
    value: StepValue;
  }
  interface NominationGridProps {
    weekAnchor: string; // ISO date within the week (local, Europe/Copenhagen)
    direction: Direction;
    resolutionMinutes: 60 | 30 | 15; // extensible
    unit: 'kWh' | 'MWh' | 'Nm3' | string; // display only
    decimalPlaces?: number; // default 3
    maxValue?: number; // optional upper guardrail

    // Prefill callbacks
    fetchPreviousNomination?: (args: {
      direction: Direction;
      weekStartLocalISO: string; // Monday 00:00 local ISO
      resolutionMinutes: number;
    }) => Promise<PreviousNominationStep[]>;

    // Persistence
    onChange?: (payload: NominationSubmission) => void;
    onValidate?: (report: ValidationReport) => void;
  }

  interface NominationSubmission {
    direction: Direction;
    resolutionMinutes: number;
    weekStartLocalISO: string; // Monday 00:00 local
    days: Array<{
      dateLocalISO: string; // YYYY-MM-DD (local day)
      steps: Array<{
        startUTC: string;
        endUTC: string;
        value: StepValue;
        source: 'user' | 'previous' | 'default';
      }>;
      dayTotal: number;
    }>;
    weekTotal: number;
  }

  interface ValidationReport {
    issues: Array<{
      level: 'error' | 'warning';
      code: string; // e.g., 'NEGATIVE', 'NAN', 'EXCEEDS_MAX'
      message: string;
      context?: Record<string, unknown>;
    }>;
  }
  ```

### 5) Prefill & reset
- On mount or when `weekAnchor/direction/resolution` changes, call `fetchPreviousNomination` if provided.
- Prefill values step‑aligned by `startUTC/endUTC` matching; missing steps default to `0`.
- Track **baseline** (previous) separately from **current** (user edits) to enable **Reset** at cell/day/week level. Show a small indicator for overridden cells.

### 6) Editing & bulk tools
- **Single cell edit** via numeric input; enforce **integer ≥ 0** and **≤ maxValue (default 100000)**. Block decimals; show inline error.
- **Multi‑select & fill** with a **Fill Dialog**:
  - **Set constant** integer value for selection.
  - **Copy previous nomination** into selection.
  - **Linear ramp** (integers): round user inputs to integers; interpolate then round to nearest integer.
  - **Repeat pattern**: comma/space/semicolon separated integers.
- **Copy/Paste** (CSV/TSV): autoparse delimiters (comma/semicolon/tab) and decimal commas; decimals are rejected with validation.
- **Drag‑fill handle** and **undo/redo** (≥ 20 steps).
- **Quick actions** per day: “Fill all day with X”, “Apply weekday average (rounded)”, “Reset day”.
- **Editability gating**:
  - Any step whose **local start time** is **< `cutoffLocal`** is **read‑only**.
  - **`cutoffLocal = floorToHour(nowLocal).plus({ hours: 2 })`** (i.e., end of current hour + 1 hour). Example: at 14:37 local, cutoff = 16:00; steps starting ≥ 16:00 are editable.
  - All prior calendar days within the week are read‑only.

### 7) Validation
- Disallow negative, **non‑integers**, NaN, Infinity. Emit `DECIMAL` for non‑integers.
- Enforce **maxValue = 100000** by default (overridable via prop).
- Highlight invalid cells; block submission/`onChange` emission for invalid edits; emit `onValidate`.

### 8) Summaries & UI polish
 Summaries & UI polish
- Sticky first column (day/date) and sticky summary columns (day total, week total row).
- Row/column virtualization (MUI) for performance at high column counts (e.g., 15‑min resolution).
- Tooltips show local time, UTC, and offset.
- i18n for labels, tooltips, errors. Respect locale number formatting via `next-intl`.
- Theming via MUI (light/dark). High‑contrast focus outlines; full keyboard navigation.

### 9) Direction toggle
- MUI **ToggleButtonGroup** for `entry` vs `exit`.
- Used in **prefill key** and included in **submission payload**; **no validation differences**.

### 10) Output
- Component **does not render a Submit button** (parent builder handles it).
- `onChange` fires on valid edits (debounced ~300 ms) with the full `NominationSubmission` (values in **UTC**). Past, read‑only steps remain in payload with `editable=false`.

### 11) Error/empty states
- Prefill failure: **Sonner toast** with message **“failed to prefill nomination”**; default zeros; allow manual entry on editable (future) steps.
- Invalid resolution (should not occur with 5/15/30/60): surface error and block.
- Week entirely in past: show non‑blocking info banner; grid disabled.

---

## Edge Cases to Handle
- **Spring forward** (23‑hour gas day): fewer steps; missing hour.
- **Fall back** (25‑hour gas day): duplicated hour; both instances uniquely identified by offset (label badges).
- Week that **spans a DST change**: rows have different column counts; grid supports per‑row counts.
- **Today**: if the current gas day has already started, earlier steps are read‑only; later steps are editable.
- Prefill with **partial coverage** or mismatched resolution: default remaining steps to **0**; no resampling.
- Clipboard inputs with decimals: reject and surface validation.
- Large integer values; locale thousands separators.

---

## Algorithm Notes (Luxon)
```ts
const zone = 'Europe/Copenhagen';

function currentLocal(zone: string, nowISO?: string) {
  return nowISO ? DateTime.fromISO(nowISO).setZone(zone) : DateTime.now().setZone(zone);
}

function cutoffLocal(now: DateTime) {
  // Editability cutoff = end of current hour + 1 hour
  return now.startOf('hour').plus({ hours: 2 });
}

const gasDay = (d: DateTime) => Interval.fromDateTimes(
  d.set({ hour: 6, minute: 0, second: 0, millisecond: 0 }),
  d.plus({ days: 1 }).set({ hour: 6, minute: 0, second: 0, millisecond: 0 })
).set({ zone });

function* stepsForGasDay(dayStartLocal: DateTime, resolutionMinutes: number) {
  let t = dayStartLocal;
  const end = dayStartLocal.plus({ days: 1 });
  while (t < end) {
    const next = t.plus({ minutes: resolutionMinutes });
    if (next <= end) {
      yield {
        startLocal: t.toISO(),
        endLocal: next.toISO(),
        startUTC: t.toUTC().toISO(),
        endUTC: next.toUTC().toISO(),
        offsetMinutes: t.offset,
      };
    }
    t = next.setZone(zone, { keepCalendarTime: true });
  }
}
```

---

## Acceptance Criteria
- Correct column counts per gas day for 23/24/25‑hour cases at **5/15/30/60‑minute** resolutions.
- Values are **integers ≥ 0** and **≤ 100000**; invalid inputs flagged immediately.
- Reset to previous/zero works at cell/day/week levels.
- Prefill aligns by UTC step boundaries using **last submitted nomination for exact week/direction/resolution**.
- **Editability gating** respected: only steps with local start ≥ **end of current hour + 1 hour** are editable; all prior days/steps are read‑only.
- Past steps show **prior values (read‑only)** if they exist; else **0**.
- Accessibility and keyboard navigation meet standard good‑practice; virtualization remains smooth at 5‑minute resolution.
- All strings externalized for `next-intl`; toasts via **Sonner**.

---

## Deliverables
- `NominationGrid` component with updated props/types and integer validation.
- Storybook stories: default, spring‑forward week (23h), fall‑back week (25h), **5‑minute** resolution heavy case, with/without prefill, week entirely in past (disabled state), mid‑week partial‑edit gating demo.
- Unit tests: step generation (DST cases), integer validation, reset logic, editability gating for past steps.
- Integration test (Playwright/Cypress): bulk fill, clipboard paste with various delimiters and decimal commas (rejected), range selection behaviors, undo/redo, reset to previous.
- Minimal demo page (Next.js) using `next-intl`, **Sonner**, and mocked `fetchPreviousNomination`.
- Lightweight internal docs: "How we compute steps", "Prefill alignment", "Editability rules", and "Known DST quirks".

---

## Final Notes
- **Submission:** Component does not render a Submit button; it emits `onChange`, parent handles persistence.
- **Default view:** Always open on **current ISO week**; supports partial‑week nominations per gating rules.
- **Past display:** Show prior read‑only values if available; otherwise 0.
- **Max value:** Default 100,000 kWh per step (overridable prop).

---

# Detailed Implementation Plan

## Architecture
- **Component split**
  - `NominationGrid` (container): orchestrates week/resolution/direction state, data fetch, step generation, editability gating, totals, validation, and emits `onChange`/`onValidate`.
  - `WeekSelector`: wraps MUI X `DatePicker`/`DateCalendar` with ISO-week snap + week number display.
  - `ControlsBar`: resolution selector, direction toggle, quick actions, and shortcuts help.
  - `GridView`: MUI X **Data Grid Premium** configured for **cell range selection**, **column virtualization**, **pinned columns**, **column groups**.
  - `FillDialog`: bulk fill UI (constant, copy previous, ramp, repeat pattern).
  - `TotalsFooter`: shows week total; per‑day totals live in a pinned summary column.

- **State management**: Local React state + reducers; optional **Zustand** store if parent needs cross‑component coordination. Undo/redo via reducer history ring buffer (capacity ≥ 50 ops).

- **SSR safety**: In Next.js, mark as client component. Guard any `window`/clipboard usage behind `useEffect`.

## Data Grid design (MUI X Premium)
- **Rows**: one per **calendar day** in selected week (Mon–Sun). Row `id` = YYYY‑MM‑DD (local).
- **Columns**:
  - **Pinned left**: `day` (weekday short name + date), `dayTotal`.
  - **Dynamic step columns** for the **maximum** step count across the 7 gas days (e.g., 300 at 5‑min if week includes a 25‑h day). Per day, columns beyond that day’s step count are **disabled/empty** (read‑only and visually muted).
  - **Column groups**: group step columns under **Day headers** (Mon/Tue…) with sublabels for local span `06:00→06:00` and offset info on DST days.
  - **Cell renderer**: MUI `InputBase` with numeric-only filtering and fast commit on blur/Enter. Tooltip: local label + UTC interval + offset.

- **Selection & actions**:
  - Enable **range selection** (Premium) across cells, even across days.
  - Toolbar buttons / hotkeys opening `FillDialog` when a range exists.
  - Context menu per day: Fill all, Reset day, Copy previous for day.

- **Performance**:
  - Column virtualization and `getRowHeight={() => 'auto'}` with fixed slim row height (e.g., 40px) for speed.
  - Memoize column model; only regenerate when resolution/week changes.
  - Avoid React re-renders on keystrokes by using `processRowUpdate` and batched state updates; debounce `onChange`.

## Time and steps
- **Gas day interval**: `[D@06:00 local, D+1@06:00 local)`; computed with Luxon in `Europe/Copenhagen`.
- **Ambiguous/nonexistent times**:
  - Spring forward: nonexistent hour skipped → fewer steps.
  - Fall back: ambiguous hour represented twice with **offset badges**. Internally, include `offsetMinutes` and distinct `startUTC`.
- **Editability gating**:
  - `nowLocal = DateTime.now().setZone('Europe/Copenhagen')`.
  - `cutoffLocal = nowLocal.startOf('hour').plus({ hours: 2 })`.
  - A step is editable iff its **`startLocal >= cutoffLocal`**.
  - All steps on days before `nowLocal.startOf('day')` are read‑only.

## Prefill and baselines
- Fetch **previous nomination** keyed by week start (Mon 00:00 local), `direction`, `resolution`.
- Build **baseline map** keyed by `startUTC|endUTC`.
- For each generated step, `currentValue = baselineValue ?? 0`.
- Track `source: 'previous' | 'default' | 'user'` per step; show a small dot/badge for overridden cells.
- **Reset**
  - **Cell**: revert to baseline or 0.
  - **Day/Week**: revert selection to baseline/0 in bulk.

## Validation & formatting
- **Rules**: integer ≥ 0, ≤ `maxValue` (default 100000), finite.
- **Errors**: per-cell; show red outline + tooltip; aggregate in `onValidate`.
- **Number input**: accepts locale group separators on paste (strip); decimals are rejected with `DECIMAL`.

## Clipboard & bulk fill
- **Parsing**:
  - Accept CSV/TSV; auto‑detect delimiter (`,`, `;`, `	`).
  - Accept decimal comma but **reject decimals**; parse as integer if no decimal part.
  - Trim/normalize whitespace; allow blank cells → ignored (no change) unless “Fill empties only” is checked.
- **Ramp**: interpolate across N cells then `Math.round` to nearest integer; ensure bounds within [0, maxValue].
- **Repeat pattern**: split list of integers; tile across selection length.

## Totals
- **Per‑day**: sum integers across **that day’s actual steps** (ignore disabled cells beyond day’s count).
- **Weekly**: sum of day totals. Display in kWh.

## i18n (next‑intl)
- Message keys: `grid.labels.day`, `grid.labels.totalDay`, `grid.labels.totalWeek`, `grid.actions.fill`, `grid.errors.decimal`, `grid.errors.max`, etc.
- All user‑facing strings externalized; number formatting via `Intl.NumberFormat(locale)` for readouts.

## Accessibility
- ARIA grid roles applied by DataGrid; ensure labels for day headers & step groups.
- Keyboard: arrow navigation, Shift+arrows for range, Enter to commit, Esc to cancel, `Ctrl/Cmd+Z` undo, `Shift+Z` redo, `=` to open Fill Dialog.
- Focus ring visible; high‑contrast errors and read‑only styles.

## Error handling (Sonner)
- `toast.error('failed to prefill nomination')` on fetch failure; continue with zeros.
- Validation failures are inline; no toast unless a bulk operation fails (e.g., paste contained forbidden decimals).

## Testing plan
- **Unit**: step generation across sample DST weeks; editability cutoff computations; validators; ramp rounding.
- **Integration (Playwright/Cypress)**: paste data, fill ranges, undo/redo, reset, switch resolution, change week, prefill failure path.
- **Performance smoke**: 5‑minute resolution with 25‑h day (300 columns); ensure input latency < 16ms per keystroke on mid‑range laptop.

## Storybook
- Controls: week picker (select spring/fall weeks), resolution (5/15/30/60), direction, now override, prefill on/off, maxValue override.
- Scenarios: partial‑week mid‑Wednesday, entire past week (disabled), prefill missing gaps → zeros.

## API & data contracts (example)
- **Prefill fetch** (implemented by parent):
  ```ts
  fetchPreviousNomination({ direction, weekStartLocalISO, resolutionMinutes }): Promise<{
    steps: { startUTC: string; endUTC: string; value: number }[];
    version: string; // optional ETag for optimistic concurrency
  }>
  ```
- **onChange payload** already defined as `NominationSubmission`. Recommend parent to persist with version/ETag if available.

## Concurrency & conflicts (optional but recommended)
- Include `version` in prefill payload and echo it back on submit. If backend detects a newer version, parent should prompt the user to refresh/reconcile.

## Visual polish
- Column header badges for offset on fall‑back day, e.g., `02:00 (+02)` and `02:00 (+01)`.
- Read‑only cells: dimmed text and locked icon on hover.
- Dirty state indicator at the top when any cell differs from baseline.

---

# Targeted Follow‑up Questions
1) **Backend versioning**: Do you have an ETag/version we can use for optimistic concurrency (avoid overwriting newer nominations)?
2) **Cutoff nuance**: Our gating is `startLocal >= endOfCurrentHour + 1h`. Is that **exactly** your rule across all days (including weekends/holidays)?
3) **Baseline visibility**: For read‑only past steps, should we show a small "locked" glyph and a tooltip explaining why it's locked and the exact cutoff time?
4) **Dirty state**: Do you want a top‑level banner/button to **Reset entire week** and/or a **Revert all to baseline** action?
5) **Autosave feedback**: Should we show a tiny status (Saving… / Saved) when `onChange` fires and the parent is persisting?
6) **Ramp behavior**: If the ramp result exceeds `maxValue` after rounding, should we **clip** or **reject** the operation?
7) **Paste policy**: When pasting over read‑only cells (past), should we silently skip them or block the entire paste with an error?
8) **Keyboard**: Any preferred hotkeys beyond the proposed ones (e.g., `Alt+R` for Reset selection)?
9) **Analytics**: Any need to instrument bulk operations (e.g., how often ramp is used) or validation errors for UX tuning?
10) **Contract totals**: In the future, do you need optional rules like "week sum must equal X"? If yes, we’ll add a pluggable validator hook.

> Once you confirm these, I’ll lock them in and we’re truly build‑ready.

