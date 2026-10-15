# SSS web calculator

A plain HTML, CSS and JavaScript reference implementation of the repository's SSS library. All seven member categories and all ten 2023/2025 schedules are included.

## Run locally

Open **index.html** in a current Chrome, Edge, Firefox or Safari browser. No installation, build, server, account or internet connection is required. Keep this folder's files together when copying or downloading it.

If you prefer a local web server, run the following inside this folder, then open http://localhost:8000:

    python3 -m http.server 8000 --bind 127.0.0.1

The server is optional and is not part of the application.

## What you can select

- Membership: business employee, household employee/kasambahay, self-employed, land-based OFW, sea-based OFW, voluntary member or non-working spouse.
- Contribution month: January 2023 onward. The date selects the 2023 or 2025 bundled schedule. A later month uses the open-ended 2025 schedule; this does not guarantee that no subsequent circular has replaced it.
- Compensation/income: actual monthly total, or an annualized semi-monthly, biweekly, weekly or daily amount. Daily input requires 1–31 paid days.
- Self-employed and land-based OFW members can instead select an approved exact monthly salary credit.
- Voluntary members and non-working spouses must select an approved exact MSC. The sample does not derive a non-working spouse's MSC from spouse income.

The result shows the total monthly contribution, payer shares, regular SS, WISP/MPF, EC, salary-credit components, matched bracket and official source circular. Annualized inputs are explicitly labeled estimates. An actual monthly input avoids annualization.

Changing any input clears the prior result so it cannot be mistaken for a current calculation. Invalid dates, malformed amounts and missing or unsupported MSCs produce validation messages. Results can be copied or downloaded as JSON; monetary JSON fields are integer centavos.

The initial example uses PHP26,000 actual monthly compensation for a business employee and the browser's current month. For the 2025 schedule, the expected contribution is PHP3,930: employee PHP1,300, employer PHP2,630. Entering PHP4,999.99 for a household employee makes the employer pay PHP760; at PHP5,000 the employee pays PHP250 and the employer PHP510.

## How it uses the library

- vendor/sss-contributions.js is a generated browser bundle of src/core.ts, src/members.ts and src/index.ts. It exposes SSSContributions and includes the actual library calculation and validation functions.
- vendor/schedules.js packages the canonical data/contributions catalog and JSON schedules as a classic JavaScript asset. It exposes SSSCalculatorData.
- calculator.js validates text inputs, converts pesos exactly to centavos, calls normalizeCompensation() and getMemberContribution(), and supplies presentation metadata.
- app.js manages the form and renders the results. It contains no SSS contribution rate formulas.

Classic local script assets allow file:// operation without module or JSON-fetch restrictions. There are no third-party runtime dependencies, CDN assets, analytics, cookies, storage or outbound calculation requests. External source/repository links need internet access. Clipboard permissions differ across browsers; if copying is unavailable, the JSON download still works.

## Refresh the bundled library or schedules

From the repository root, with development dependencies installed:

    npm run build:web-sample
    npm test

Commit both generated vendor assets whenever the library or canonical data changes. npm run check:web-sample checks that these assets match their sources; the test suite runs this check too.

Automated sample checks compare every category/bracket against the library and exercise parsing, frequency normalization, historical schedules and the household PHP5,000 threshold. Browser checks additionally cover direct file opening, offline operation, errors, selection changes, downloads and mobile layout.

## Scope

This is a contribution-table calculator, not a complete payroll, registration or payment system. Membership eligibility, age/history-based MSC-change approval, actual earnings classification, foreign-currency conversion, payment deadlines, advance/retroactive-payment posting, penalties, refunds and optional voluntary Pension Booster savings need separate handling. Zero income still matches the minimum table bracket and does not establish an obligation to contribute.

Official schedule provenance and the limitations of agent verification are retained in the bundled data. Independent human review remains outstanding. Not affiliated with or endorsed by SSS. MIT licensed.
