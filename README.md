# Philippine SSS Contributions Calculator

Open-source TypeScript scaffold for Philippine SSS employed-member contribution lookups, payroll compensation normalization, and deduction allocation.

**Status: pre-release / not production-ready.** Verified 2023 and 2025 SSS tables are not yet included. The library requires caller-provided schedules and rejects schedules not marked verified. No real payroll calculations should rely on it until the official data and boundaries are independently audited.

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

- Transcribe and independently verify all rows in official 2023 and 2025 employed-member SSS schedules.
- Add schema validation, complete boundary tests, and payroll examples.
- Audit monthly earnings allocation and rounding for payroll production use.
- Configure release automation and publish an npm package only after verification.

MIT licensed. Not affiliated with or endorsed by the Philippine Social Security System.
