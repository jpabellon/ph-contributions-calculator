import test from 'node:test';
import assert from 'node:assert/strict';
import { getContribution } from '../dist/index.js';

// Fixtures below cover only published sample rows, not a complete official schedule.
// Full production schedules must be independently verified.
test('rejects missing official schedule', () => {
 assert.throws(() => getContribution({monthlyCompensationCentavos:525000,applicableMonth:'2025-01',schedules:[]}),/UNSUPPORTED_OR_AMBIGUOUS_PERIOD/);
});
test('rejects overlapping schedule effective periods', () => {
 const s={id:'fixture',effectiveFrom:'2025-01-01',effectiveTo:null,sourceUrl:'fixture',verified:true,brackets:[{minCentavos:0,maxExclusiveCentavos:null,monthlySalaryCreditCentavos:500000,employeeSSCentavos:25000,employeeMPFCentavos:0,employerSSCentavos:50000,employerMPFCentavos:0,employerECCentavos:1000}]};
 assert.throws(() => getContribution({monthlyCompensationCentavos:500000,applicableMonth:'2025-01',schedules:[s,{...s,id:'duplicate'}]}),/UNSUPPORTED_OR_AMBIGUOUS_PERIOD/);
});
