import { readFileSync } from 'node:fs';
import { normalizeCompensation, getMemberContribution, allocateContribution } from '../dist/index.js';
const schedules = [2023,2025].map(year => JSON.parse(readFileSync(new URL(`../data/contributions/employed/${year}.json`, import.meta.url))));
// PHP 12,000 + PHP 14,000 of actual applicable-month earnings, in centavos.
const earnings = normalizeCompensation({mode:'actual',earningsCentavos:[1200000,1400000]});
const contribution = getMemberContribution({memberCategory:'employed',basis:'compensation',monthlyCompensationCentavos:earnings.monthlyCentavos,applicableMonth:'2025-06',schedules});
// The first cutoff already withheld PHP 600. Reconcile the remaining PHP 700.
const deductions = allocateContribution({monthlyEmployeeCentavos:contribution.employeeCentavos,strategy:'reconcile',targetPeriodId:'second',periods:[{id:'first',alreadyDeductedCentavos:60000},{id:'second'}]});
console.log(JSON.stringify({monthlyEarningsCentavos:earnings.monthlyCentavos,employeeCentavos:contribution.employeeCentavos,employerCentavos:contribution.employerCentavos,grandTotalCentavos:contribution.grandTotalCentavos,deductions},null,2));
