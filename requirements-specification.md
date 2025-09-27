# AS4 Gas Nomination Grid — Full Technical Specification (MUI + Luxon + nuqs)

> **Purpose**: Implement a production‑ready, writable, time‑series grid component to capture gas nominations (AS4 NOMINT context) **one week at a time**. The grid is **local‑time aware (Europe/Copenhagen)** and aligned to the **gas day (06:00 → 06:00 local)** while **persisting/returning values in UTC**. It must correctly represent DST transitions (23/24/25‑hour gas days), support **5/15/30/60‑minute** resolution, enforce integer non‑negative values, allow bulk editing, and integrate with URL state via **nuqs** using **compressed diffs** to keep shared links compact.

---

## Table of Contents
1. [Context & Scope](#context--scope)
2. [Tech & Libraries](#tech--libraries)
3. [Stakeholder Decisions (Confirmed)](#stakeholder-decisions-confirmed)
4. [Glossary & Time Model](#glossary--time-model)
5. [UX Overview](#ux-overview)
6. [Functional Requirements](#functional-requirements)
   - 6.1 [Week Selection](#61-week-selection)
   - 6.2 [Resolution](#62-resolution)
   - 6.3 [Time‑Step Generation (Luxon)](#63-time-step-generation-luxon)
   - 6.4 [Data Model & I/O (Types)](#64-data-model--io-types)
   - 6.5 [Prefill & Baseline](#65-prefill--baseline)
   - 6.6 [Editing & Bulk Tools](#66-editing--bulk-tools)
   - 6.7 [Validation](#67-validation)
   - 6.8 [Summaries & UI Polish](#68-summaries--ui-polish)
   - 6.9 [Direction Toggle](#69-direction-toggle)
   - 6.10 [Output & Events](#610-output--events)
   - 6.11 [Error & Empty States](#611-error--empty-states)
7. [Edge Cases](#edge-cases)
8. [Algorithms (Luxon & Indexing)](#algorithms-luxon--indexing)
9. [URL State (nuqs) — Compression & Diffs](#url-state-nuqs--compression--diffs)
   - 9.1 [Keys & What We Store](#91-keys--what-we-store)
   - 9.2 [Global Step Indexing](#92-global-step-indexing)
   - 9.3 [Format v1 — JSON + RLE + Deflate](#93-format-v1--json--rle--deflate)
   - 9.4 [Format v2 — Binary + Delta + VLQ](#94-format-v2--binary--delta--vlq)
   - 9.5 [nuqs Parsers & Wiring](#95-nuqs-parsers--wiring)
   - 9.6 [Encoding/Decoding Algorithms](#96-encodingdecoding-algorithms)
   - 9.7 [URL Size Safeguards](#97-url-size-safeguards)
10. [Architecture & Components](#architecture--components)
11. [Implementation Details](#implementation-details)
12. [i18n](#i18n)
13. [Accessibility](#accessibility)
14. [Testing Plan](#testing-plan)
15. [Storybook Scenarios](#storybook-scenarios)
16. [Performance Targets](#performance-targets)
17. [Concurrency & Conflicts](#concurrency--conflicts)
18. [Visual Polish](#visual-polish)
19. [Deliverables](#deliverables)
20. [Acceptance Criteria](#acceptance-criteria)
21. [Non‑Functional Requirements](#non-functional-requirements)
22. [Build & Project Setup](#build--project-setup)
23. [Folder Structure](#folder-structure)
24. [Code Style & Conventions](#code-style--conventions)
25. [Examples](#examples)
26. [Appendix: Gas Day Overview](#appendix-gas-day-overview)

---

## Context & Scope
- Target domain: **AS4 NOMINT** gas nominations captured per **week**.
- Grid operates in **Europe/Copenhagen** local time for display and editing but **stores/returns UTC**.
- Handles DST transitions: **23/24/25‑hour** gas days depending on season and changeover days.
- Users primarily enter the **same number for long stretches**, so UI must optimize bulk filling and URL state must compress duplicates efficiently.
- Component is part of a **larger builder** and **does not render its own Submit**; it **emits** changes.

---

## Tech & Libraries
- **React** (latest) with **TypeScript**.
- **MUI X Data Grid Pro/Premium** (licensed) for range selection, virtualization, clipboard features.
- **Luxon** for date/time; zone = `Europe/Copenhagen`.
- **next‑intl** for i18n; all strings externalized.
- **Sonner** for toasts (errors/info).
- **nuqs** for URL/query‑string state management (short keys + custom parsers).
- **pako** for in‑browser deflate/inflate (compression of URL payloads).

---

## Stakeholder Decisions (Confirmed)
- **Unit**: `kWh` (display & summaries).
- **Max value per step**: `100,000` (safety cap; overrideable via prop).
- **Values**: **integers ≥ 0** (no decimals).
- **Direction**: `entry` | `exit` used for **prefill key** and included on **submit**; **no validation differences**.
- **Prefill source**: last submitted nomination for **exact** tuple `(week, direction, resolution)`.
- **Partial prefill**: missing steps default to **0**.
- **Clipboard/CSV**: auto‑detect delimiters (comma/semicolon/tab); accept decimal comma for parsing but **reject decimals**; values must be integers.
- **DST fall‑back labeling**: duplicate hour shown **twice** with **offset badges** (e.g., `02:00 (+02)`, `02:00 (+01)`).
- **Default week**: **current ISO week** (Mon–Sun) even if some steps are in the past.
- **Editable scope (partial weeks allowed)**: cannot edit **past steps**; for **today**, editing allowed only **from the end of the current hour + lead time** onward.
- **Lead time**: configurable prop `leadTimeHours` (**default 2h**). Example: at `16:15`, first editable step is `18:00`.
- **Resolutions**: **5, 15, 30, 60 minutes**; each gas day is divisible by the chosen resolution.
- **Theming**: existing MUI theme; follow standard good‑practice a11y.
- **Toasts**: `toast.error("failed to prefill nomination")` on prefill failure.
- **Submission flow**: component **emits** `onChange`; parent persists.
- **Past display**: show **prior values (read‑only)** if they exist; else **0**.
- **URL state (nuqs)**: short keys `w, dir, r, lt, d`; `d` is **compressed diffs** with RLE and optional binary upgrade; omit `d` if payload too large.

---

## Glossary & Time Model
- **Calendar day**: local date (00:00 → 24:00) in `Europe/Copenhagen`.
- **Gas day**: local interval `[06:00, next day 06:00)`.
- **Resolution**: size of one step; **5/15/30/60 min**.
- **DST**: Daylight Saving Time changeovers cause **23‑hour** or **25‑hour** gas days.
- **Lead time**: hours after the **end** of the current local hour before a step becomes editable.

---

## UX Overview
- **Week Selector**: date‑picker that snaps to ISO week; shows the week number.
- **Direction Toggle**: `entry` vs `exit` (ToggleButtonGroup).
- **Resolution Selector**: choose 5/15/30/60 minutes; grid recalculates steps.
- **Editable Grid**: 7 rows (Mon–Sun). Columns are dynamic time steps from 06:00 local to next‑day 06:00 local; per day **23/24/25 hours × (60 / resolution)**.
- **Bulk tools**: range selection, Fill Dialog (constant/copy previous/ramp/repeat), drag‑fill, copy/paste.
- **Reset**: per cell/day/week to baseline or 0.
- **Summaries**: per‑day and weekly totals in kWh.
- **Read‑only past**: display previous values with a lock glyph and tooltip explaining cutoff.

---

## Functional Requirements

### 6.1 Week Selection
- Control: **MUI X DateCalendar/DatePicker** (single date); internal logic snaps to **ISO week**.
- Display selected week’s **Monday 00:00 local** start and **ISO week number**.
- Changing week triggers step generation, prefill fetch, and URL param update (`w`).

### 6.2 Resolution
- Prop `resolutionMinutes`: **5 | 15 | 30 | 60**.
- Validate divisibility of each gas day’s **minute length** by `resolutionMinutes`.
- Example step counts: at **5‑minute** resolution → 23h: **276**, 24h: **288**, 25h: **300** steps.

### 6.3 Time‑Step Generation (Luxon)
- For each local **gas day** in the week: construct `[D@06:00, D+1@06:00)` in `Europe/Copenhagen`.
- Iterate by **local** time steps; Luxon handles nonexistent/ambiguous times.
  - **Spring forward (23h)**: missing local hour is skipped → fewer steps.
  - **Fall back (25h)**: duplicated local hour appears **twice**; we disambiguate with offset badges.
- For every step generate `{ startLocal, endLocal, startUTC, endUTC, offsetMinutes }` + a **global index `g`** (see §9.2).
- Grid labels: show **local** `HH:mm` (with offset badge on duplicate hours); tooltip includes UTC interval and offset.

### 6.4 Data Model & I/O (Types)

```ts
// ---- Primitive domain types ----
export type Direction = 'entry' | 'exit';
export type StepValue = number; // integer ≥ 0

export interface PreviousNominationStep {
  startUTC: string; // ISO
  endUTC: string;   // ISO
  value: StepValue; // integer ≥ 0
}

// ---- Component props ----
export interface NominationGridProps {
  weekAnchor: string;                // ISO date within the week (local, Europe/Copenhagen)
  direction: Direction;              // 'entry' | 'exit'
  resolutionMinutes: 5 | 15 | 30 | 60;
  unit?: 'kWh';                      // fixed to kWh for now
  maxValue?: number;                 // defaults to 100000 (kWh)
  leadTimeHours?: number;            // defaults to 2

  // Prefill callback (parent-provided)
  fetchPreviousNomination?: (args: {
    direction: Direction;
    weekStartLocalISO: string;       // Monday 00:00 local ISO
    resolutionMinutes: number;
  }) => Promise<PreviousNominationStep[]>;

  // Outputs
  onChange?: (payload: NominationSubmission) => void; // debounced (~300ms)
  onValidate?: (report: ValidationReport) => void;

  // Testing/override hooks
  nowISO?: string; // optional injection for "current time" (UTC ISO) to compute editability
}

// ---- Emitted submission payload ----
export interface NominationSubmission {
  direction: Direction;
  resolutionMinutes: number;
  weekStartLocalISO: string;         // Monday 00:00 local
  days: Array<{
    dateLocalISO: string;            // YYYY-MM-DD (local day)
    steps: Array<{
      startUTC: string;
      endUTC: string;
      value: StepValue;
      source: 'user' | 'previous' | 'default';
      editable: boolean;             // false for past steps
      labelLocal: string;            // e.g., "02:00 (+02)"
      g: number;                     // global step index for URL diffs
    }>;
    dayTotal: number;
    editable: boolean;               // day-level gate
  }>;
  weekTotal: number;
}

export interface ValidationReport {
  issues: Array<{
    level: 'error' | 'warning';
    code: 'NEGATIVE' | 'NAN' | 'DECIMAL' | 'EXCEEDS_MAX' | 'PAST_EDIT' | string;
    message: string;
    context?: Record<string, unknown>;
  }>;
}
```

### 6.5 Prefill & Baseline
- On mount and on changes to `(weekAnchor, direction, resolutionMinutes)`, call `fetchPreviousNomination` (if provided).
- Build a **baseline map** keyed by `startUTC|endUTC` for alignment.
- For each generated step: `currentValue = baselineValue ?? 0`.
- Track `source: 'previous' | 'default' | 'user'` and render an override indicator when `user`.
- **Reset** actions:
  - **Cell** → revert to `baselineValue ?? 0`.
  - **Day/Week** → bulk revert selection; include top‑level **Revert all to baseline** action.

### 6.6 Editing & Bulk Tools
- **Single cell edit**: numeric filter/input; enforce **integer ≥ 0** and **≤ maxValue**.
- **Range selection + Fill Dialog** options:
  1) **Set constant** integer.
  2) **Copy previous** nomination into selection.
  3) **Linear ramp** (integer): interpolate start→end over N cells, `Math.round`, enforce bounds; **reject** if any > `maxValue`.
  4) **Repeat pattern**: comma/space/semicolon‑separated integers tiled across selection.
- **Copy/Paste**: accept CSV/TSV; auto‑detect delimiter; accept decimal comma for parsing but **reject decimals**.
- **Drag‑fill** handle; **Undo/Redo** ≥ 20 steps.
- **Editability gating** (see §8): only steps with `startLocal >= cutoffLocal` are editable; older steps locked.

### 6.7 Validation
- Reject negative, non‑integer, NaN, Infinity ⇒ errors rendered in‑cell + in `onValidate`.
- Enforce `maxValue` (default **100000**); **ramp** operations that exceed this are **rejected** (list offending cells/indices).
- Block emitting `onChange` for invalid edits.

### 6.8 Summaries & UI Polish
- **Sticky** first column (day/date) and **pinned** day total column.
- **Weekly total** in a footer; live updates.
- **Tooltips** show local time, UTC interval, offset.
- **Virtualization** for columns/rows; smooth at 5‑min resolution.
- **High‑contrast** focus, keyboard navigation end‑to‑end.

### 6.9 Direction Toggle
- **ToggleButtonGroup** for `entry` vs `exit`; affects prefill key and payload only.

### 6.10 Output & Events
- No internal **Submit** button.
- `onChange` (debounced ~300ms) emits the full `NominationSubmission` (values in **UTC**), including read‑only steps with `editable=false`.
- `onValidate` emits aggregate issues when they arise.

### 6.11 Error & Empty States
- **Prefill failure**: `toast.error('failed to prefill nomination')`; default zeros; user can continue editing future steps.
- **Invalid resolution**: surface error and block.
- **Week entirely in the past**: show info banner; grid disabled.

---

## Edge Cases
- **Spring forward** (23‑hour gas day): step count shrinks; missing hour handled.
- **Fall back** (25‑hour gas day): duplicated hour; display both with offset badges; unique UTCs.
- **Week spanning DST change**: per‑row column counts differ; grid must support variable counts.
- **Today mid‑gas‑day**: steps earlier than `cutoffLocal` are read‑only; later are editable.
- **Partial prefill**: default to 0; do not resample.
- **Paste** into read‑only cells: skip silently, apply to editable cells only.
- **Large fills**: ensure performance and adherence to `maxValue`.

---

## Algorithms (Luxon & Indexing)

```ts
import { DateTime, Interval } from 'luxon'

const ZONE = 'Europe/Copenhagen'

export function nowLocal(nowISO?: string) {
  return nowISO ? DateTime.fromISO(nowISO, { zone: ZONE }) : DateTime.now().setZone(ZONE)
}

export function computeCutoffLocal(now: DateTime, leadTimeHours = 2) {
  // Editability cutoff = end of current hour + lead time
  return now.startOf('hour').plus({ hours: leadTimeHours })
}

export function gasDayInterval(dayLocal: DateTime) {
  return Interval.fromDateTimes(
    dayLocal.set({ hour: 6, minute: 0, second: 0, millisecond: 0 }),
    dayLocal.plus({ days: 1 }).set({ hour: 6, minute: 0, second: 0, millisecond: 0 })
  )
}

export function* stepsForGasDay(dayStartLocal: DateTime, resolutionMinutes: number) {
  let t = dayStartLocal
  const end = dayStartLocal.plus({ days: 1 })
  while (t < end) {
    const next = t.plus({ minutes: resolutionMinutes })
    if (next <= end) {
      yield {
        startLocal: t,           // DateTime in ZONE
        endLocal: next,          // DateTime in ZONE
        startUTC: t.toUTC(),     // DateTime UTC
        endUTC: next.toUTC(),    // DateTime UTC
        offsetMinutes: t.offset, // number
      }
    }
    t = next.setZone(ZONE, { keepCalendarTime: true })
  }
}

export function generateWeekSteps(mondayLocal: DateTime, resolutionMinutes: number) {
  const days: ReturnType<typeof stepsForGasDay>[] = []
  const all = [] as Array<ReturnType<typeof stepsForGasDay> extends Generator<infer T> ? T : never>
  let g = 0
  for (let i = 0; i < 7; i++) {
    const start = mondayLocal.plus({ days: i }).set({ hour: 6, minute: 0, second: 0, millisecond: 0 })
    const daySteps: any[] = []
    for (const s of stepsForGasDay(start, resolutionMinutes)) {
      (s as any).g = g++
      daySteps.push(s)
      all.push(s as any)
    }
    ;(days as any).push(daySteps)
  }
  return { days, all, totalSteps: g }
}
```

- **Editability**: a step is editable iff `step.startLocal >= cutoffLocal`.
- **Labels**: `labelLocal = HH:mm` with `(+02)/(+01)` suffix when needed.

---

## URL State (nuqs) — Compression & Diffs

### 9.1 Keys & What We Store
- **Short keys** via `urlKeys`:
  - `w` = week anchor (local ISO date within the week)
  - `dir` = direction (`entry`|`exit`)
  - `r` = resolution (5|15|30|60)
  - `lt` = lead time hours (omit when default 2)
  - `d` = diffs payload (compressed)

- **State content**:
  - We store **diffs‑only** vs **baseline** (baseline = last submitted nomination for tuple `(w, dir, r)`).
  - **Do not store timestamps**; steps are referenced by **global index `g`**.

### 9.2 Global Step Indexing
- Build a weekly step list with deterministic order (Mon→Sun; within day: 06:00→06:00 by resolution), producing `g = 0..N-1`.
- DST days naturally alter per‑day counts, but global order is linear and fixed by generation.

### 9.3 Format v1 — JSON + RLE + Deflate
- Because nominations often repeat, we compress **consecutive changed steps with the same value** into runs: `[gStart, len, value]`.
- **Schema**:

```ts
// Before compression: JSON
{
  v: 1,
  runs: Array<[gStart: number, len: number, value: number]>
}
```

- Then **deflate** (pako) → **base64url** → assign to `?d=`.
- Example: `100 kWh` for 12 hours at 5‑min (144 steps) from global index 432 → one run `[432, 144, 100]`.

### 9.4 Format v2 — Binary + Delta + VLQ
- If v1 compressed payload exceeds threshold (see §9.7), we auto‑upgrade to **v2**:
  - Sort runs by `gStart`.
  - Store **delta** from previous run end (`gStart - (prevGStart + prevLen)`), `len`, and `value` as **VLQ** (variable‑length, 7 bits per byte, MSB continuation).
  - Prepend a **version byte** (e.g., `0x02`).
  - Deflate bytes → base64url → `?d=`.
- v2 yields 30–60% savings over v1 JSON when there are many small runs.

### 9.5 nuqs Parsers & Wiring

```ts
import { useQueryStates, parseAsIsoDate, parseAsStringLiteral, parseAsNumberLiteral, parseAsInteger } from 'nuqs'
import { createParser } from 'nuqs'
import { deflate, inflate } from 'pako'

const te = new TextEncoder()
const td = new TextDecoder()

const b64url = {
  enc: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
  dec: (s: string) => {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
    const bin = atob(s.replace(/-/g,'+').replace(/_/g,'/') + pad)
    const out = new Uint8Array(bin.length)
    for (let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i)
    return out
  }
}

// v1 JSON shape
export type DiffRunsV1 = { v: 1; runs: [number, number, number][] }
// v2 binary (already deflated & b64url in payload by our encoder)
export type DiffRunsV2 = { v: 2; payload: string }

export const parseAsCompressedDiffs = createParser<DiffRunsV1 | DiffRunsV2>({
  parse: (value) => {
    try {
      const bytes = b64url.dec(value)
      const json = td.decode(inflate(bytes))
      const obj = JSON.parse(json)
      if (obj && obj.v === 1 && Array.isArray(obj.runs)) return obj as DiffRunsV1
      if (obj && obj.v === 2 && typeof obj.payload === 'string') return obj as DiffRunsV2
      // If it's not JSON, treat unknown as absent
      return null
    } catch {
      return null
    }
  },
  serialize: (obj) => {
    if (obj.v === 1) {
      const json = JSON.stringify(obj)
      const bytes = deflate(te.encode(json), { level: 9 })
      return b64url.enc(bytes)
    }
    // v2: already encoded payload
    return obj.payload
  },
  eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
})

export function useUrlState() {
  return useQueryStates(
    {
      week: parseAsIsoDate, // local date-only
      direction: parseAsStringLiteral(['entry','exit']).withDefault('entry'),
      res: parseAsNumberLiteral([5,15,30,60]).withDefault(60),
      leadTime: parseAsInteger.withDefault(2),
      diffs: parseAsCompressedDiffs.withDefault({ v: 1, runs: [] }),
    },
    {
      urlKeys: { week: 'w', direction: 'dir', res: 'r', leadTime: 'lt', diffs: 'd' },
    }
  )
}
```

### 9.6 Encoding/Decoding Algorithms

**Build Runs (v1):**
```ts
interface Step { g: number; value: number; baseline: number; editable: boolean }

export function buildRunsV1(steps: Step[]) {
  const runs: [number, number, number][] = []
  let runStart = -1, runLen = 0, runVal = -1, lastG = -1
  for (const s of steps) {
    if (s.value === s.baseline) { // unchanged → flush if needed
      if (runLen > 0) { runs.push([runStart, runLen, runVal]); runStart = -1; runLen = 0 }
      continue
    }
    if (runLen > 0 && s.g === lastG + 1 && s.value === runVal) {
      runLen++
    } else {
      if (runLen > 0) runs.push([runStart, runLen, runVal])
      runStart = s.g
      runLen = 1
      runVal = s.value
    }
    lastG = s.g
  }
  if (runLen > 0) runs.push([runStart, runLen, runVal])
  return { v: 1 as const, runs }
}
```

**Apply Runs:**
```ts
export function applyRuns(base: number[], runs: [number, number, number][]) {
  const out = base.slice()
  for (const [g, len, val] of runs) {
    for (let i = 0; i < len; i++) out[g + i] = val
  }
  return out
}
```

**Binary v2 (outline):**
```ts
// Uses VLQ encoding for non-negative integers.
// Encode sequence of (deltaFromPrevEnd, len, value) triples.

function encodeVLQ(n: number): number[] {
  const bytes: number[] = []
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; bytes.push(b) } while (n)
  return bytes
}

export function encodeV2(runs: [number, number, number][]) {
  const bytes: number[] = [0x02] // version tag
  let prevEnd = 0
  for (const [g, len, val] of runs) {
    const delta = g - prevEnd
    bytes.push(...encodeVLQ(delta), ...encodeVLQ(len), ...encodeVLQ(val))
    prevEnd = g + len
  }
  // deflate + b64url
  const deflated = deflate(new Uint8Array(bytes), { level: 9 })
  const payload = b64url.enc(deflated)
  return { v: 2 as const, payload }
}
```

### 9.7 URL Size Safeguards
- Attempt v1; if `?d=` **> 1,500 chars**, auto‑upgrade to v2; if still large, **omit `d`** and keep only primitives (`w, dir, r, lt`).
- Throttle URL updates on rapid edits; batch set operations.
- In **dev**: show a tiny meter (off in prod) with current encoded size and v1/v2/omitted state.

---

## Architecture & Components
- **NominationGrid** (container): week/resolution/direction state, URL sync, prefill, step gen, editability gating, totals, validation, emitters.
- **WeekSelector**: MUI DatePicker/Calendar; snaps to ISO week; shows week number.
- **ControlsBar**: resolution selector, direction toggle, lead‑time readout (if not default), quick actions, shortcuts help.
- **GridView**: MUI X Data Grid **Premium** — range selection, virtualization, pinned columns, column groups.
- **FillDialog**: constant/copy previous/ramp/repeat; validates and commits bulk edits.
- **TotalsFooter**: week total; per‑day totals appear in pinned column.

---

## Implementation Details
- **Rows**: one per calendar day; row `id` = `YYYY‑MM‑DD` (local).
- **Columns**:
  - Pinned left: `day` (weekday + date), `dayTotal`.
  - Time step columns: generate up to the **maximum** steps across the 7 gas days; cells beyond a day’s step count are disabled.
  - Column groups: per day header with `06:00 → 06:00` sublabel; fall‑back day shows offset badges over duplicates.
- **Cell renderer**: numeric input with strict integer filtering; tooltip shows local and UTC interval.
- **Range selection**: across day boundaries; FillDialog activates when selection present.
- **Keyboard**: arrows, Shift+arrows (range), Enter commit, Esc cancel, `Ctrl/Cmd+Z` undo, `Shift+Z` redo, `=` open FillDialog.
- **Undo/Redo**: reducer with history ring buffer (≥ 50 ops for safety; spec minimum 20).
- **Number parsing**: strip thousands separators; if decimal comma present → invalid (DECIMAL).
- **Paste parsing**: detect delimiter by first line; support comma/semicolon/tab; blank cells ignored unless “fill empties only”.
- **Read‑only visualization**: lock glyph; muted text; tooltip with exact cutoff time.
- **Dirty state**: banner/icon when any editable cell differs from baseline; afford **Revert all to baseline**.

---

## i18n
- Use **next‑intl** message keys, e.g.:
  - `grid.labels.day`, `grid.labels.dayTotal`, `grid.labels.weekTotal`
  - `grid.actions.fill`, `grid.actions.resetDay`, `grid.actions.resetWeek`, `grid.actions.revertBaseline`
  - `grid.errors.decimal`, `grid.errors.max`, `grid.errors.nan`, `grid.errors.negative`
  - `grid.tooltips.lockedUntil`, `grid.tooltips.localUtcOffset`
- Respect locale number formatting for **readouts**; inputs remain numeric (ASCII digits) to ensure consistent parsing.

---

## Accessibility
- DataGrid ARIA applied; ensure accessible names for day groups and step columns.
- Focus ring visibly distinct; error/invalid state announced where possible.
- Complete **keyboard navigation**; ensure range selection via keyboard.

---

## Testing Plan
**Unit tests**
- Step generation for weeks containing **2025‑03‑30** (spring forward, 23h) and **2025‑10‑26** (fall back, 25h).
- Editability cutoff with `leadTimeHours` = 2 (default) and other values; examples at odd times (e.g., 16:15 → first editable 18:00).
- Validators: integer only, ≥0, ≤100000; ramp overflow rejection.
- URL encoders: v1 RLE build/apply; v2 delta+VLQ; base64url; omission when over threshold.

**Integration (Playwright/Cypress)**
- Range select → Fill Dialog (constant/ramp/repeat) → apply.
- Paste CSV/TSV (comma/semicolon/tab) with decimal commas (rejected); ensure read‑only cells skipped silently.
- Reset cell/day/week; Revert all to baseline.
- Change week/resolution/direction; diffs cleared appropriately.
- Prefill failure path → Sonner toast; grid remains usable.
- URL sync behavior including size meter in dev and omission when over threshold.

**Performance**
- 5‑minute resolution with a 25‑hour gas day (300 columns) across the week; keystroke latency target **< 16 ms**; smooth scroll/edit.

---

## Storybook Scenarios
- **Default** (current ISO week, 60‑min resolution, entry).
- **Spring forward** week (23h) @ 15‑min; visible missing hour.
- **Fall back** week (25h) @ 5‑min; duplicated 02:00 with offset badges.
- **Mid‑week (Wednesday 16:15)** with lead‑time gating → first editable at 18:00.
- **Entire past week**: disabled grid with info banner.
- **Prefill missing gaps** → zeros (partial prefill).
- **URL size demo** (dev): v1 → v2 → omit threshold transitions.

---

## Performance Targets
- Typing latency **< 16 ms** on mid‑range laptop for 5‑min resolution scenarios.
- Memory footprint stable under heavy runs; avoid quadratic operations over columns.
- Debounce `onChange` ~300 ms; throttle URL writes.

---

## Concurrency & Conflicts
- No backend versioning required now.
- Optional future: include `version`/ETag in prefill; parent checks on save and prompts to refresh if stale.

---

## Visual Polish
- Offset badges on fall‑back duplicated hours.
- Lock glyph on read‑only cells; hover tooltip explains cutoff (exact local timestamp).
- Dirty indicator when edits differ from baseline.

---

## Deliverables
- `NominationGrid` component (TypeScript), props/types as specified.
- URL‑state utilities: `encodeDiffs` / `decodeDiffs` (v1 + v2), `parseAsCompressedDiffs` parser, `useUrlState` hook, short key wiring.
- Storybook stories for all scenarios above.
- Unit & Integration test suites; performance smoke tests.
- Minimal Next.js demo page with `next‑intl`, `Sonner`, and mocked `fetchPreviousNomination`.
- Internal docs: step computation, DST notes, editability rules, URL compression strategy.

---

## Acceptance Criteria
- **Correct step counts** per gas day for **23/24/25‑hour** cases at **5/15/30/60** minutes.
- **Values** are **integers ≥ 0** and **≤ 100000**; invalid inputs rejected inline.
- **Reset** works at cell/day/week levels; **Revert all to baseline** works.
- **Prefill** aligns by UTC step boundaries using **last submitted nomination for exact week/direction/resolution**.
- **Editability gating**: only steps with local start ≥ **end of current hour + `leadTimeHours`** are editable; others read‑only.
- **Past display**: prior values read‑only if exist; else 0.
- **URL state**: `w, dir, r, lt` primitives + `d` diffs compressed; v1→v2 auto‑upgrade; **omit `d`** if > 1,500 chars.
- **A11y**: keyboard/nav/readability satisfactory.
- **Performance**: smooth at 5‑min resolution; latency target met.
- **i18n**: all strings externalized; number formatting respected for readouts.

---

## Non‑Functional Requirements
- Robust against partial network failures (prefill errors → toast; editing still allowed for future steps).
- Stable determinism in weekly step indexing (critical for URL diffs).
- No PII in URL; values are numeric; `d` is compressed and safe.

---

## Build & Project Setup
**Dependencies**
- `@mui/material`, `@mui/x-data-grid-pro` or `@mui/x-data-grid-premium`
- `luxon`
- `next-intl`
- `sonner`
- `nuqs`
- `pako`

**Installation**
```bash
pnpm add @mui/material @mui/x-data-grid-premium luxon next-intl sonner nuqs pako
```

---

## Folder Structure
```
src/
  components/
    NominationGrid/
      NominationGrid.tsx
      GridView.tsx
      WeekSelector.tsx
      ControlsBar.tsx
      FillDialog.tsx
      TotalsFooter.tsx
      urlState.ts (nuqs parsers, encode/decode)
      time.ts (Luxon utilities)
      validation.ts
      types.ts
  stories/
    NominationGrid.stories.tsx
  tests/
    unit/
    integration/
  pages/
    demo/
      nominations.tsx
```

---

## Code Style & Conventions
- Strict TypeScript (`strict: true`), ESLint + Prettier.
- React function components; hooks for state.
- Keep Luxon `DateTime` objects immutable; don’t mutate in place.
- Avoid inline functions in heavy render paths; memoize column models.

---

## Examples

### Example: Prefill steps (excerpt)
```json
[
  { "startUTC": "2025-03-31T04:00:00Z", "endUTC": "2025-03-31T05:00:00Z", "value": 100 },
  { "startUTC": "2025-03-31T05:00:00Z", "endUTC": "2025-03-31T06:00:00Z", "value": 100 }
]
```

### Example: onChange payload (excerpt)
```json
{
  "direction": "entry",
  "resolutionMinutes": 60,
  "weekStartLocalISO": "2025-03-31T00:00:00+02:00",
  "days": [
    {
      "dateLocalISO": "2025-03-31",
      "editable": true,
      "dayTotal": 2400,
      "steps": [
        {
          "g": 0,
          "labelLocal": "06:00",
          "editable": false,
          "startUTC": "2025-03-31T04:00:00Z",
          "endUTC": "2025-03-31T05:00:00Z",
          "value": 100,
          "source": "previous"
        }
      ]
    }
  ],
  "weekTotal": 16800
}
```

### Example: URL diffs (v1 pre‑compression JSON)
```json
{ "v": 1, "runs": [[432, 144, 100], [900, 24, 80]] }
```

---

## Appendix: Gas Day Overview

**Gas day vs UTC (Europe/Copenhagen):**

| Local gas day (06:00 → 06:00) | UTC span              | Time of year                            |
|---|---|---|
| 06:00 → 06:00                 | 05:00 → 05:00         | During standard time (winter) — 24h gas day |
| 06:00 → 06:00                 | 05:00 → **04:00**     | Change from standard → daylight saving — **23h** gas day |
| 06:00 → 06:00                 | 04:00 → 04:00         | During daylight saving time — 24h gas day |
| 06:00 → 06:00                 | 04:00 → **05:00**     | Change from daylight saving → winter — **25h** gas day |

> The component always **displays local time** and **stores/returns UTC**. On fall‑back days, duplicate `02:00` appears **twice** with `(+02)` and `(+01)` badges.

