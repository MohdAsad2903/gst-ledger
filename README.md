# GST Ledger

[![Test Suite](https://img.shields.io/badge/tests-202%20passed-brightgreen.svg)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20Strict-blue.svg)](#architecture)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](#license)

> **Internal GST Purchase & Sales Register** for **A.M Machine Tool and Dies** (Ghaziabad, Uttar Pradesh).

A zero-floating-point, offline-first desktop application designed to record, calculate, and audit GST purchase and sales bills with mathematical precision, automatic schema migrations, and enterprise-grade backup durability.

---

## 🌟 Key Architecture & Highlights

### 1. Four-Layer Enforced Architecture
Layer boundaries are strictly enforced by build-breaking ESLint rules:

```
┌────────────────────────────────────────────────────────┐
│                   packages/ui                          │
│        React 19 · Accessible UI · Pure CSS             │
└───────────────────────────┬────────────────────────────┘
                            │ Typed IPC Client (window.api)
┌───────────────────────────▼────────────────────────────┐
│                   packages/app                         │
│     Electron 34 · Typed IPC Bridge · Startup Runner    │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
┌─────────────▼──────────────┐ ┌───────────▼─────────────┐
│       packages/data        │ │      packages/core      │
│ SQLite · Migrations · Audit│ │ Pure BigInt GST Engine  │
└─────────────┬──────────────┘ └─────────────────────────┘
              │ Imports
              └────────────────────────────►
```

- **`packages/core`**: 100% dependency-free, pure TypeScript calculation engine. Represents all money in branded integer `Paise` (BigInt) with zero floating-point arithmetic.
- **`packages/data`**: SQLite persistence via `better-sqlite3` and Drizzle ORM. Features verified WAL mode pragmas, SHA-256 hash-validated forward migrations, append-only audit log triggers, and an automated online backup service with monthly retention.
- **`packages/app`**: Secure Electron main process orchestrating startup checks, typed IPC channels, and safe shutdown handlers.
- **`packages/ui`**: React 19 interface adhering to senior-accessible guidelines, high contrast, visible focus rings, tabular figures, and Indian numeral formatting (`₹1,82,644.00`).

---

### 2. Zero Floating-Point Arithmetic
All calculations use integer math on 64-bit BigInt paise:
$$\text{Paise} = \text{Rupees} \times 100$$

- **Exact Fractional Division**: Rounding computed via integer quotient arithmetic:
  $$\text{Half-Down: } \lfloor (2N + M - 1) / 2M \rfloor \qquad \text{Half-Up: } \lfloor (2N + M) / 2M \rfloor$$
- **Live Rounding Rule Switching**: Seamless switching between the company standard (`HALF_DOWN`) and Section 170 CGST Act (`HALF_UP`) live from database settings without app restart.
- **IPC Money Safety**: Monetary figures cross the process boundary strictly as formatted decimal strings (e.g., `"119951.00"`), eliminating JavaScript float precision corruption by construction.

---

### 3. Database Durability & Backup Engine
- **Verified Pragmas**: Enforced `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, and `synchronous = FULL`.
- **Forward-Only Migration Runner**: Validates SHA-256 hashes of applied migrations, blocks startup on file tampering or ahead-of-app schemas, and wraps migrations in strict transactions.
- **Automated Backup Service**: Uses the SQLite Online Backup API (`wal_checkpoint(TRUNCATE)` + `db.backup()`) with read-only integrity verification, SHA-256 checksums, and monthly snapshot protection (retaining the latest backup of every historical month indefinitely).

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v20.x` or `v22.x` / `v24.x`
- **npm**: `v10.x`+

### Installation & Build

```bash
# Clone the repository
git clone https://github.com/MohdAsad2903/gst-ledger.git
cd gst-ledger

# Install dependencies
npm install

# Run TypeScript type check across monorepo
npm run typecheck

# Run architecture layering and code quality linters
npm run lint

# Run all 202 unit and property-based test suites
npm test

# Build production desktop binaries
npm run build
```

### Development Mode

```bash
# Start Vite development server with hot-reload and Electron shell
npm run dev
```

---

## 🧪 Testing & Verification

The test suite covers calculation vectors, money properties, database integrity, backup retention, and typed IPC:

```text
 ✓ packages/core/src/classification.test.ts (17 tests)
 ✓ packages/core/src/validation.test.ts (9 tests)
 ✓ packages/core/src/rounding.test.ts (23 tests)
 ✓ packages/core/src/gstin.test.ts (8 tests)
 ✓ packages/core/src/money.test.ts (38 tests)
 ✓ packages/core/src/tax.test.ts (46 tests)
 ✓ packages/app/src/logger.test.ts (3 tests)
 ✓ packages/core/src/properties.test.ts (6 tests)
 ✓ packages/core/src/utils.test.ts (12 tests)
 ✓ packages/core/src/index.test.ts (1 test)
 ✓ packages/ui/src/App.test.tsx (1 test)
 ✓ packages/data/src/db/connection.test.ts (3 tests)
 ✓ packages/data/src/db/seed.test.ts (3 tests)
 ✓ packages/data/src/repositories/audit.test.ts (4 tests)
 ✓ packages/data/src/migrations/runner.test.ts (5 tests)
 ✓ packages/app/src/ipc/handlers.test.ts (5 tests)
 ✓ packages/data/src/repositories/settings.repository.test.ts (4 tests)
 ✓ packages/data/src/index.test.ts (1 test)
 ✓ packages/data/src/backup/service.test.ts (13 tests)

Test Files  19 passed (19)
Tests       202 passed (202)
```

---

## 📂 Repository Structure

```text
├── packages/
│   ├── core/                  # Pure money types & GST calculation engine
│   │   └── src/               # money.ts, tax.ts, rounding.ts, gstin.ts, etc.
│   ├── data/                  # SQLite, Drizzle schema, migrations, backups
│   │   ├── migrations/        # 0001_foundation.sql, 0002_seed_foundation.sql
│   │   └── src/               # connection.ts, runner.ts, service.ts, repositories/
│   ├── app/                   # Electron main process & IPC handlers
│   │   └── src/               # main.ts, startup.ts, preload.ts, ipc/
│   └── ui/                    # React 19 System Check & ledger interface
│       └── src/               # App.tsx, vite-env.d.ts
├── eslint.config.js           # Enforced architectural boundary rules
├── vite.config.ts             # Electron & React build configuration
└── package.json               # Monorepo workspaces configuration
```

---

## 🛡️ Standing Rule — Business Data Integrity

> [!IMPORTANT]
> **Never invent business data.** Party names, GSTINs, bill numbers, dates, addresses and amounts come from a supplied source or they do not go in at all. If a value is missing, unreadable, or fails validation, record it exactly as supplied and flag it. If a required value has no source, leave it null and report the gap — do not substitute a plausible-looking one, do not generate a value that satisfies a checksum, and never pad a list to reach an expected count.
>
> If following a prompt would require inventing data, stop and report that instead. A prompt that cannot be satisfied honestly is a prompt that needs correcting, and saying so is the correct outcome.

---

## 📄 License

Proprietary — Internal application for A.M Machine Tool and Dies. All rights reserved.
