# ANTIGRAVITY IMPLEMENTATION PROMPT 1 — PROJECT FOUNDATION & CALCULATION ENGINE

**Project:** GST Ledger — internal GST purchase & sales register for A.M Machine Tool and Dies
**Prompt:** 1 of ~12
**Scope:** Foundation only. **Do not build purchase, sales, party, or report screens in this prompt.**

---

## 1. OBJECTIVE

Build the project skeleton and the **money + GST calculation engine**, fully unit-tested, with a working
database layer, migration system, backup routine, and an application shell that proves all of it runs.

At the end of this prompt the application must launch, create its database, run migrations, seed the
Indian state master, and display a single **System Check** screen showing database version, record counts,
last backup time, and a live calculation demo. Nothing else.

The calculation engine is the highest-risk part of this entire project. It is being built first, alone,
with exhaustive tests, because every rupee the business reports depends on it. Treat the test vectors in
section 11 as a contract, not as examples.

---

## 2. BUSINESS CONTEXT

A.M Machine Tool and Dies is a machine tools and dies business in Ghaziabad, Uttar Pradesh, India.
Every month the proprietor hand-writes an 8-page GST register: purchase bills grouped by supplier, sale
bills grouped by branch, and a summary page computing net GST payable.

The July 2026 register has been transcribed and every total re-verified. It reconciles exactly:
output GST ₹13,30,677 − input credit ₹6,04,564 = net payable ₹7,26,113. But the exercise also found a
₹20 transcription error on the summary page, a mislabelled supplier subtotal, and four bills where the
recorded GST differs by ₹1 from what the company's own rounding rule produces. Those are precisely the
errors this software exists to eliminate.

Two facts drive the design of this foundation:

1. **Money must never be a floating-point number.** ₹0.1 + ₹0.2 ≠ ₹0.3 in IEEE-754. Financial records
   that use `float`/`double`/JS `number` for currency accumulate silent drift. All money is stored and
   computed as **integer paise**.

2. **The company uses a non-standard rounding rule.** When a GST calculation lands on exactly `.5`, the
   company rounds **down**. Standard rounding — and Section 170 of the CGST Act — rounds `.5` **up**.
   This is a deliberate, known divergence. The engine must implement the company rule explicitly and
   make it configurable. Do not substitute `Math.round`, `toFixed`, `Number.prototype.toPrecision`, or
   any language-default rounding anywhere in this codebase.

---

## 3. TECHNICAL REQUIREMENTS

### 3.1 Stack

| Concern        | Choice                                   | Non-negotiable reason                                                                                                           |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Shell          | **Electron** (latest stable)             | Runs offline on the office Windows PC; bundled Chromium gives exact print-to-PDF fidelity, which the reporting phase depends on |
| Language       | **TypeScript**, `strict: true`           | Money-type safety is enforced at compile time                                                                                   |
| UI             | **React 18+** + **Vite**                 | Renderer only                                                                                                                   |
| Database       | **SQLite** via **better-sqlite3**        | Single file, ACID, WAL, backed up by copying one file                                                                           |
| Schema/queries | **Drizzle ORM** + Drizzle Kit migrations | Typed schema, plain SQL migrations kept in the repo                                                                             |
| Tests          | **Vitest**                               | Engine tests must run without Electron                                                                                          |
| Lint/format    | ESLint + Prettier                        |                                                                                                                                 |

Do not add a state-management library, UI component library, CSS framework, or ORM other than the above
in this prompt. Do not add any cloud, network, telemetry, or auto-update dependency. The application must
function with the network cable unplugged, permanently.

### 3.2 Layering — enforced, not aspirational

```
gst-ledger/
  packages/
    core/          ← PURE domain + calculation engine. ZERO runtime dependencies.
                     No I/O, no Node APIs, no Electron, no DB, no React, no dates-from-system-clock.
                     Every function pure and deterministic.
    data/          ← Drizzle schema, migrations, repositories, backup service.
                     Depends on: core. May use node:fs, better-sqlite3.
    app/           ← Electron main process, services, IPC contract, application config.
                     Depends on: core, data.
    ui/            ← React renderer. Depends on: core (types + formatting only).
                     MUST NOT import from data or app directly — only via the typed IPC client.
  package.json     ← workspaces
```

