# Payroll calculation behavior and review

## Scope of this phase

This phase reviews the implementation's arithmetic, input handling, rounding and reconciliation. It does not establish which earnings an employer must include, certify a payroll process, or provide an independent human audit of the official datasets. Dataset provenance and verification status are unchanged.

## Compensation

All monetary inputs and outputs are nonnegative safe-integer centavos. Results exceeding JavaScript's safe-integer range are rejected with `AMOUNT_OVERFLOW`; intermediate arithmetic uses exact integers.

`actual` adds a nonempty list of earnings for one applicable month; `[0]` explicitly represents zero earnings. The caller is responsible for earnings classification and month assignment. Zero compensation currently selects the minimum contribution bracket, so callers must determine whether a member/month is contributory before invoking lookup.

`annualized` uses monthly × 1, semi-monthly × 2, biweekly × 26 ÷ 12, weekly × 52 ÷ 12, or daily × caller-supplied paid days (1–31). Exact ratios are rounded half up to a centavo. These are estimates; do not infer actual monthly earnings from an average pay frequency.

## Lookup and schedules

All supplied schedules undergo runtime validation before date selection. IDs, HTTPS source URLs, real calendar dates, ordered effective periods, required component fields, safe monetary totals, contiguous compensation bounds and the final open-ended row are checked. Effective end dates are exclusive. Exactly one schedule must cover the applicable month's first day. Use one canonical schedule per effective period.

Caller-supplied `verified: true` is an assertion by the caller, not proof of authenticity. Runtime validation checks structure; bundled datasets additionally have PDF provenance and row reconciliation tests. Returned breakdowns are copies so editing a result cannot alter future lookups.

## Deduction allocation

Every strategy returns **additional** deductions. Supply all deductions already taken in this month, including amounts from completed periods. Their total is subtracted once from the final monthly employee liability. Deductions exceeding liability raise `OVER_DEDUCTED`; the API does not create refunds or negative deductions.

- `equal`: divide the remaining balance equally across the listed periods, with residue assigned to the last period.
- `proportional`: divide the remaining balance using explicit nonnegative integer weights. At least one weight must be positive. Each share is floored, and the last positive-weight period receives the residue. Zero-weight periods always receive zero.
- `single`: put the entire remaining balance in the named target period.
- `reconcile`: also put the entire remaining balance in the named target period; use this at final cutoff after actual monthly earnings are known.

Equal and proportional strategies redistribute the **remaining balance**; they do not calculate per-period target liabilities net of each period's previous deduction. Period order matters for rounding. To exclude a closed period from additional proportional deductions, give it zero weight while retaining its prior deduction; for a final cutoff, use `reconcile`. These strategies are application choices, not statutory deduction-frequency rules.

## Worked example

Run `npm run example` after installing dependencies. Actual June 2025 earnings of PHP 12,000 + PHP 14,000 produce employee liability PHP 1,300, employer liability PHP 2,630 (including EC), and total PHP 3,930. If PHP 600 was already withheld, reconciliation assigns an additional PHP 700 to the second cutoff. The executable example and integration test use these same inputs and expected amounts.

## Compatibility and remaining work

Malformed JavaScript/JSON inputs previously accepted may now throw: unknown modes/strategies/frequencies, empty actual earnings, missing proportional weights, invalid dates, non-HTTPS sources, incomplete brackets and unsafe totals. A malformed or unverified schedule in the supplied list is rejected even if outside the requested month. Existing valid TypeScript call shapes remain supported.

Before production adoption: obtain independent human payroll/data review, decide employer-specific earnings and refund policies, and review applicable later SSS issuances. Package publication and release automation remain future work.

## Other membership categories

Use the [category-aware data and API](../data/contributions/README.md) for every membership category, including business employees, household members and individually paying members. Employer/employee allocation is distinct from member-paid liability; never treat `memberCentavos` as an employee deduction. Exact approved MSC selection is supported for voluntary/NWS, self-employed and land-based OFW members, with no automatic eligibility or posting decision.
