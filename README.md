# Philippine SSS Contributions Calculator

TypeScript library for Philippine SSS contribution lookups across business employees, household employees, self-employed members, land-based and sea-based OFWs, voluntary members and non-working spouses, with payroll compensation normalization and deduction allocation.

**Status: pre-release.** All five official SSS table groups for 2023 and 2025 are included: 10 complete schedules, 572 rows, and seven explicit membership categories. Data was checked against official PDF snapshots; independent human payroll review remains outstanding. The package is private/unpublished.

Use [`data/contributions/index.json`](data/contributions/index.json) to load the category-aware catalog and pass those schedules to `getMemberContribution()`. See [coverage, source provenance and special-case rules](data/contributions/README.md). There is no category fallback.

Existing `getContribution()` callers can continue using `data/employed/2023.json` and `data/employed/2025.json`. The compatibility copy `2025-01.json` must not be loaded alongside `2025.json`. Version 2 category data is rejected by the original API to prevent omission of member-paid components.

## Functions

- `normalizeCompensation()`: monthly, semi-monthly, biweekly, weekly, daily annualized estimates or actual earnings.
- `getMemberContribution()`: explicit category lookup by compensation or approved exact MSC, with employer, employee and individual-member totals.
- `validateMemberSchedule()`: validate the category-aware schema and payer components.
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

## Category-aware lookup

```js
import { getMemberContribution } from 'ph-sss-contributions';

// Load the files listed by data/contributions/index.json as `schedules`.
const result = getMemberContribution({
  memberCategory: 'self-employed',
  basis: 'compensation',
  monthlyCompensationCentavos: 2600000,
  applicableMonth: '2025-06',
  schedules,
});
// memberCentavos: 393000; employeeCentavos: 0; employerCentavos: 0
```

For voluntary and non-working spouse members, use `basis: 'salary-credit'` and `monthlySalaryCreditCentavos` with an approved exact MSC. Business/household employees and sea-based OFWs require compensation basis; household payer shares cannot be determined from MSC alone. Self-employed and land-based OFW lookups support either basis. An invalid selected MSC is rejected rather than rounded or capped.

Lookup support does not approve membership, MSC changes or payment posting. Non-working spouse basis derivation is intentionally left to the caller because source wording differs; see the coverage notes. Run `npm run example` for executable cases covering every category.

## Web calculator sample

Open [examples/webcalculator/index.html](examples/webcalculator/index.html) directly in a current browser for a fully offline HTML/JavaScript calculator covering every supported member category. No server or build step is needed. See the [sample README](examples/webcalculator/README.md) for parameters, scope and how to refresh the bundled library/data with npm run build:web-sample.
