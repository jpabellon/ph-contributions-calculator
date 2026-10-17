# Public SSS Contributions API

A free, read-only REST API for Philippine SSS monthly contribution tables (2023 onward), served by [NoCodeBackend](https://www.nocodebackend.com/). No registration, API key or login is needed. The data is generated from this repository's verified schedules by the open-source SDK, so every amount matches `getMemberContribution()` to the centavo.

> Not affiliated with or endorsed by the Social Security System. A lookup is not SSS approval of membership, a salary-credit change or a payment. See [Limits](#limits-and-what-the-api-does-not-decide).

For step-by-step payroll and income-estimate examples, see [API use cases](api-use-cases.md).

## Quick start

How much does a self-employed member earning ₱26,000 pay for income earned on 15 June 2025?

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=self-employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&salary_min[lte]=26000&salary_max[gte]=26000"
```

```json
{
  "status": "success",
  "data": [
    {
      "id": 771,
      "fund": "sss",
      "member_type": "self-employed",
      "law_code": "sss-self-employed-2025",
      "law": "SSS Circular 2024-008",
      "law_url": "https://www.sss.gov.ph/wp-content/uploads/2024/12/CI-2024-008-Publication.pdf",
      "valid_from": "2025-01-01",
      "valid_until": "9999-12-31",
      "still_in_effect": 1,
      "row_order": 43,
      "salary_min": "25750.00",
      "salary_max": "26249.99",
      "no_upper_limit": 0,
      "monthly_salary_credit": "26000.00",
      "employer_pays": "0.00",
      "employee_pays": "0.00",
      "member_pays": "3930.00",
      "total": "3930.00",
      "breakdown_json": "{\"employer_ss\":\"0.00\",\"employer_mpf\":\"0.00\",\"employer_ec\":\"0.00\",\"employee_ss\":\"0.00\",\"employee_mpf\":\"0.00\",\"member_ss\":\"3000.00\",\"member_mpf\":\"900.00\",\"member_ec\":\"30.00\",\"regular_salary_credit\":\"20000.00\",\"mpf_salary_credit\":\"6000.00\"}",
      "user_id": null
    }
  ],
  "metadata": { "page": 1, "limit": 10, "hasMore": false, "hasPrev": false }
}
```

Answer: ₱3,930.00 a month, all paid by the member (₱3,000 regular SS + ₱900 MPF + ₱30 EC). This is a real response captured from the live API.

`-g` stops curl from treating `[` and `]` specially. In code, brackets may be sent as-is or URL-encoded (`%5B`, `%5D`); both work.

## Base URL and parameters

```
https://api.nocodebackend.com/read/<table>?Instance=37012_ph_contributions&<filters>
```

`Instance=37012_ph_contributions` is required on every call. Only `GET /read/...` is public; create, update and delete calls are rejected (`Table does not allow public write.`).

Filters compare a column with a value. The bracketed suffix chooses the comparison:

| Write | Means |
|---|---|
| `column=value` | equals |
| `column[lte]=value` | less than or equal (≤) |
| `column[gte]=value` | greater than or equal (≥) |
| `column[lt]=value` / `column[gt]=value` | less than / greater than |
| `column[ne]=value` | not equal |
| `column[in]=a,b,c` | one of a list |

Paging and order:

| Parameter | Means | Default |
|---|---|---|
| `limit` | rows per page (use `limit=100` to get a whole schedule) | 10 |
| `page` | page number | 1 |
| `sort` | column to sort by | `id` |
| `order` | `asc` or `desc` | `asc` |

`metadata.hasMore` tells you whether another page exists.

### The lookup parameters, in plain words

| Parameter | Plain meaning |
|---|---|
| `fund=sss` | Which fund. Other funds will use other codes in the same tables. |
| `member_type=…` | Who is paying; see [member types](#member-types). |
| `valid_from[lte]=<income date>` | The law started on or before the income date. |
| `valid_until[gte]=<income date>` | The law still applied on the income date. |
| `salary_min[lte]=<salary>` | The salary range starts at or below the monthly salary. |
| `salary_max[gte]=<salary>` | The salary range ends at or above the monthly salary. |
| `monthly_salary_credit=<amount>` | Pick the row for an exact, already-approved monthly salary credit (MSC) instead of a salary. |

Put the same income date in both `valid_*` parameters and the same salary in both `salary_*` parameters. Ranges include both ends, matching the printed SSS tables (for example ₱25,750.00 – ₱26,249.99).

## Response fields

`contribution_rates` (one row per salary range, per member type, per law):

| Field | Meaning |
|---|---|
| `fund`, `member_type` | Fund code and member type code |
| `law_code`, `law`, `law_url` | The circular that applies and a link to the official PDF |
| `valid_from`, `valid_until` | First and last day the law applies. `9999-12-31` means no end date has been published. |
| `still_in_effect` | `1` for the current law, `0` for a replaced one |
| `row_order` | Row position in the printed table (1 = lowest) |
| `salary_min`, `salary_max` | Monthly salary range, both ends included |
| `no_upper_limit` | `1` for the top range; its `salary_max` is the placeholder `99999999.99` |
| `monthly_salary_credit` | The MSC for this row |
| `employer_pays` | Employer share, including EC |
| `employee_pays` | Deducted from the employee's pay |
| `member_pays` | Paid by an individual member (self-employed, voluntary, OFW, non-working spouse) |
| `total` | Everything remitted for the month: `employer_pays + employee_pays + member_pays` |
| `breakdown_json` | A JSON **string** with the parts: `employer_ss`, `employer_mpf`, `employer_ec`, `employee_ss`, `employee_mpf`, `member_ss`, `member_mpf`, `member_ec`, `regular_salary_credit`, `mpf_salary_credit`. Parse it with `JSON.parse`. |
| `id`, `user_id` | Database row id and an unused owner field (always `null`); ignore both |

Amounts are pesos with two decimals and are returned as text (`"3930.00"`); convert with `Number()` or a decimal library. Yes/no fields are `1`/`0`. MPF (2025) and WISP (2023) both appear as `mpf`.

## Member types

```sh
curl -g "https://api.nocodebackend.com/read/member_types?Instance=37012_ph_contributions&fund=sss"
```

| `member_type` | Who pays | Look up by salary | Look up by MSC |
|---|---|---|---|
| `employed` | Employer and employee | ✅ | — |
| `household` | Employer only below ₱5,000; shared from ₱5,000 | ✅ | — (two ₱5,000 MSC rows exist) |
| `sea-based-ofw` | Manning agency (employer) and seafarer | ✅ | — |
| `self-employed` | Member, including EC | ✅ | ✅ |
| `land-based-ofw` | Member, no EC | ✅ | ✅ |
| `voluntary` | Member, no EC | — | ✅ |
| `non-working-spouse` | Member, no EC | — | ✅ |

`accepts_salary` and `accepts_salary_credit` in the response say the same thing in data form. Using the wrong kind of lookup still returns a row; it is the caller's job to respect these flags, as `getMemberContribution()` does.

## Forward lookup: salary or MSC → contribution

Business employee, ₱30,000, June 2025 → employee ₱1,500, employer ₱3,030, total ₱4,530:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&salary_min[lte]=30000&salary_max[gte]=30000"
```

Sea-based OFW (same table as employees), ₱26,000 → employee ₱1,300, employer ₱2,630:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=sea-based-ofw&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&salary_min[lte]=26000&salary_max[gte]=26000"
```

Household employee, ₱4,500 → employer pays all ₱685; at ₱6,000 the employee pays ₱300 and the employer ₱610:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=household&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&salary_min[lte]=4500&salary_max[gte]=4500"
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=household&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&salary_min[lte]=6000&salary_max[gte]=6000"
```

Land-based OFW earning the equivalent of ₱7,000 → minimum MSC ₱8,000, member pays ₱1,200:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=land-based-ofw&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&salary_min[lte]=7000&salary_max[gte]=7000"
```

Self-employed member choosing an MSC of ₱26,000 → ₱3,930:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=self-employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&monthly_salary_credit=26000"
```

Voluntary member with an approved ₱20,000 MSC → ₱3,000; non-working spouse with ₱10,000 → ₱1,500:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=voluntary&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&monthly_salary_credit=20000"
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=non-working-spouse&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&monthly_salary_credit=10000"
```

Salaries above the top range use the top row (`no_upper_limit: 1`). ₱150,000 → MSC ₱35,000:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&salary_min[lte]=150000&salary_max[gte]=150000"
```

The same request in JavaScript (works in browsers on any site and in Node 18+):

```js
const BASE = 'https://api.nocodebackend.com/read/contribution_rates';

async function sssContribution({ memberType, incomeDate, salary }) {
  const params = new URLSearchParams({
    Instance: '37012_ph_contributions', fund: 'sss', member_type: memberType,
    'valid_from[lte]': incomeDate, 'valid_until[gte]': incomeDate,
    'salary_min[lte]': salary, 'salary_max[gte]': salary,
  });
  const res = await fetch(`${BASE}?${params}`);
  const { status, data, error } = await res.json();
  if (status !== 'success') throw new Error(error);
  if (data.length !== 1) throw new Error('No SSS rate for this date and member type');
  const row = data[0];
  return { ...row, breakdown: JSON.parse(row.breakdown_json) };
}

const r = await sssContribution({ memberType: 'employed', incomeDate: '2025-06-15', salary: 30000 });
console.log(r.employee_pays, r.employer_pays, r.law); // "1500.00" "3030.00" "SSS Circular 2024-008"
```

## Dates: which law applies

Pass the date the income was earned. The API returns the row of whichever law covered that date, so the caller never picks the law.

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2024-12-31&valid_until[gte]=2024-12-31&salary_min[lte]=30000&salary_max[gte]=30000"
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-01-01&valid_until[gte]=2025-01-01&salary_min[lte]=30000&salary_max[gte]=30000"
```

The first returns Circular 2022-033 (employee ₱1,350); the second Circular 2024-006 (employee ₱1,500). Contributions are monthly, so any day in the month gives the same answer. Dates before 2023 are not covered:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2022-12-31&valid_until[gte]=2022-12-31&salary_min[lte]=30000&salary_max[gte]=30000"  # returns no rows
```

## Reverse lookup: contribution → MSC and salary range

Search by an amount instead of a salary. Use the field that matches what you know:

| You know… | Filter |
|---|---|
| What an individual member paid | `member_pays=…` |
| The SSS deduction on a payslip | `employee_pays=…` |
| The employer's share | `employer_pays=…` |
| The total remitted | `total=…` |

A ₱3,930 self-employed payment → MSC ₱26,000, salary range ₱25,750.00 – ₱26,249.99:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=self-employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&member_pays=3930"
```

A ₱1,500 payslip deduction → MSC ₱30,000, salary ₱29,750.00 – ₱30,249.99:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&employee_pays=1500"
```

Amounts must match exactly. An amount that is not in the table returns no rows:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=self-employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&member_pays=3931"  # returns no rows
```

To find the nearest valid amount at or below it, sort descending and take one row:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=self-employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&member_pays[lte]=3931&sort=member_pays&order=desc&limit=1"
```

### Amounts that match more than one row

Every reverse lookup has exactly one answer except these household cases. They are generated from the data in [`api/seed/ambiguous_amounts.json`](../api/seed/ambiguous_amounts.json) and checked by the tests:

| Law | Filter | Matching MSCs | Why | Use instead |
|---|---|---|---|---|
| 2023 and 2025 household | `employee_pays=0` | ₱1,000 – ₱5,000 (9 rows) | The employer pays everything below ₱5,000 | `employer_pays` or `total` |
| 2025 household | `employer_pays=610` | ₱4,000 and ₱6,000 | Full share at ₱4,000 equals the shared employer part at ₱6,000 | `total` (₱610 vs ₱910) |
| 2025 household | `employer_pays=760` | ₱5,000 and ₱7,500 | Same reason | `total` (₱760 vs ₱1,135) |
| 2023 household | `total=710` | ₱5,000 twice | Below vs from ₱5,000 compensation | `employee_pays` (₱0 vs ₱225) |
| 2025 household | `total=760` | ₱5,000 twice | Below vs from ₱5,000 compensation | `employee_pays` (₱0 vs ₱250) |

Always check `data.length`: more than one row means the amount alone cannot decide.

## Reference tables

Funds:

```sh
curl -g "https://api.nocodebackend.com/read/funds?Instance=37012_ph_contributions"
```

Laws (circulars) with their dates, official PDF, SHA-256 of the archived copy and review record:

```sh
curl -g "https://api.nocodebackend.com/read/laws?Instance=37012_ph_contributions&fund=sss&sort=valid_from&limit=100"
curl -g "https://api.nocodebackend.com/read/laws?Instance=37012_ph_contributions&fund=sss&still_in_effect=1"
```

`laws` fields: `law_code`, `law`, `law_url`, `member_types` (comma-separated), `calculation_method` (`bracket_table`), `valid_from`, `valid_until`, `still_in_effect`, `bracket_count`, `sha256`, `table_pages`, `reviewed_on`, `verification_method`, `rules_json` (JSON string: notes printed with the table) and `advance_payment_transition_json` (JSON string or `null`: minimum top-ups for contributions paid in advance under the previous table).

A full rate table, in printed order:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&law_code=sss-employed-2025&member_type=employed&sort=row_order&limit=100"
```

## Empty results and errors

The API returns `200` with `"data": []` when nothing matches. Common reasons:

- **No law for the date**: dates before 2023-01-01.
- **Amount not in the table** (reverse lookup): use the nearest-below search.
- **MSC not in the table**: an MSC must be an exact table value such as `26000`, not `26100`.
- **Typos** in `member_type` or `fund` values also return no rows, because they are plain filters.

An unknown column returns `{"status":"failed","error":"Unknown column '…' in 'where clause'"}`. A write attempt returns a `failed` status with `Table does not allow public write.` (or update/delete).

## Data source and verification

Each `laws` row links to the official SSS circular. The repository keeps the exact PDFs, their SHA-256 hashes, row-by-row transcriptions and the review record ([data/contributions/README.md](../data/contributions/README.md)). The API rows are generated by `scripts/build-api-seed.mjs` from the same data with the SDK, and tests check every row, every range boundary and every documented example. "Verified" means checked against the PDF by an agent; no independent human audit or SSS certification is claimed.

## Limits and what the API does not decide

- Membership eligibility, approval of an MSC change, payment deadlines, penalties, refunds, benefits, and posting of advance or late payments.
- Which earnings count as compensation, and how a month's deduction is split across pay periods. The SDK's `allocateContribution()` handles the split; see [use cases](api-use-cases.md#1-monthly-payroll-for-an-employee).
- Foreign-currency conversion for OFWs.
- The non-working-spouse MSC basis (sources differ); pass an already-approved MSC.
- Optional voluntary savings such as Pension Booster.

The API is free and best-effort, with no uptime guarantee or per-user rate limit. Please cache results: rates change only when SSS issues a new circular.

## Versioning and new funds

Table and column names are stable. New circulars are added as new rows with their own `valid_from`, and the replaced law's `valid_until` and `still_in_effect` are updated, so date-based queries keep working without code changes. Other funds (for example PhilHealth or Pag-IBIG) will be added to the same tables under a new `fund` code. `calculation_method` will say whether that fund uses a bracket table or a rate. The full machine-readable specification generated by NoCodeBackend is in [`api/openapi.json`](../api/openapi.json); only its `read` operations are public.
