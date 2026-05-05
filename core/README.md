# @splitdumb/core

Pure-logic package for SplitDumb. No transport, no storage, no server, no browser code — just pure functions.

## What's Inside

- **splits.js** — `calculateSplits()` and `buildNightsData()` for expense split calculations
- **debts.js** — `calculateSimplifiedDebts()` for simplifying who-owes-whom
- **colors.js** — `nameToColor()` and `nextColorForGroup()` for member color assignment
- **validators.js** — Input validation for groups, members, expenses, and settlements
- **categories.js** — Expense category constants and metadata

## Usage

```js
const { calculateSplits, calculateSimplifiedDebts, CATEGORIES } = require('@splitdumb/core');
```

## Design Principles

- **Zero dependencies** — no npm packages
- **Pure functions** — all data passed as arguments, no DB access
- **CommonJS** — works with both CJS servers and ESM/Vite clients
- **Identical logic** — extracted from the server, not rewritten