Add an ESLint rule (`eslint-plugin-import` `no-restricted-paths` or equivalent) that **fails the build**
if `core` imports anything, or if `ui` imports from `data`. State in your report that this rule is active
and show it failing on a deliberate violation.

### 3.3 Money representation

Create in `core` a nominal type so a raw number can never be passed where money is expected:

```ts
export type Paise = bigint & { readonly __brand: unique symbol };
export const paise = (n: bigint): Paise => n as Paise;
```

- Storage in SQLite: `INTEGER` columns, always named with a `_paise` suffix.
- In-engine arithmetic: `bigint`.
- Crossing the IPC boundary: serialise as a **decimal string** (`"1330677.00"`), never as a JS number.
  `structuredClone` handles `bigint`, but the string form is explicit and survives logging and export.
- Parsing: a single `parseAmountToPaise(input: string): Result<Paise, AmountError>` that accepts
  `"182644"`, `"1,82,644"`, `"1,82,644.00"`, `"₹1,82,644"`, `" 182644 "`, and rejects more than two
  decimal places, multiple decimal points, and non-numeric characters.
- Formatting: `formatPaise(p, opts)` producing **Indian digit grouping** — `12,34,567.00`, not
  `1,234,567.00`. Two-two-three grouping. This is used everywhere in the UI and every report.

### 3.4 Determinism

`core` must never read the system clock, the locale, the filesystem, or `Math.random`. Any function that
needs "today" takes it as a parameter. This is what makes the engine testable and the reports reproducible.

---

## 4. BUSINESS RULES TO IMPLEMENT IN `core`

### 4.1 Amount relationship

The user enters **Total Amount** (inclusive of GST) and **GST Amount**. The application derives:

```
Bill Amount (amount before GST) = Total Amount − GST Amount
```

The company calls the pre-GST figure the **"Bill Amount"**; GST law calls it the **taxable value**. Use
`taxableAmountPaise` as the internal field name and display the label **"Bill Amount (before GST)"** in
any UI. Do not rename the user-facing term.

### 4.2 The company rounding rule — `roundToRupeeHalfDown`

Rounds a paise amount to a whole number of rupees:

- fractional part **less than** ₹0.50 → round **down**
- fractional part **exactly** ₹0.50 → round **down** ← the company-specific part
- fractional part **greater than** ₹0.50 → round **up**

Reference implementation (implement exactly this behaviour):

```ts
export function roundToRupeeHalfDown(amount: Paise): Paise {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const rem = abs % 100n;
  const base = abs - rem;
  const r = rem <= 50n ? base : base + 100n;
  return paise(neg ? -r : r);
}
```

**Negative amounts round on magnitude**, then the sign is re-applied: −₹123.50 → −₹123, −₹123.60 → −₹124.
This keeps a future credit note symmetrical with the invoice it reverses. Document this choice in a code
comment; it is a decision, not an accident.

### 4.3 Expected tax at a rate — `expectedTaxPaise`

Given a taxable amount in paise and a rate in **basis points** (18% = `1800`), compute the tax the rate
would produce under the company rounding rule, with no floating point anywhere:

```ts
export function expectedTaxPaise(taxable: Paise, rateBps: bigint): Paise {
  const N = taxable * rateBps; // value in rupees = N / 1_000_000
  const R = (2n * N + 1_000_000n - 1n) / 2_000_000n; // = ceil(N/1e6 − 0.5), i.e. half-DOWN
  return paise(R * 100n);
}
```

This formula has been validated against every bill in the July 2026 register (section 11). Do not
"simplify" it to `Number(taxable) * rate / 100`.

Rates are stored as **basis points integers**, never as `0.18`. 18% = `1800`, 5% = `500`, 40% = `4000`,
0% = `0`.

### 4.4 Tax variance — `taxVariancePaise`

```
variance = enteredTaxPaise − expectedTaxPaise(taxableAmountPaise, primaryRateBps)
```

