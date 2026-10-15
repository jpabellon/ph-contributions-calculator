import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { getMemberContribution } from '../dist/index.js';
const base = new URL('../data/contributions/',import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('index.json',base)));
const schedules = catalog.schedules.map(s=>JSON.parse(readFileSync(new URL(s.path,base))));
const scenarios = [
  ['employed','compensation',2600000,393000],
  ['household','compensation',499999,76000],
  ['household','compensation',500000,76000],
  ['self-employed','compensation',2600000,393000],
  ['land-based-ofw','compensation',700000,120000],
  ['voluntary','salary-credit',2600000,390000],
  // The approved NWS MSC is an input; it is not inferred from personal earnings.
  ['non-working-spouse','salary-credit',1000000,150000],
  ['sea-based-ofw','compensation',2600000,393000],
];
for(const [memberCategory,basis,amount,expected] of scenarios) {
  const result=getMemberContribution({memberCategory,basis,applicableMonth:'2025-06',schedules,...(basis==='compensation'?{monthlyCompensationCentavos:amount}:{monthlySalaryCreditCentavos:amount})});
  assert.equal(result.grandTotalCentavos,expected);
  console.log(JSON.stringify({memberCategory,basis,amount,employeeCentavos:result.employeeCentavos,employerCentavos:result.employerCentavos,memberCentavos:result.memberCentavos,grandTotalCentavos:result.grandTotalCentavos}));
}
