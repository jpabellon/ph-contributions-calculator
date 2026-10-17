# API use cases

Worked examples for the [public SSS contributions API](api.md). Every amount below comes from the live API and is checked by the repository tests. Amounts in API responses are peso strings (`"1500.00"`). The SDK functions mentioned here use integer centavos.

```js
// Helpers used in the examples below.
const BASE = 'https://api.nocodebackend.com/read/contribution_rates';
const toCentavos = pesos => Math.round(Number(pesos) * 100);

async function sssRates(filters) {
  const params = new URLSearchParams({ Instance: '37012_ph_contributions', fund: 'sss', ...filters });
  const { status, data, error } = await (await fetch(`${BASE}?${params}`)).json();
  if (status !== 'success') throw new Error(error);
  return data;
}

// Exactly one row for a member type, income date and monthly salary.
async function bySalary(memberType, incomeDate, salary) {
  const rows = await sssRates({ member_type: memberType, 'valid_from[lte]': incomeDate, 'valid_until[gte]': incomeDate,
    'salary_min[lte]': salary, 'salary_max[gte]': salary });
  if (rows.length !== 1) throw new Error(`Expected one SSS row, got ${rows.length}`);
  return rows[0];
}
```

What the API does **not** decide, in every use case: membership eligibility, which earnings count as compensation, payment deadlines, penalties, refunds, benefits, and approval or posting of MSC changes and advance payments.

## 1. Monthly payroll for an employee

SSS contributions are set per calendar month from the month's actual compensation. Look up the month once, then split the employee deduction across pay periods.

**Step 1: monthly lookup.** Maria earns ₱12,000 on the 15th and ₱14,000 on the 30th of June 2025, so her June compensation is ₱26,000.

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&salary_min[lte]=26000&salary_max[gte]=26000"
```

The response gives `employee_pays: "1300.00"` (deducted from Maria), `employer_pays: "2630.00"` (company cost, including ₱30 EC) and `total: "3930.00"` (remitted to SSS).

**Step 2: split across pay periods.** Semi-monthly, weekly and daily payrolls often deduct before the month's final earnings are known. Use the SDK's `allocateContribution()` to compute the remaining deduction. Suppose ₱600 was already withheld on 15 June, based on an estimate:

```js
import { allocateContribution } from 'ph-sss-contributions'; // this repository's SDK (build with npm run build)

const june = await bySalary('employed', '2025-06-30', 26000);
const plan = allocateContribution({
  monthlyEmployeeCentavos: toCentavos(june.employee_pays),           // 130000
  strategy: 'reconcile', targetPeriodId: 'jun-30',
  periods: [{ id: 'jun-15', alreadyDeductedCentavos: 60000 }, { id: 'jun-30' }],
});
// [{ id: 'jun-15', additionalDeductionCentavos: 0 }, { id: 'jun-30', additionalDeductionCentavos: 70000 }]
```

Other strategies: `equal` (split evenly), `proportional` (by weights such as earnings per period) and `single` (all in one period). The full rules are in [payroll behavior](payroll-behavior.md#deduction-allocation). For weekly or daily pay, add up the month's actual earnings first. The SDK's `normalizeCompensation()` can annualize a rate for an early estimate, but an estimate is not a substitute for actual earnings.

**Step 3: a whole payroll run.** Look up each employee for the month and total the remittance:

```js
const employees = [
  { name: 'Ana', june: 12000 },  // ₱600 employee, ₱1,210 employer
  { name: 'Maria', june: 26000 }, // above ₱20,000: part goes to MPF
  { name: 'Jose', june: 40000 },  // above the ₱35,000 cap: top row
];
let remit = 0;
for (const e of employees) {
  const r = await bySalary('employed', '2025-06-30', e.june);
  const parts = JSON.parse(r.breakdown_json);
  console.log(e.name, r.monthly_salary_credit, r.employee_pays, r.employer_pays, 'MPF', parts.employee_mpf, parts.employer_mpf);
  remit += toCentavos(r.total);
}
console.log('June remittance', remit / 100); // 1810 + 3930 + 5280 = 11020
```

Jose's row has `no_upper_limit: 1` and MSC ₱35,000:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&salary_min[lte]=40000&salary_max[gte]=40000"
```

Sea-based OFWs use the same calculation with `member_type=sea-based-ofw`; the manning agency is the employer. Convert foreign-currency pay to pesos before the lookup.

## 2. Household helper (kasambahay) payroll