Computed and **stored** on every bill that has a primary rate. This is a cross-check, **never an
auto-correction**. The engine must never overwrite what the user typed. Rationale: the GST figure printed
on a supplier's invoice is what will appear in the company's GSTR-2B on the GST portal, and input tax
credit must match the portal — so the supplier's figure is authoritative even when it disagrees with our
arithmetic by a rupee. The variance exists to surface the disagreement, not to resolve it.

Severity bands (thresholds configurable in settings, these are the defaults):

| |variance| | Severity | Behaviour |
|---|---|---|
| `0` | none | no indication |
| `≤ ₹2` | `INFO` | quiet inline hint next to the field |
| `≤ ₹100` | `WARN` | visible warning; save allowed; bill appears on the Exceptions report |
| `> ₹100` | `CONFIRM` | save requires an explicit confirmation and a stored note |

### 4.5 Supply type classification — `classifySupply`

```ts
classifySupply({ counterpartyStateCode, ourStateCode }): 'INTRA' | 'INTER'
```

- codes equal → `INTRA` (CGST + SGST)
- codes differ → `INTER` (IGST)

State code is the **first two characters of the GSTIN** when a GSTIN is present (`09` = Uttar Pradesh,
`07` = Delhi). If a GSTIN is present _and_ a state was selected manually and they disagree, return a
validation error — never silently pick one.

The company's own state is **not hard-coded**. It is read from the configured organisation unit, which
defaults to Uttar Pradesh (`09`). This must be changeable in settings without touching code.

### 4.6 CGST / SGST split — `splitIntraStateTax`

For an `INTRA` bill with total tax `T` and taxable `X` at rate `R`:

```
cgst = roundToRupeeHalfDown(expectedTax(X, R/2))
sgst = T − cgst
```

`sgst` is derived by subtraction so that `cgst + sgst === T` **always**, with no possibility of a ₹1 gap
appearing in a report. If `|cgst − sgst| > ₹1`, set a `SPLIT_ASYMMETRY` flag on the result for the
Exceptions report.

For `INTER`: `igst = T`, `cgst = sgst = 0n`.

### 4.7 Financial year — `financialYearOf`

Indian financial year runs **1 April – 31 March**. `financialYearOf('2026-07-01') === '2026-27'`;
`financialYearOf('2026-03-31') === '2025-26'`. Pure function, takes an ISO date string, no clock access.
Duplicate-bill detection in a later prompt keys on financial year, so this must be exact.

### 4.8 Bill number normalisation — `normalizeBillNumber`

```
uppercase → strip every character that is not A-Z or 0-9
```

`"GST-1291/26-27"` → `"GST12912627"`, `"KNC/26-27/2448"` → `"KNC26272448"`,
`"4S/1116/26-27 DL"` → `"4S1116" + "2627DL"` → `"4S11162627DL"`.

Used for duplicate detection in a later prompt. Store both the number **as printed** and the normalised
form. Never display the normalised form to the user.

### 4.9 GSTIN validation — `validateGstin`

15 characters: 2-digit state code, 10-character PAN, 1 entity digit, `Z`, 1 checksum character.
Implement the **standard GSTIN checksum** (base-36 weighted, alternating weights 1 and 2, modulo 36).
Return a structured result distinguishing `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_STATE_CODE`,
`INVALID_CHECKSUM`.

Real GSTINs from the register to use as fixtures: `09AAOPI4018G1ZP` (own), `09FBQPS0051B1ZN`
(Durga Metals), `07CKGPK3184B1Z3` (Shivam Enterprises, Delhi → IGST).

> A GSTIN that fails the checksum must produce a **warning, not a hard block** — handwritten GSTINs are
> frequently mistranscribed and the user must still be able to record the bill. Flag it for later cleanup.

---

## 5. DATA MODEL — FOUNDATION SUBSET ONLY

Create only these tables in this prompt. The bill and party tables come in Prompt 2, but the migration
system, conventions, and audit infrastructure must be right before they arrive.

### `schema_migrations`

`version INTEGER PK`, `name TEXT`, `applied_at TEXT`, `checksum TEXT`

Migrations are forward-only, numbered, immutable once committed. On startup, apply pending migrations
inside a transaction; if any fails, roll back and refuse to start with a clear message. **Take an
automatic backup before running any migration.**

### `app_settings`

`key TEXT PK`, `value_json TEXT NOT NULL`, `updated_at TEXT NOT NULL`

