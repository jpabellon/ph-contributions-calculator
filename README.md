# Philippine SSS Contributions Calculator

Calculate monthly Philippine Social Security System (SSS) contributions and see how much the employer, employee, or individual member pays.

There are three ways to use it:

- **[Website](https://jpabellon.github.io/ph-contributions-calculator/)**: calculate in your browser, no installation.
- **[Free REST API](docs/api.md)**: look up contributions, or reverse-look-up a salary credit from an amount paid, from any app. No registration or key. See it in action in the **[live API example](https://jpabellon.github.io/ph-contributions-calculator/webapicalculator/)**.
- **JavaScript/TypeScript library**: the tested calculation code and official contribution-table data in this repository.

## Try the calculator

**[Open the live SSS Contribution Calculator →](https://jpabellon.github.io/ph-contributions-calculator/)**

Choose a membership type, contribution month, and income amount or approved salary credit. The calculator shows the total contribution, payer shares, and official source.

You do not need to install anything to use the website.

To use it offline:

1. Download this repository using GitHub's **Code → Download ZIP**, then extract it.
2. Open **examples/webcalculator/index.html** in your browser.
3. Keep the other files in that folder alongside it.

The local website runs with plain HTML, CSS, and JavaScript. It does not need Node.js, a server, or an internet connection. See the [web calculator guide](examples/webcalculator/README.md) for details.

## Use the free REST API

A free, read-only REST API serves the same verified tables. It needs no registration, key, or server of your own, and works from any language or directly from a browser.

**[Try the live API example →](https://jpabellon.github.io/ph-contributions-calculator/webapicalculator/)** A browser calculator that gets every number from the API and shows the exact request URL and JSON response behind each result. Its source is in [examples/webapicalculator/](examples/webapicalculator/).

**Lookup:** what does a self-employed member earning ₱26,000 pay for June 2025?

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=self-employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&salary_min[lte]=26000&salary_max[gte]=26000"
```

The response includes `member_pays: "3930.00"`, the payer shares and breakdown, and the SSS circular that applied on that date.

**Reverse lookup:** a payslip shows a ₱1,500 SSS deduction. What salary does that imply?

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-15&valid_until[gte]=2025-06-15&employee_pays=1500"
```

It returns monthly salary credit ₱30,000 and the salary range ₱29,750.00 – ₱30,249.99.

| Read next | |
| --- | --- |
| [API reference](docs/api.md) | Every parameter and field, lookups for all seven membership types, dates, reverse lookup, errors, and limits |
| [API use cases](docs/api-use-cases.md) | Step-by-step payroll, household helper, self-employed/OFW/voluntary payments, income estimates, remittance checks |
| [API calculator example](https://jpabellon.github.io/ph-contributions-calculator/webapicalculator/) ([source](examples/webapicalculator/README.md)) | A live browser calculator built on the API, showing the request and response behind every result |
| [OpenAPI spec](api/openapi.json) | Machine-readable specification (only the read operations are public) |
| [API data and reloading](api/README.md) | How the API data is generated from this repository and kept in sync |

## What is included?

| Membership type | Category used in code | Calculation basis |
| --- | --- | --- |
| Business employee | employed | Compensation |
| Household employee / kasambahay | household | Compensation |
| Sea-based OFW | sea-based-ofw | Compensation |
| Self-employed | self-employed | Income or approved salary credit |
| Land-based OFW | land-based-ofw | Income or approved salary credit |
| Voluntary member | voluntary | Approved salary credit |
| Non-working spouse | non-working-spouse | Approved salary credit |

The data includes all five official SSS table groups for **2023 and 2025**: 10 schedules and 572 rows. The 2023 schedules apply to January 2023 through December 2024; the 2025 schedules start in January 2025. Earlier periods are unsupported. Later months use the bundled open-ended 2025 schedules; check for newer SSS issuances before production use.

## Definition of terms

- **SSS / SS:** SSS means Social Security System. SS means Social Security, the regular benefit program administered by SSS.
- **Monthly salary credit (MSC):** The contribution base selected from the official schedule, not your take-home pay or the amount you pay to SSS. It may differ from actual income.
- **Regular SS:** The contribution component for regular SSS benefits, such as retirement, disability and sickness, subject to the applicable qualifying rules.
- **WISP / MPF:** WISP means Workers’ Investment and Savings Program; MPF means Mandatory Provident Fund. These labels identify the mandatory provident-fund component in the bundled schedules, credited to the member’s individual account. It is included in the total, not an optional extra or the separate voluntary savings program.
- **Total contribution:** The combined contribution across all applicable components and payers. When Member and Total show the same amount, they describe one payment, not two separate charges.

See the [complete definition of terms](docs/definition-of-terms.md) for EC, payer shares, brackets, contribution months, pay frequencies and library amounts, with a worked example. The [web calculator glossary](https://jpabellon.github.io/ph-contributions-calculator/#terms) explains these alongside the calculator.

**Project status:** pre-release and not published to npm. An agent checked the data against the named official PDF snapshots. This is not an independent human audit or SSS certification. Independent payroll review remains outstanding.

## Get started as a developer

These steps are for using or changing the library. They are not required to use the website.

You will need **Git** and **Node.js 22 or newer**. Node.js includes npm, the tool that installs this project's development dependencies.

### 1. Download and prepare the project

Run these commands in a terminal:

```sh
git clone https://github.com/jpabellon/ph-contributions-calculator.git
cd ph-contributions-calculator
npm ci
npm run build
```

The build converts the TypeScript source in src/ into JavaScript in dist/. The dist/ folder is generated locally and is not committed to Git.

The package is currently private/unpublished, so start from this repository rather than trying to install it from npm.

### 2. Run the checks and examples

```sh
npm test
npm run example
```

The tests build the library and check the tables, boundaries, arithmetic, input validation, and browser bundle. The examples print contribution results and a payroll reconciliation example in the terminal.

### 3. Make your first calculation

Create a file named **quickstart.mjs** in the repository's top-level folder, next to package.json. Paste in this code:

```js
import { readFileSync } from 'node:fs';
import { getMemberContribution } from './dist/index.js';

// Load the catalog and the contribution tables it lists.
const dataFolder = new URL('./data/contributions/', import.meta.url);
const readJson = (name) =>
  JSON.parse(readFileSync(new URL(name, dataFolder), 'utf8'));

const catalog = readJson('index.json');
const schedules = catalog.schedules.map((entry) => readJson(entry.path));

// All monetary values are integer centavos: PHP 26,000 = 2,600,000 centavos.
const result = getMemberContribution({
  memberCategory: 'employed',
  applicableMonth: '2025-06',
  basis: 'compensation',
  monthlyCompensationCentavos: 2600000,
  schedules,
});

console.log({
  employeePesos: result.employeeCentavos / 100,
  employerPesos: result.employerCentavos / 100,
  totalPesos: result.grandTotalCentavos / 100,
});
// Expected: { employeePesos: 1300, employerPesos: 2630, totalPesos: 3930 }
```

Run it:

```sh
node quickstart.mjs
```

For a voluntary member or non-working spouse, use basis: 'salary-credit' and monthlySalaryCreditCentavos instead of monthlyCompensationCentavos. Supply an approved exact MSC from the applicable schedule. The library does not derive a non-working spouse's MSC from spouse income.

For self-employed and land-based OFW members, the amount payable is returned in memberCentavos. Employer and employee shares are zero for these individually paying categories.

## Where to find things

| Location | What it contains |
| --- | --- |
| [src/](src/) | TypeScript library source |
| [data/contributions/](data/contributions/) | Category-aware schedules, source PDFs, hashes, and recorded table rows |
| [examples/webcalculator/](examples/webcalculator/) | The website, including its locally bundled library and data |
| [examples/webapicalculator/](examples/webapicalculator/) | A website that uses the public REST API, with lookup and reverse lookup |
| [api/](api/) | Public API seed data, OpenAPI spec and reload guide |
| [docs/api.md](docs/api.md), [docs/api-use-cases.md](docs/api-use-cases.md) | Public API reference and worked use cases |
| [examples/monthly-payroll.mjs](examples/monthly-payroll.mjs) | Monthly earnings and final-cutoff reconciliation example |
| [examples/member-categories.mjs](examples/member-categories.mjs) | Working examples for every supported membership category |
| [tests/](tests/) | Automated tests |
| [docs/payroll-behavior.md](docs/payroll-behavior.md) | Rounding, allocation behavior, and limitations |

## Useful library functions

| Function | What it does |
| --- | --- |
| getMemberContribution() | Looks up contributions for an explicit membership category and month |
| validateMemberSchedule() | Checks the structure and payer components of a category-aware schedule |
| normalizeCompensation() | Adds actual monthly earnings or estimates a monthly amount from a pay frequency |
| allocateContribution() | Distributes an employee's remaining monthly deduction across payroll periods |

Always pass money as **whole centavos**, not decimal pesos. Select the membership category explicitly; the library does not silently substitute another category's table.

Annualized weekly, biweekly, semi-monthly, and daily conversions are estimates. Use actual monthly earnings for final payroll reconciliation.

## Updating the website example

The website includes generated copies of the library and data so it can work offline. After changing library source or contribution tables, refresh those copies:

```sh
npm run build:web-sample
npm test
```

Commit the updated vendor files along with your source/data changes. To check whether those files are current without rebuilding them, run npm run check:web-sample.

GitHub Pages publishes [the live calculator](https://jpabellon.github.io/ph-contributions-calculator/) after the deployment workflow's build and tests pass. Relevant pushes to main redeploy the site automatically; the workflow can also be started manually from GitHub Actions.

## Before using this for real payroll

A correct table lookup does not establish membership eligibility or approve an MSC change. Earnings classification, age/history restrictions, concurrent employment, payment deadlines, advance or retroactive posting, penalties, refunds, and optional voluntary Pension Booster savings require separate handling.

A zero-income input still selects the minimum table bracket; it does not establish an obligation to contribute for that month.

Read the [data coverage and verification notes](data/contributions/README.md) and [payroll behavior guide](docs/payroll-behavior.md), and obtain independent human review before production adoption.

## License

[MIT](LICENSE). The web example also includes third-party design assets with their own [notices and licenses](examples/webcalculator/THIRD-PARTY-NOTICES.md).

Not affiliated with or endorsed by the Philippine Social Security System.
