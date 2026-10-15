# Business employer / employee schedules

- `2023.json`: 53 rows, applicable January 2023 through December 2024.
- `2025.json`: 61 rows, applicable from January 2025, with no end date specified by the source circular.
- `2025-01.json`: compatibility copy of 2025 data with its original ID. Load **either** 2025 file, never both.

All money is integer PHP centavos. Compensation bounds are inclusive minimum / exclusive maximum; `null` means no upper limit. The first printed “below” row starts at zero in this nonnegative-compensation API. Printed upper bounds ending in .99 are converted to the next centavo. Total MSC includes regular SS MSC (capped at PHP 20,000) plus WISP/MPF MSC. WISP in 2023 maps to the API's MPF fields; EC is employer-only. Minimum MSC does not imply an exemption for compensation below that amount.

## Verification and provenance

On 2026-10-15 an agent visually reviewed every printed row against official SSS Circular 2022-033, pages 1–2, and Circular 2024-006, page 2; page 3 establishes the January 2025 replacement. `sources.json` records URLs, dates, page numbers, SHA-256 hashes and method. Exact downloaded PDF snapshots are in `sources/`.

`verified: true` means checked against these specific official PDFs. It does not claim an independent human audit, SSS certification, or a review of subsequent circulars. The former conflicting generated/verified 2025 files now share the same reviewed data and provenance.

`tests/fixtures/*.csv` records the printed regular SS, EC, WISP/MPF and grand-total columns in centavos, separately from the schedule JSON. Bounds and MSC follow the printed 500-peso row progression; employer and employee totals reconcile their printed components. Exhaustive tests compare all rows, all adjacent centavo boundaries, interiors, caps, statutory integer rates, PDF hashes, and effective-date selection. Fixtures are retained for review; no PDF parsing or network access is needed to run tests.

Scope: business employers and employees only. Do not substitute these schedules for household, self-employed, voluntary, or OFW categories. A null end date is not confirmation that the schedule remains current indefinitely.

For all other categories and explicit member-paid components, use the [category-aware catalog](../contributions/README.md) and `getMemberContribution()`. These legacy files remain business-employee schedules.