Seed with:

| key                     | default              | note                                                   |
| ----------------------- | -------------------- | ------------------------------------------------------ |
| `rounding.rule`         | `"HALF_DOWN"`        | enum `HALF_DOWN` \| `HALF_UP`; `HALF_UP` = Section 170 |
| `rounding.appliesTo`    | `"COMPUTED_ONLY"`    | rounding never alters a figure the user typed          |
| `tax.varianceInfoPaise` | `200`                |                                                        |
| `tax.varianceWarnPaise` | `10000`              |                                                        |
| `org.defaultStateCode`  | `"09"`               | Uttar Pradesh                                          |
| `backup.directory`      | `<userData>/backups` |                                                        |
| `backup.retainCount`    | `30`                 |                                                        |
| `backup.onAppClose`     | `true`               |                                                        |
| `ui.dateFormat`         | `"DD/MM/YYYY"`       | matches the paper register                             |

### `states`

`code TEXT PK` (`'09'`), `name TEXT NOT NULL`, `is_union_territory INTEGER NOT NULL DEFAULT 0`,
`is_active INTEGER NOT NULL DEFAULT 1`

Seed the complete official list of Indian GST state codes `01`–`38`, plus `96` (Foreign country) and
`97` (Other territory). Verify `09` = Uttar Pradesh and `07` = Delhi.

### `tax_rate_profiles`

`id TEXT PK`, `name TEXT NOT NULL`, `rate_bps INTEGER NOT NULL`, `effective_from TEXT NOT NULL`,
`effective_to TEXT NULL`, `is_active INTEGER NOT NULL DEFAULT 1`, `notes TEXT`

Seed with the rate slabs in force since the 22 September 2025 restructuring: `0`, `500` (5%), `1800`
(18%), `4000` (40%), plus `300` (3%) and `25` (0.25%) as inactive. **Rates are data, not code.** No
percentage literal may appear anywhere outside a seed migration.

### `audit_log`

`id TEXT PK`, `entity_table TEXT NOT NULL`, `entity_id TEXT NOT NULL`,
`action TEXT NOT NULL` (`CREATE`|`UPDATE`|`DELETE`|`CANCEL`|`RESTORE`|`PERIOD_CLOSE`|`PERIOD_REOPEN`|`SETTING_CHANGE`),
`before_json TEXT NULL`, `after_json TEXT NULL`, `reason TEXT NULL`, `actor TEXT NOT NULL DEFAULT 'local'`,
`created_at TEXT NOT NULL`

Indexes on `(entity_table, entity_id)` and `(created_at)`. Append-only: create a SQLite trigger that
raises on `UPDATE` or `DELETE` against this table. Build the repository helper now so every later module
writes audit entries by default rather than as an afterthought.

### `backups`

`id TEXT PK`, `file_path TEXT NOT NULL`, `size_bytes INTEGER NOT NULL`, `sha256 TEXT NOT NULL`,
`trigger TEXT NOT NULL` (`MANUAL`|`APP_CLOSE`|`PRE_MIGRATION`), `schema_version INTEGER NOT NULL`,
`created_at TEXT NOT NULL`

### Conventions that apply to every table from here on

- Primary keys are UUID v4 `TEXT`.
- Dates are `TEXT` in ISO-8601 (`YYYY-MM-DD`); timestamps are ISO-8601 UTC with `Z`.
- Booleans are `INTEGER` 0/1.
- Money columns are `INTEGER` named `*_paise`.
- Every business table carries `created_at`, `updated_at`, `deleted_at` (soft delete), `row_version INTEGER`.
- **`PRAGMA foreign_keys = ON`** on every connection. **`PRAGMA journal_mode = WAL`**.
  Verify both are actually applied — they are per-connection, not per-database.

---

## 6. BACKUP SERVICE

- `createBackup(trigger)`: run `PRAGMA wal_checkpoint(TRUNCATE)`, then use better-sqlite3's online
  `backup()` API (**not** a raw file copy — a file copy of a live WAL database can produce a corrupt
  snapshot), write to `backup.directory` as `gst-ledger-YYYYMMDD-HHmmss-<trigger>.sqlite`, compute
  SHA-256, insert a `backups` row.
