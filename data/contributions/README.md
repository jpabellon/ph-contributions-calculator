# SSS schedules across member categories

The catalog `index.json` lists 10 complete schedules (572 printed rows) and their source hashes. The 2023 schedules cover January 2023–December 2024; the 2025 schedules start January 2025. An open end date records the circular's effective period, not a guarantee that no future circular will replace it.

| Group / directory | API categories | 2023 circular / rows | 2025 circular / rows | Who pays |
|---|---|---|---|---|
| `employed` | `employed`, `sea-based-ofw` | 2022-033 / 53 | 2024-006 / 61 | Employer + employee |
| `household` | `household` | 2022-037 / 60 | 2024-007 / 70 | Employer only below PHP5,000 actual compensation; shared from PHP5,000 |
| `self-employed` | `self-employed` | 2022-034 / 53 | 2024-008 / 61 | Individual member, including EC |
| `voluntary-nws` | `voluntary`, `non-working-spouse` | 2022-035 / 53 | 2024-009 / 61 | Individual member, no EC |
| `land-based-ofw` | `land-based-ofw` | 2022-036 / 45 | 2024-010 / 55 | Individual member, no EC |

The minima are PHP1,000 MSC for household members, PHP8,000 for land-based OFWs, and PHP4,000 (2023) / PHP5,000 (2025) for other groups. All groups cap total MSC at PHP30,000 (2023) / PHP35,000 (2025). Regular SS MSC caps at PHP20,000, with the excess in WISP/MPF. The household table contains two distinct PHP5,000 MSC rows, with different payers, so MSC alone cannot select its contribution shares.

## Data schema

Schema version 2 adds explicit `memberCategories`, `memberSSCentavos`, `memberMPFCentavos`, `memberECCentavos`, `regularSalaryCreditCentavos`, and `mpfSalaryCreditCentavos` to the existing employer/employee components. Individual-member amounts are never labeled as employee deductions or employer shares. All fields use integer centavos; zero means the component does not apply. Printed dashes are zero, not missing data. WISP (2023) maps to the same mandatory provident-fund fields as MPF (2025).

Compensation intervals use inclusive `minCentavos`, exclusive `maxExclusiveCentavos`, and `null` for an unlimited upper bound. The first printed “below” row starts at zero in the nonnegative-input API. These bounds do not establish eligibility or an exemption for a month without earnings.

Use `getMemberContribution()` with an explicit membership category and this catalog for all contribution lookups.

## Verification record

An agent visually reviewed every row of the official scanned category circulars on 2026-10-15, including continuation pages in 2023, against the recorded regular SS, EC, WISP/MPF and total columns. `sources/` retains exact official PDFs, and each schedule and catalog entry identifies its URL, SHA-256 hash and table page numbers. All employed-member rows are retained in this catalog alongside the other membership categories. User-supplied images served as references, with official PDFs retained as the authoritative snapshots.

`transcriptions/*.csv` retains static centavo representations of every row and the printed grand-total column, separately from the lookup JSON. Bounds and MSC follow the printed row progression; household compensation splitting is explicit. Tests compare all JSON fields with those records, independently check rates and EC, check every adjacent compensation centavo, test exact selected MSCs, reconcile all payer totals, verify source hashes, and check category/date isolation.

`verified: true` means checked against the named PDF snapshot by the agent. It does not mean SSS certification, independent human audit, or proof of eligibility. Runtime schema checks cannot authenticate a caller's verification flag.

## Rules beyond the table

Schedules preserve explanatory `rules` and structured `advancePaymentTransition` data. The latter records the minimum monthly transition top-ups printed in the individual-member circulars: PHP170 in 2023 and PHP190 in 2025 for self-employed/voluntary/NWS; PHP80 for land-based OFWs in either transition. These apply specifically to contributions paid in advance under the preceding schedule. They are not a general arrears surcharge. No automatic posting or reinterpretation of historical payments is performed.

For sea-based OFWs, the employer/employee mapping is supported by the [SSS OFW membership guidance](https://www.sss.gov.ph/ofw-member/), which identifies manning agencies as employers and requires employer/employee shares. Land-based OFWs use their own schedule. Foreign currency conversion is outside this library.

Non-working spouse basis needs special care: Circular 2022-035 page 2 refers to 50% of the working spouse's MSC, while the [current SSS NWS guidance](https://www.sss.gov.ph/non-working-spouse/) refers to 50% of declared income and the immediately higher MSC. To avoid silently selecting the wrong basis, the API accepts an already-approved exact MSC and does not derive it from either income or a spouse's MSC.

The [SSS voluntary](https://www.sss.gov.ph/voluntary-member/) and [OFW](https://www.sss.gov.ph/ofw-member/) guidance includes age/history-dependent MSC-change restrictions. A lookup is not approval of such a change. Membership eligibility, concurrent employments, payment deadlines, retroactive/advance-payment posting, penalties, refunds and benefit computations require additional policy handling. Optional voluntary Pension Booster savings are separate from the mandatory WISP/MPF table and are not included in the statutory table total. Periods before January 2023 are unsupported.
