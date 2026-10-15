# Philippine SSS Contributions Calculator

Open-source TypeScript scaffold for Philippine SSS employed-member contribution lookups, payroll compensation normalization, and deduction allocation.

**Status: pre-release.** Complete business-employer/employee schedules for 2023 (53 brackets) and 2025 (61 brackets) have been checked row by row against official SSS PDFs. See [data and verification provenance](data/employed/README.md). This data milestone is complete; payroll arithmetic and runtime validation have automated coverage, while independent production payroll review remains outstanding, and the package remains private/unpublished.

The API requires caller-supplied schedules. Load `data/employed/2023.json` and `data/employed/2025.json` for historical lookups. Do not also load the compatibility copy `2025-01.json`, which would create overlapping effective periods.

## Functions

- `normalizeCompensation()`: monthly, semi-monthly, biweekly, weekly, daily annualized estimates or actual earnings.
- `getContribution()`: lookup by applicable month and salary using a caller-supplied verified schedule.
- `allocateContribution()`: equal, single-pay-period, proportional, and reconciliation allocation.

All amounts are integer centavos. Annualized estimates are not substitutes for actual monthly earnings.

## Development

```sh
npm ci
npm test
npm run example
```

See [payroll behavior, rounding, compatibility changes and worked example](docs/payroll-behavior.md).

## Roadmap

- Obtain independent human review before production payroll adoption.
- Validate employer-specific earnings classification, deduction timing and refund policies with payroll owners.
- Configure release automation and publish an npm package only after verification.

MIT licensed. Not affiliated with or endorsed by the Philippine Social Security System.