- `listBackups()`, `verifyBackup(id)` (integrity check via `PRAGMA integrity_check` on the copy).
- Retention: keep the newest `backup.retainCount`; **never delete the most recent backup of any calendar
  month** so an old month is always recoverable.
- Automatic backup on `PRE_MIGRATION` and on `APP_CLOSE` when enabled.
- `restoreBackup` is **out of scope for this prompt** — build the listing and verification only.

---

## 7. APPLICATION SHELL

- Electron main process creates a single window, 1280×800, minimum 1024×700.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All database access goes through a
  typed IPC contract defined in one file (`packages/app/src/ipc/contract.ts`). No `ipcRenderer.invoke`
  with a stringly-typed channel name scattered through the renderer.
- Database file at `app.getPath('userData')/gst-ledger.sqlite`.
- Startup sequence, with a visible splash state for each step: open DB → set pragmas → back up →
  run migrations → seed → health check → show window.
- If any startup step fails, show a plain-language error screen with the failure and the database path.
  Never fail silently, and never start with a partially migrated database.
- Structured logging to `userData/logs/` with daily rotation. Log every migration, backup, and startup
  failure. **Never log full bill amounts or party names at `info` level.**

### The only screen in this prompt: **System Check**

A single page showing:

- Application version, schema version, database file path, database size
- `PRAGMA integrity_check` result, foreign-keys and journal-mode status
- Seeded record counts (states, tax rate profiles, settings)
- Last backup: timestamp, size, verification status; a **Run backup now** button
- A **calculation engine demo** panel: two inputs (Total Amount, GST Amount) and a rate dropdown fed from
  `tax_rate_profiles`, showing live Bill Amount, expected GST, variance, and — with a state dropdown fed
  from `states` — the resulting INTRA/INTER classification and CGST/SGST/IGST split.

This screen is permanent; it becomes the diagnostics page the user or a support person opens when
something looks wrong. Make it clear and readable, not a debug dump.

---

## 8. VALIDATION RULES TO IMPLEMENT NOW (in `core`, as pure functions)

The bill entry form does not exist yet, but its validator does, and it is unit-tested independently.
Implement `validateBillAmounts({ totalPaise, taxPaise, status })` returning a list of structured issues
with `code`, `severity` (`BLOCK` | `CONFIRM` | `WARN` | `INFO`), `field`, and a plain-language `message`.

| Condition                                                | Code                  | Severity | Message shown to the user                                                               |
| -------------------------------------------------------- | --------------------- | -------- | --------------------------------------------------------------------------------------- |
| total = 0 and status is ACTIVE                           | `TOTAL_ZERO`          | BLOCK    | "Total amount must be more than zero."                                                  |
| total < 0 or tax < 0                                     | `NEGATIVE_AMOUNT`     | BLOCK    | "Amounts cannot be negative. Use a credit note instead."                                |
| tax > total                                              | `TAX_EXCEEDS_TOTAL`   | BLOCK    | "GST cannot be more than the total amount."                                             |
| tax = total and total > 0                                | `TAX_EQUALS_TOTAL`    | BLOCK    | "GST cannot equal the total amount — check the two figures."                            |
| tax = 0 and total > 0                                    | `ZERO_TAX`            | CONFIRM  | "This bill has no GST. Is the supplier exempt or unregistered?"                         |
| total > ₹1,00,00,000                                     | `UNUSUALLY_LARGE`     | CONFIRM  | "₹X is unusually large. Please confirm."                                                |
| implied rate not within ±0.5% of any active rate profile | `RATE_NOT_RECOGNISED` | WARN     | "This works out to X%, which is not one of the usual rates. Is this a mixed-rate bill?" |
| more than 2 decimal places entered                       | `TOO_MANY_DECIMALS`   | BLOCK    | "Enter at most two decimal places."                                                     |

Messages are the real strings the user will read. Write them plainly — no error codes, no apologies, and
they must say what to do next.

> **Note for the implementer:** the `RATE_NOT_RECOGNISED` case is real and common. The July 2026 register
> contains a bill from Swarn Enterprises taxed at 18% _and_ 5% on a single invoice — ₹4,176 taxable with
> ₹677 GST, which is 16.2% overall. The application must never reject such a bill; it must flag it for
> per-rate entry, which arrives in a later prompt.