Below ₱5,000 a month the employer pays everything. From ₱5,000 the contribution is shared.

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=household&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&salary_min[lte]=4999.99&salary_max[gte]=4999.99"
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=household&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&salary_min[lte]=5000&salary_max[gte]=5000"
```

| Monthly pay | MSC | Helper pays | Employer pays | Total |
|---|---|---|---|---|
| ₱4,999.99 | ₱5,000 | ₱0 | ₱760 | ₱760 |
| ₱5,000.00 | ₱5,000 | ₱250 | ₱510 | ₱760 |

Both rows have MSC ₱5,000, so always look up household members by salary, never by MSC.

## 3. Self-employed, voluntary and OFW monthly payment

Individual members pay the whole amount (`member_pays`).

**Self-employed or land-based OFW, by income.** A freelancer earning ₱26,000 a month:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=self-employed&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&salary_min[lte]=26000&salary_max[gte]=26000"
```

₱3,930, including ₱30 EC. Land-based OFWs pay no EC and start at a ₱8,000 MSC.

**Voluntary or non-working spouse, by approved MSC.** These members choose (or are assigned) an MSC, so look up the exact value:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=voluntary&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&monthly_salary_credit=20000"
```

₱3,000 a month. List the valid choices for a month (the response is the whole table):

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=voluntary&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&sort=row_order&limit=100"
```

A lookup is not SSS approval of a change in MSC. SSS age and history rules may restrict increases. When a new table starts, contributions already paid in advance under the old table may need a minimum top-up. `advance_payment_transition_json` in the `laws` table lists the published minimums (₱190 for self-employed and voluntary members, ₱80 for land-based OFWs, in the 2025 transition):

```sh
curl -g "https://api.nocodebackend.com/read/laws?Instance=37012_ph_contributions&fund=sss&law_code=sss-voluntary-nws-2025"
```

## 4. Reverse: estimate income from a payslip SSS deduction

A payslip shows a ₱1,500 SSS deduction for June 2025. Search by `employee_pays`:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&employee_pays=1500"
```

The one row returned has `salary_min: "29750.00"` and `salary_max: "30249.99"`, so the estimate is **₱29,750.00 – ₱30,249.99 a month** from that employer (MSC ₱30,000).

```js
const [row] = await sssRates({ member_type: 'employed', 'valid_from[lte]': '2025-06-30', 'valid_until[gte]': '2025-06-30', employee_pays: '1500' });
const estimate = row.no_upper_limit ? `₱${row.salary_min} or more` : `₱${row.salary_min} – ₱${row.salary_max}`;
```

At the top of the table, only a minimum is possible. A ₱1,750 deduction means **₱34,750 or more**:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&employee_pays=1750"
```

Caveats:

- It is an estimate of compensation **from one employer** for that month. Someone with several jobs has a separate contribution for each.
- It is not proof of income. Compensation that SSS excludes, or an employer error, makes the deduction differ from actual pay.
- Pick the month the payslip covers, since the law changed in January 2025.
- For household helpers, a ₱0 deduction only says the pay was under ₱5,000 (see [ambiguous amounts](api.md#amounts-that-match-more-than-one-row)).

## 5. Reverse: check a remittance or receipt

Is ₱4,530 a valid June 2025 total for one employee?

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&total=4530"
```

Yes: MSC ₱30,000, employee ₱1,500, employer ₱3,030. An amount that matches no table row is a sign of an error:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&total=4531"  # returns no rows
```

To check a monthly total for many employees, look up each employee's row (use case 1) and compare the sum. A combined total cannot be reversed into individual salaries.

## 6. Reverse: check a member's declared salary credit

A voluntary member paid ₱3,000 for June 2025. Which MSC does that correspond to?

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=voluntary&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&member_pays=3000"
```

MSC ₱20,000. If the member says they declared ₱25,000, the expected payment is ₱3,750 (`monthly_salary_credit=25000`), so they underpaid. If the paid amount is not in the table, the nearest-below search shows the highest MSC it would fully cover:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=voluntary&valid_from[lte]=2025-06-30&valid_until[gte]=2025-06-30&member_pays[lte]=3100&sort=member_pays&order=desc&limit=1"
```

## 7. Year-boundary and back-dated payroll

Always pass the month the income was earned, not today's date. The same ₱26,000 salary gives different amounts on either side of 1 January 2025:

```sh
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2024-12-31&valid_until[gte]=2024-12-31&salary_min[lte]=26000&salary_max[gte]=26000"
curl -g "https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-01-31&valid_until[gte]=2025-01-31&salary_min[lte]=26000&salary_max[gte]=26000"
```

| Income month | Law | Employee | Employer | Total |
|---|---|---|---|---|
| December 2024 | Circular 2022-033 | ₱1,170 | ₱2,500 | ₱3,670 |
| January 2025 | Circular 2024-006 | ₱1,300 | ₱2,630 | ₱3,930 |

A December salary paid in January still uses December's law. When re-running old payroll, query each month separately. When SSS issues a new circular, the API gains new rows from its effective date, and the same code picks them up automatically.
