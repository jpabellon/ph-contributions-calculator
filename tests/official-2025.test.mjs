import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getContribution, validateSchedule } from '../dist/index.js';

const schedule = JSON.parse(readFileSync(new URL('../data/employed/2025.json', import.meta.url), 'utf8'));
const lookup = (salary) => getContribution({monthlyCompensationCentavos: Math.round(salary * 100), applicableMonth:'2025-06', schedules:[schedule]});
test('2025 schedule has 61 contiguous brackets and passes validation', () => {
  assert.equal(schedule.brackets.length,61);
  assert.doesNotThrow(()=>validateSchedule(schedule));
});
test('2025 minimum MSC and EC premium',()=>{
  const r=lookup(4000);
  assert.equal(r.monthlySalaryCreditCentavos,500000);
  assert.equal(r.employeeCentavos,25000);
  assert.equal(r.employerCentavos,51000);
  assert.equal(r.grandTotalCentavos,76000);
});
test('EC changes at 14750 compensation boundary',()=>{
  assert.equal(lookup(14749.99).breakdown.employerECCentavos,1000);
  assert.equal(lookup(14750).breakdown.employerECCentavos,3000);
});
test('MPF begins above 20000 MSC',()=>{
  assert.equal(lookup(20249.99).breakdown.employeeMPFCentavos,0);
  assert.equal(lookup(20250).breakdown.employeeMPFCentavos,2500);
});
test('maximum MSC is capped at 35000',()=>{
  for(const salary of [34750,35000,100000]){
    const r=lookup(salary);
    assert.equal(r.employeeCentavos,175000);
    assert.equal(r.employerCentavos,353000);
    assert.equal(r.grandTotalCentavos,528000);
  }
});
test('every bracket has consistent statutory shares',()=>{
  for(const b of schedule.brackets){
    assert.equal(b.employeeSSCentavos+b.employeeMPFCentavos,b.monthlySalaryCreditCentavos*0.05);
    assert.equal(b.employerSSCentavos+b.employerMPFCentavos,b.monthlySalaryCreditCentavos*0.10);
    assert.equal(b.employeeMPFCentavos,Math.max(0,b.monthlySalaryCreditCentavos-2000000)*0.05);
  }
});