---

## 9. WHAT THIS PROMPT MUST **NOT** DO

- No purchase, sale, party, period, or report screens.
- No printing, PDF, or Excel export.
- No `bills`, `parties`, `periods`, or `org_units` tables — Prompt 2 designs those.
- No authentication, users, or roles.
- No cloud, sync, telemetry, analytics, crash reporting, or auto-update.
- No `Math.round`, `toFixed`, `parseFloat`, or `Number()` applied to any monetary value, anywhere.
- No percentage or rate literal outside a seed migration.
- No hard-coded `'09'`, `'Uttar Pradesh'`, or `'18%'` in business logic — all from configuration.
- Do not "improve" the `.5 → down` rule. It is intentional and has been signed off as a known divergence
  from Section 170.

---

## 10. ACCEPTANCE CRITERIA

The prompt is complete when **all** of the following are true and demonstrated:

1. `npm install && npm run dev` launches the application on a clean machine with no manual steps.
2. On first run the database is created, migrated, and seeded; on second run migrations are a no-op and
   startup is idempotent.
3. `npm test` runs the `core` test suite **without Electron or a database**, and every vector in
   section 11 passes.
4. Test coverage of `packages/core` is ≥ 95% statements and 100% of branches in the rounding, expected-tax,
   variance, classification, and validation functions.
5. The ESLint layering rule fails the build on a deliberate `core → node:fs` import (show this).
6. `PRAGMA foreign_keys` returns 1 and `PRAGMA journal_mode` returns `wal` on a live connection, as shown
   on the System Check screen.
7. A `PRE_MIGRATION` backup exists after the first run; **Run backup now** creates a second one; both
   verify clean; the SHA-256 recorded matches a freshly computed hash of the file.
8. The System Check calculation demo reproduces, live: Total ₹1,41,542 / GST ₹21,591 → Bill Amount
   ₹1,19,951, expected GST ₹21,591, variance ₹0, and with supplier state `09` shows **INTRA — CGST
   ₹10,796 + SGST ₹10,795** (asymmetric by design; the two must sum to ₹21,591).
9. Changing `rounding.rule` to `HALF_UP` in `app_settings` changes ₹123.50 from ₹123 to ₹124 with **no
   code change and no rebuild**.
10. Deleting the database file and restarting produces a clean, working, seeded database with no errors.
11. A grep of the repository for `toFixed`, `parseFloat`, and `Math.round` returns zero hits in
    money-handling code. Include the grep output in your report.

---

## 11. TEST CASES — THESE ARE A CONTRACT

### 11.1 `roundToRupeeHalfDown` (input paise → output paise)

| Input               | Expected | Why                                  |
| ------------------- | -------- | ------------------------------------ |
| `12340` (₹123.40)   | `12300`  | below half → down                    |
| `12349` (₹123.49)   | `12300`  | below half → down                    |
| `12350` (₹123.50)   | `12300`  | **exact half → DOWN (company rule)** |
| `12351` (₹123.51)   | `12400`  | above half → up                      |
| `12360` (₹123.60)   | `12400`  |                                      |
| `12370` (₹123.70)   | `12400`  |                                      |
| `12390` (₹123.90)   | `12400`  |                                      |
| `12300` (₹123.00)   | `12300`  | already whole                        |
| `0`                 | `0`      |                                      |
| `1` (₹0.01)         | `0`      |                                      |
| `50` (₹0.50)        | `0`      | **exact half at zero → DOWN**        |
| `51` (₹0.51)        | `100`    |                                      |
| `99` (₹0.99)        | `100`    |                                      |
| `-12350` (−₹123.50) | `-12300` | magnitude tie → down                 |
| `-12360` (−₹123.60) | `-12400` |                                      |
| `-50`               | `0`      |                                      |

### 11.2 `expectedTaxPaise` at 18% (`rateBps = 1800n`) — real bills from the July 2026 register

Taxable amounts are whole rupees; convert to paise (×100) before calling.

