# SSS web API calculator

A plain HTML, CSS and JavaScript sample that uses the free [public SSS contributions API](../../docs/api.md) for every number it shows. It has the same look and layout as the [offline web calculator](../webcalculator/), but instead of bundling the library and tables it calls the API. It demonstrates both kinds of request:

- **Find contribution**: membership type, month, and monthly salary (or an approved monthly salary credit) → the contribution, each payer's share, the breakdown and the applicable circular.
- **Reverse lookup**: membership type, month, and an amount you know (payslip deduction, employer share, total remitted, or member payment) → the monthly salary credit and the salary range that produce it.

Every result has an **API request & response** panel showing the exact URL the page called, a link to open it, and the raw JSON. Copy that URL to use the API from any other app; no key is needed.

## Run locally

Open **index.html** in a current Chrome, Edge, Firefox or Safari browser. An internet connection is required. If your browser blocks requests from a file opened directly, serve the folder instead and open http://localhost:8000:

    python3 -m http.server 8000 --bind 127.0.0.1

## Try these

| Mode | Inputs | Result |
|---|---|---|
| Find contribution | Business employee, June 2025, ₱26,000 | ₱3,930: employee ₱1,300, employer ₱2,630 |
| Find contribution | Household employee, ₱4,999.99 then ₱5,000 | Employer pays all ₱760, then employee ₱250 + employer ₱510 |
| Find contribution | Voluntary member, MSC ₱20,000 | ₱3,000 |
| Find contribution | Business employee, December 2024 vs January 2025, ₱26,000 | ₱3,670 under Circular 2022-033, then ₱3,930 under Circular 2024-006 |
| Reverse lookup | Business employee, employee deduction ₱1,500 | MSC ₱30,000, salary ₱29,750.00 – ₱30,249.99 |
| Reverse lookup | Business employee, employee deduction ₱1,750 | MSC ₱35,000, salary ₱34,750.00 or more |
| Reverse lookup | Self-employed, member payment ₱3,931 | No exact match; **Use closest valid amount at or below** finds ₱3,930 (MSC ₱26,000) |
| Reverse lookup | Household employee, employer share ₱610 | Two possible rows (MSC ₱4,000 and ₱6,000), with advice to search by the total instead |

## How it differs from the offline calculator

| | Offline calculator | API calculator (this sample) |
|---|---|---|
| Where numbers come from | Bundled library and tables | The public API |
| Internet | Not needed | Required |
| Your inputs | Stay in the browser | Sent to `api.nocodebackend.com` (no account, cookie or analytics on this page) |
| Pay frequency | Monthly, semi-monthly, weekly, biweekly, daily estimates | Actual monthly amount only (estimating needs the library's `normalizeCompensation()`) |
| Reverse lookup | No | Yes |

## Files

- `api.js`: the API client. It validates inputs, builds request URLs and returns `{ url, rows, raw }`. It distinguishes "no table for this month", "no matching row" and network or API errors. It contains no SSS rates or formulas.
- `app.js`: form state and rendering, following the offline sample's patterns.
- `index.html`, `styles.css`: the offline sample's markup and stylesheet, plus a mode switch and the API panel.
- `assets/`, `LICENSE`, `THIRD-PARTY-NOTICES.md`: identical copies of the offline sample's files (Kapwa tokens, Inter font, BetterGov logos and their licenses), so this folder works on its own.

`npm test` runs `tests/webapicalculator.test.mjs`. It loads `api.js` with a stand-in for the API built from `api/seed`, and checks:

- the request URLs and lookups for every member type and law
- the household threshold and the January 2025 change of law
- reverse, nearest-below and ambiguous results
- input validation and error handling
- that the shared assets stay identical to the offline sample's

## Scope

This is a contribution-table lookup, not a payroll, registration or payment system. A reverse lookup estimates monthly compensation from one employer for one month. It is not proof of income. Membership eligibility, MSC-change approval, earnings classification, currency conversion, payment deadlines, advance or late payment posting, penalties, refunds and optional voluntary Pension Booster savings need separate handling. See [Limits](../../docs/api.md#limits-and-what-the-api-does-not-decide).

The public API is free and best-effort. Not affiliated with or endorsed by SSS. MIT licensed. Design credits are the same as the offline sample's; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and the [Kapwa design adaptation](../webcalculator/README.md#kapwa-design-adaptation).
