import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompensation, allocateContribution, getContribution } from '../dist/index.js';
test('semi-monthly compensation annualizes to monthly', () => {
  assert.deepEqual(normalizeCompensation({amountCentavos:1000000,frequency:'semi-monthly',mode:'annualized'}),{monthlyCentavos:2000000,estimated:true});
});
test('actual earnings sum', () => {
  assert.deepEqual(normalizeCompensation({mode:'actual',earningsCentavos:[1200000,1400000]}),{monthlyCentavos:2600000,estimated:false});
});
test('equal allocation reconciles rounding', () => {
  assert.deepEqual(allocateContribution({monthlyEmployeeCentavos:1001,strategy:'equal',periods:[{id:'a'},{id:'b'}]}),[{id:'a',additionalDeductionCentavos:500},{id:'b',additionalDeductionCentavos:501}]);
});
test('unverified schedules are rejected', () => {
  assert.throws(() => getContribution({monthlyCompensationCentavos:10000,applicableMonth:'2025-01',schedules:[{id:'demo',effectiveFrom:'2025-01-01',effectiveTo:null,sourceUrl:'',verified:false,brackets:[]}]}),/UNVERIFIED_SCHEDULE/);
});