| Supplier / bill                  | Taxable ₹ | Exact 18%   | Expected result ₹ |
| -------------------------------- | --------- | ----------- | ----------------- |
| Durga Metals GST-1291            | 1,19,951  | 21,591.18   | **21,591**        |
| Durga Metals GST-1305            | 47,145    | 8,486.10    | **8,486**         |
| Durga Metals GST-1502            | 11,590    | 2,086.20    | **2,086**         |
| Durga Metals GST-1672            | 86,861    | 15,634.98   | **15,635**        |
| Durga Metals GST-1729            | 7,49,145  | 1,34,846.10 | **1,34,846**      |
| Metal Max 62                     | 24,420    | 4,395.60    | **4,396**         |
| Metal Max 69                     | 1,93,160  | 34,768.80   | **34,769**        |
| Metal Max 73                     | 1,10,880  | 19,958.40   | **19,958**        |
| Metal Max 77                     | 5,40,250  | 97,245.00   | **97,245**        |
| Metal Max 85                     | 30,008    | 5,401.44    | **5,401**         |
| Shivam Enterprises (Delhi, IGST) | 2,71,503  | 48,870.54   | **48,871**        |
| Vardhman 26-27/0931              | 1,890     | 340.20      | **340**           |
| Vardhman 26-27/0984              | 1,320     | 237.60      | **238**           |
| Nav Bharat 1673                  | 3,255     | 585.90      | **586**           |
| Nav Bharat 1681                  | 2,638     | 474.84      | **475**           |
| Kedarnath 2448                   | 855       | 153.90      | **154**           |
| Chand Company (Delhi, IGST)      | 31,104    | 5,598.72    | **5,599**         |
| Vanshika Steels                  | 2,627     | 472.86      | **473**           |
| Anand Machinery 4573             | 7,748     | 1,394.64    | **1,395**         |
| Anand Machinery 5544             | 3,208     | 577.44      | **577**           |
| Taneja Traders 485               | 2,245     | 404.10      | **404**           |
| Prakash Machinery 3224           | 2,190     | 394.20      | **394**           |
| Sapna Steels 399                 | 13,649    | 2,456.82    | **2,457**         |
| Jyoti Steel 296                  | 6,835     | 1,230.30    | **1,230**         |
| Sale bill 82 (Ghaziabad)         | 20,150    | 3,627.00    | **3,627**         |

### 11.3 Exact-tie cases at 18% — must round DOWN

Any taxable amount where `(18 × amount) mod 100 === 50` lands exactly on `.50`:

| Taxable ₹ | Exact 18% | Expected ₹ |
| --------- | --------- | ---------- |
| 25        | 4.50      | **4**      |
| 75        | 13.50     | **13**     |
| 125       | 22.50     | **22**     |
| 175       | 31.50     | **31**     |
| 225       | 40.50     | **40**     |

### 11.4 Variance — the four real disagreements

These are the bills where the register's recorded GST differs from the company's own rule. The engine
must reproduce the variance exactly and must **not** correct the entered figure.

| Bill                         | Taxable ₹ | Recorded GST ₹ | Expected GST ₹ | Variance | Severity                     |
| ---------------------------- | --------- | -------------- | -------------- | -------- | ---------------------------- |
| Metal Max 85                 | 30,008    | 5,402          | 5,401          | **+1**   | INFO                         |
| Shivam Enterprises           | 2,71,503  | 48,870         | 48,871         | **−1**   | INFO                         |
| Anand Machinery 4573         | 7,748     | 1,394          | 1,395          | **−1**   | INFO                         |
| Swarn Enterprises (18% + 5%) | 4,176     | 677            | 752            | **−75**  | WARN + `RATE_NOT_RECOGNISED` |

### 11.5 Classification

| Our state | Counterparty                               | Result               | Tax heads   |
| --------- | ------------------------------------------ | -------------------- | ----------- |
| `09`      | `09` (Durga Metals, Ghaziabad)             | `INTRA`              | CGST + SGST |
| `09`      | `07` (Shivam Enterprises, Delhi)           | `INTER`              | IGST only   |
| `09`      | `07` (Chand Company, Delhi)                | `INTER`              | IGST only   |
| `09`      | GSTIN `09…` but state manually set to `07` | **validation error** | —           |
| `09`      | no GSTIN, state `09` selected              | `INTRA`              | CGST + SGST |

