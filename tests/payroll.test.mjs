import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCompensation as normalize, allocateContribution as allocate, validateMemberSchedule, getMemberContribution } from '../dist/index.js';
const official = JSON.parse(readFileSync(new URL('../data/contributions/employed/2025.json', import.meta.url)));
const allocation = (overrides={}) => ({ monthlyEmployeeCentavos:1001, strategy:'equal', periods:[{id:'a'},{id:'b'}], ...overrides });

test('all annualized frequencies round half up using exact ratios',()=>{
 for (const [frequency, amountCentavos, paidDaysPerMonth, expected] of [
  ['monthly',12345,undefined,12345],['semi-monthly',12345,undefined,24690],
  ['biweekly',3,undefined,7],['weekly',1,undefined,4],['daily',12345,22,271590],
 ]) assert.deepEqual(normalize({mode:'annualized',frequency,amountCentavos,paidDaysPerMonth}),{monthlyCentavos:expected,estimated:true});
 assert.deepEqual(normalize({mode:'actual',earningsCentavos:[0,123,456]}),{monthlyCentavos:579,estimated:false});
});
test('compensation rejects invalid options, unsafe amounts, and sparse arrays',()=>{
 for(const input of [null,{}, {mode:'bogus'}, {mode:'actual',earningsCentavos:[]}, {mode:'actual',earningsCentavos:Array(1)}, {mode:'actual',earningsCentavos:[-1]}, {mode:'annualized',amountCentavos:1,frequency:'hourly'}, ...[0,32,1.5,undefined].map(paidDaysPerMonth=>({mode:'annualized',amountCentavos:100,frequency:'daily',paidDaysPerMonth}))]) assert.throws(()=>normalize(input));
 for(const input of [{mode:'actual',earningsCentavos:[Number.MAX_SAFE_INTEGER,1]}, {mode:'annualized',amountCentavos:Number.MAX_SAFE_INTEGER,frequency:'semi-monthly'}]) assert.throws(()=>normalize(input),/OVERFLOW/);
 assert.equal(normalize({mode:'annualized',amountCentavos:Number.MAX_SAFE_INTEGER,frequency:'monthly'}).monthlyCentavos,Number.MAX_SAFE_INTEGER);
});
test('zero-weight periods never receive rounding residue',()=>{
 assert.deepEqual(allocate(allocation({monthlyEmployeeCentavos:1,strategy:'proportional',periods:[{id:'a',weight:1},{id:'b',weight:1},{id:'closed',weight:0}]})),[{id:'a',additionalDeductionCentavos:0},{id:'b',additionalDeductionCentavos:1},{id:'closed',additionalDeductionCentavos:0}]);
});
test('single and reconcile allocate remaining liability to the named period',()=>{
 for(const strategy of ['single','reconcile']) assert.deepEqual(allocate(allocation({strategy,targetPeriodId:'b',periods:[{id:'a',alreadyDeductedCentavos:400},{id:'b'}]})),[{id:'a',additionalDeductionCentavos:0},{id:'b',additionalDeductionCentavos:601}]);
 assert.deepEqual(allocate(allocation({periods:[{id:'a',alreadyDeductedCentavos:1001}]})),[{id:'a',additionalDeductionCentavos:0}]);
});
test('allocation rejects ambiguous or invalid requests',()=>{
 for(const changes of [{strategy:'unknown'},{periods:[]},{periods:Array(2)},{periods:[{id:''}]},{periods:[{id:'a'},{id:'a'}]},{strategy:'single'},{strategy:'reconcile',targetPeriodId:'missing'},{strategy:'proportional',periods:[{id:'a'}]},{strategy:'proportional',periods:[{id:'a',weight:0}]},{strategy:'proportional',periods:[{id:'a',weight:0.5}]},{periods:[{id:'a',alreadyDeductedCentavos:1002}]}]) assert.throws(()=>allocate(allocation(changes)));
});
test('allocation conserves centavos across totals, prior deductions and weight patterns',()=>{
 for(const total of [0,1,2,99,1001,175000,Number.MAX_SAFE_INTEGER]) for(const weights of [[1],[1,1],[1,2,0],[0,1,0],[5,0,7,9],[Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,0]]) for(const deducted of [0,Math.floor(total/2),total]) {
  const periods=weights.map((weight,i)=>({id:String(i),weight,alreadyDeductedCentavos:i===0?deducted:0}));
  const result=allocate({monthlyEmployeeCentavos:total,strategy:'proportional',periods});
  assert.equal(result.reduce((a,p)=>a+BigInt(p.additionalDeductionCentavos),BigInt(deducted)),BigInt(total));
  for(const [i,p] of result.entries()) { assert.ok(Number.isSafeInteger(p.additionalDeductionCentavos)&&p.additionalDeductionCentavos>=0); if(weights[i]===0) assert.equal(p.additionalDeductionCentavos,0); }
 }
});
test('runtime schedule validation rejects missing fields, bad bounds and invalid dates',()=>{
 const mutations=[s=>delete s.id,s=>s.verified='true',s=>s.sourceUrl='fixture',s=>s.effectiveFrom='2025-02-30',s=>s.effectiveFrom='0000-01-01',s=>s.effectiveTo='2024-12-31',s=>s.effectiveTo='2025-01-01',s=>delete s.effectiveTo,s=>delete s.brackets[0].employeeMPFCentavos,s=>s.brackets[0].maxExclusiveCentavos=525000.5,s=>s.brackets[0].minCentavos=1,s=>s.brackets[0].maxExclusiveCentavos=null,s=>s.brackets.at(-1).maxExclusiveCentavos=4000000,s=>s.brackets[0].employeeSSCentavos=Number.MAX_SAFE_INTEGER,s=>delete s.brackets[0]];
 for(const mutate of mutations) { const s=structuredClone(official);mutate(s);assert.throws(()=>validateMemberSchedule(s)); }
 const s=structuredClone(official);s.effectiveFrom='2024-02-29';assert.doesNotThrow(()=>validateMemberSchedule(s));
});
test('lookup validates all schedules and protects source data from result mutation',()=>{
 for(const applicableMonth of ['2025-00','2025-13','2025-1','0000-01',null,2025]) assert.throws(()=>getMemberContribution({memberCategory:'employed',basis:'compensation',monthlyCompensationCentavos:0,applicableMonth,schedules:[official]}),/INVALID_PERIOD/);
 const malformed={...official,effectiveFrom:'9999-99-99'};
 assert.throws(()=>getMemberContribution({memberCategory:'employed',basis:'compensation',monthlyCompensationCentavos:0,applicableMonth:'2025-01',schedules:[official,malformed]}),/INVALID_EFFECTIVE_DATE/);
 const r=getMemberContribution({memberCategory:'employed',basis:'compensation',monthlyCompensationCentavos:0,applicableMonth:'2025-01',schedules:[official]});r.breakdown.employeeSSCentavos=0;assert.equal(official.brackets[0].employeeSSCentavos,25000);
});
test('actual monthly earnings flow through lookup and two-period reconciliation',()=>{
 const monthly=normalize({mode:'actual',earningsCentavos:[1200000,1400000]});
 const c=getMemberContribution({memberCategory:'employed',basis:'compensation',monthlyCompensationCentavos:monthly.monthlyCentavos,applicableMonth:'2025-06',schedules:[official]});
 assert.equal(c.employeeCentavos,130000);assert.equal(c.employerCentavos,263000);assert.equal(c.grandTotalCentavos,393000);
 assert.deepEqual(allocate({monthlyEmployeeCentavos:c.employeeCentavos,strategy:'reconcile',targetPeriodId:'second',periods:[{id:'first',alreadyDeductedCentavos:60000},{id:'second'}]}),[{id:'first',additionalDeductionCentavos:0},{id:'second',additionalDeductionCentavos:70000}]);
});
