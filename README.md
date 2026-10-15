# Philippine SSS Contributions Calculator

Open-source TypeScript scaffold for Philippine SSS employed-member contribution lookups, payroll compensation normalization, and deduction allocation.

**Status: pre-release / not production-ready.** The 2025 employed-member table is included at `data/employed/2025.json` (61 brackets), derived from the official SSS 2025 table and Circular 2024-006. The 2023 historical table is not yet included. The API currently requires caller-supplied schedules; pass the bundled 2025 JSON when using the library. No real payroll calculations should rely on it until the official data and boundaries are independently audited.

## Functions

- `normalizeCompensation()`: monthly, semi-monthly, biweekly, weekly, daily annualized estimates or actual earnings.
- `getContribution()`: lookup by applicable month and salary using a caller-supplied verified schedule.
- `allocateContribution()`: equal, single-pay-period, proportional, and reconciliation allocation.

All amounts are integer centavos. Annualized estimates are not substitutes for actual monthly earnings.

## Development

```sh
npm install
npm test
```

## Roadmap

- Independently audit every row of the generated 2025 schedule against the published PDF and transcribe the 2023 employed-member schedule from Circular 2022-033.
- Add schema validation, complete boundary tests, and payroll examples.
- Audit monthly earnings allocation and rounding for payroll production use.
- Configure release automation and publish an npm package only after verification.

MIT licensed. Not affiliated with or endorsed by the Philippine Social Security System.