### 11.6 CGST / SGST split

| Taxable ₹ | Rate | Total tax ₹ | CGST ₹ | SGST ₹ | Note                                                                       |
| --------- | ---- | ----------- | ------ | ------ | -------------------------------------------------------------------------- |
| 1,19,951  | 18%  | 21,591      | 10,796 | 10,795 | odd total; CGST from the 9% calc (10,795.59 → 10,796), SGST by subtraction |
| 51,000    | 18%  | 9,180       | 4,590  | 4,590  | even                                                                       |
| 3,255     | 18%  | 586         | 293    | 293    |                                                                            |
| 2,638     | 18%  | 475         | 237    | 238    | odd                                                                        |

Assert in every case that `cgst + sgst === totalTax`.

### 11.7 `financialYearOf`

`2026-04-01` → `2026-27` · `2026-07-01` → `2026-27` · `2027-03-31` → `2026-27` ·
`2027-04-01` → `2027-28` · `2026-03-31` → `2025-26`

### 11.8 `parseAmountToPaise`

Accept: `"182644"` → `18264400` · `"1,82,644"` → `18264400` · `"1,82,644.00"` → `18264400` ·
`"₹1,82,644.50"` → `18264450` · `"0.01"` → `1` · `" 100 "` → `10000`
Reject: `"1.234"` (too many decimals) · `"1.2.3"` · `"abc"` · `""` · `"1,82,644.5.0"` · `"-100"`

### 11.9 `formatPaise` — Indian grouping

`18264400` → `"1,82,644.00"` · `133067700` → `"13,30,677.00"` → · `100000` → `"1,000.00"` ·
`0` → `"0.00"` · `872332700` → `"87,23,327.00"`
Assert explicitly that the output is **not** `"1,330,677.00"` (Western grouping).

### 11.10 Property-based tests

Using fast-check or equivalent, over random `bigint` amounts:

- `roundToRupeeHalfDown(x) % 100n === 0n` — always a whole rupee
- `|roundToRupeeHalfDown(x) − x| ≤ 50` — never moves more than half a rupee
- `roundToRupeeHalfDown(-x) === -roundToRupeeHalfDown(x)` — sign symmetry
- for INTRA splits: `cgst + sgst === totalTax` for all inputs
- `parseAmountToPaise(formatPaise(x)) === x` — round-trip stability

---

## 12. DELIVERABLE — WHAT TO REPORT BACK

Report in this structure. Do not summarise; be specific and show evidence.

1. **Repository tree** to two levels, and the contents of every `package.json`.
2. **The complete `core` public API** — every exported function signature with its doc comment.
3. **Full source of** `roundToRupeeHalfDown`, `expectedTaxPaise`, `taxVariancePaise`, `classifySupply`,
   `splitIntraStateTax`, `parseAmountToPaise`, `formatPaise`.
4. **Test output verbatim** — the full pass/fail list and the coverage table for `packages/core`.
5. **The migration files** as committed, and the output of `PRAGMA table_info` for every table created.
6. **Startup log** from a clean first run and from a second run, side by side.
7. **Screenshot of the System Check screen** with acceptance criterion 8 visible on it.
8. **Proof of the layering rule** — the ESLint error produced by a deliberate `core → node:fs` import.
9. **The grep output** for `toFixed` / `parseFloat` / `Math.round` across the repository.
10. **Backup evidence** — the `backups` table rows, the files on disk, and their verification results.
11. **Deviations** — anything you did differently from this prompt, and why. Be explicit; a deviation
    reported is fine, a deviation discovered later is not.
12. **Open technical questions** you hit that this prompt did not answer, and the assumption you made in
    each case so it can be corrected before Prompt 2 builds on it.

---

## 13. NOTE ON WHAT COMES NEXT

Prompt 2 will add `org_units`, `parties`, `periods`, `bills`, and `bill_tax_lines`, together with
duplicate-bill detection keyed on `(direction, party, normalised bill number, financial year)`. Design the
migration system, the audit helper, and the repository pattern in this prompt so that those tables slot in
without any of the foundation being rewritten. If a choice here would make that harder, flag it in your
report rather than working around it silently.
