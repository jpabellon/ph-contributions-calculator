import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MEMBER_CATEGORIES, validateMemberSchedule, getMemberContribution, getContribution } from '../dist/index.js';
const read = p=>readFileSync(new URL(p,import.meta.url));
const catalog = JSON.parse(read('../data/contributions/index.json'));
const schedules = catalog.schedules.map(entry=>JSON.parse(read(`../data/contributions/${entry.path}`)));
const query = (memberCategory, amount, applicableMonth='2025-01', basis='compensation')=>getMemberContribution({memberCategory,applicableMonth,schedules,basis,...(basis==='compensation'?{monthlyCompensationCentavos:amount}:{monthlySalaryCreditCentavos:amount})});
const components=['employeeSSCentavos','employeeMPFCentavos','employerSSCentavos','employerMPFCentavos','employerECCentavos','memberSSCentavos','memberMPFCentavos','memberECCentavos'];
for(const [i,s] of schedules.entries()) {
 const entry=catalog.schedules[i];
 const lines=read(`../data/contributions/transcriptions/${entry.circular}.csv`).toString().trim().split(/\r?\n/);
 const headers=lines.shift().split(',');
 const rows=lines.map(line=>Object.fromEntries(line.split(',').map((value,j)=>[headers[j],value===''?null:Number(value)])));
 const year=s.effectiveFrom.slice(0,4);
 test(`${s.id}: source snapshot, registry, category and complete row coverage`,()=>{
  validateMemberSchedule(s);
  assert.equal(s.brackets.length,entry.bracketCount);assert.equal(rows.length,entry.bracketCount);
  assert.equal(createHash('sha256').update(read(`../data/contributions/${s.provenance.sourceFile}`)).digest('hex'),s.provenance.sha256);
  assert.equal(entry.sha256,s.provenance.sha256);assert.deepEqual(entry.memberCategories,s.memberCategories);assert.equal(entry.verified,s.verified);
  assert.equal(s.provenance.circular,entry.circular);
  assert.equal(s.brackets[0].minCentavos,0);assert.equal(s.brackets.at(-1).maxExclusiveCentavos,null);
 });
 for(const [n,row] of rows.entries()) {
  const {grandTotalCentavos,...expected}=row;
  test(`${s.id} row ${n+1}: all printed components, totals and statutory arithmetic`,()=>{
   assert.deepEqual(s.brackets[n],expected);
   assert.equal(components.reduce((a,k)=>a+expected[k],0),grandTotalCentavos);
   const rate=year==='2023'?14:15;
   const msc=expected.monthlySalaryCreditCentavos;
   assert.equal(expected.employeeSSCentavos+expected.employerSSCentavos+expected.memberSSCentavos,Math.min(msc,2000000)*rate/100);
   assert.equal(expected.employeeMPFCentavos+expected.employerMPFCentavos+expected.memberMPFCentavos,Math.max(msc-2000000,0)*rate/100);
   const kind=s.memberCategories[0];
   const withEC=['employed','household','self-employed'].includes(kind);
   assert.equal(expected.employerECCentavos+expected.memberECCentavos,withEC?(msc<1500000?1000:3000):0);
   if(kind==='household' && expected.minCentavos<500000) {assert.equal(expected.employeeSSCentavos,0);assert.equal(expected.employerSSCentavos,msc*rate/100);}
   if(['employed','household'].includes(kind) && (kind!=='household'||expected.minCentavos>=500000)) {
    assert.equal(expected.employeeSSCentavos,Math.min(msc,2000000)*(year==='2023'?45:50)/1000);
    assert.equal(expected.employerMPFCentavos,Math.max(msc-2000000,0)*(year==='2023'?95:100)/1000);
   }
   for(const category of s.memberCategories) {
    const isSelected=['voluntary','non-working-spouse'].includes(category);
    const r=query(category,isSelected?msc:expected.minCentavos,`${year}-06`,isSelected?'salary-credit':'compensation');
    assert.equal(r.grandTotalCentavos,grandTotalCentavos);
    assert.equal(r.employerCentavos+r.employeeCentavos+r.memberCentavos,grandTotalCentavos);
    assert.equal(r.memberCategory,category);assert.deepEqual(r.breakdown,expected);
   }
  });
  if(!s.memberCategories.includes('household') && !s.memberCategories.includes('employed')) test(`${s.id} row ${n+1}: exact MSC selection rejects adjacent centavos`,()=>{
   for(const category of s.memberCategories) {
    assert.deepEqual(query(category,expected.monthlySalaryCreditCentavos,`${year}-06`,'salary-credit').breakdown,expected);
    for(const delta of [-1,1]) assert.throws(()=>query(category,expected.monthlySalaryCreditCentavos+delta,`${year}-06`,'salary-credit'),/UNSUPPORTED_SALARY_CREDIT/);
   }
  });
  if(!s.memberCategories.includes('voluntary')) test(`${s.id} row ${n+1}: adjacent centavo boundaries and cap`,()=>{
   for(const category of s.memberCategories) {
    for(const amount of [expected.minCentavos,expected.minCentavos+1,expected.maxExclusiveCentavos===null?Number.MAX_SAFE_INTEGER:expected.maxExclusiveCentavos-1]) assert.deepEqual(query(category,amount,`${year}-06`).breakdown,expected);
    if(n>0) assert.deepEqual(query(category,expected.minCentavos-1,`${year}-06`).breakdown,s.brackets[n-1]);
    if(expected.maxExclusiveCentavos!==null) assert.deepEqual(query(category,expected.maxExclusiveCentavos,`${year}-06`).breakdown,s.brackets[n+1]);
   }
  });
 }
}
test('every category has unambiguous 2023/2024 and 2025 coverage',()=>{
 for(const c of MEMBER_CATEGORIES) for(const month of ['2023-01','2024-12','2025-01','2025-12']) {
  const basis=['voluntary','non-working-spouse'].includes(c)?'salary-credit':'compensation';
  assert.ok(query(c,1000000,month,basis).scheduleId.endsWith(month<'2025-01'?'2023':'2025'));
 }
 for(const c of MEMBER_CATEGORIES) assert.throws(()=>query(c,1000000,'2022-12'),/UNSUPPORTED_OR_AMBIGUOUS_PERIOD/);
});
test('household exact PHP5,000 threshold changes payer, not total MSC',()=>{
 for(const [year,total,employee,employer] of [['2023',71000,22500,48500],['2025',76000,25000,51000]]) {
  const below=query('household',499999,`${year}-01`),at=query('household',500000,`${year}-01`);
  assert.equal(below.monthlySalaryCreditCentavos,500000);assert.equal(at.monthlySalaryCreditCentavos,500000);
  assert.equal(below.employeeCentavos,0);assert.equal(below.employerCentavos,total);
  assert.equal(at.employeeCentavos,employee);assert.equal(at.employerCentavos,employer);assert.equal(at.grandTotalCentavos,total);
 }
});
test('payer totals distinguish all categories at minimum and maximum',()=>{
 assert.equal(query('self-employed',0).memberCentavos,76000);
 assert.equal(query('land-based-ofw',0).memberCentavos,120000);
 assert.equal(query('voluntary',500000,'2025-01','salary-credit').memberCentavos,75000);
 assert.equal(query('non-working-spouse',500000,'2025-01','salary-credit').memberCentavos,75000);
 for(const c of ['self-employed','land-based-ofw','voluntary','non-working-spouse']) {
  const r=query(c,3500000,'2025-01','salary-credit');assert.equal(r.employeeCentavos,0);assert.equal(r.employerCentavos,0);
  assert.equal(r.memberCentavos,c==='self-employed'?528000:525000);
 }
 assert.deepEqual(query('sea-based-ofw',1000000).breakdown,query('employed',1000000).breakdown);
});
test('selected MSC is exact and cannot bypass household compensation thresholds',()=>{
 for(const c of ['employed','household','sea-based-ofw']) assert.throws(()=>query(c,500000,'2025-01','salary-credit'),/COMPENSATION_BASIS_REQUIRED/);
 for(const c of ['voluntary','non-working-spouse']) assert.throws(()=>query(c,500000),/SALARY_CREDIT_BASIS_REQUIRED/);
 for(const [c,msc] of [['voluntary',0],['voluntary',525000],['voluntary',3550000],['land-based-ofw',750000]]) assert.throws(()=>query(c,msc,'2025-01','salary-credit'),/UNSUPPORTED_SALARY_CREDIT/);
});
test('wrong categories, unverified data, ambiguous schedules and invalid requests fail closed',()=>{
 assert.throws(()=>query('unknown',1),/INVALID_MEMBER_CATEGORY/);
 assert.throws(()=>getMemberContribution({memberCategory:'employed',basis:'compensation',monthlyCompensationCentavos:0,applicableMonth:'2025-01',schedules:schedules.filter(s=>!s.memberCategories.includes('employed'))}),/UNSUPPORTED_OR_AMBIGUOUS_PERIOD/);
 for(const basis of ['unknown',null]) assert.throws(()=>getMemberContribution({memberCategory:'employed',applicableMonth:'2025-01',schedules,basis,monthlyCompensationCentavos:0}),/INVALID_BASIS/);
 for(const amount of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>query('employed',amount),/INVALID_AMOUNT/);
 assert.throws(()=>getMemberContribution({memberCategory:'employed',applicableMonth:'2025-01',schedules:[...schedules,schedules.find(s=>s.id==='sss-employed-2025')],basis:'compensation',monthlyCompensationCentavos:0}),/UNSUPPORTED_OR_AMBIGUOUS_PERIOD/);
 assert.throws(()=>validateMemberSchedule({...schedules[0],verified:false}),/UNVERIFIED_SCHEDULE/);
 assert.throws(()=>getContribution({monthlyCompensationCentavos:0,applicableMonth:'2025-01',schedules}),/USE_MEMBER_CONTRIBUTION_API/);
 for(const mutate of [s=>s.memberCategories=['unknown'],s=>s.memberCategories=['employed','self-employed'],s=>s.memberCategories=[],s=>s.schemaVersion=1,s=>s.brackets[0].memberSSCentavos=1,s=>delete s.brackets[0].memberECCentavos,s=>s.brackets[0].mpfSalaryCreditCentavos=1]) {
  const s=structuredClone(schedules[0]);mutate(s);assert.throws(()=>validateMemberSchedule(s));
 }
 const r=query('self-employed',500000);r.breakdown.memberSSCentavos=1;assert.equal(query('self-employed',500000).breakdown.memberSSCentavos,75000);
});
test('generalized employed tables preserve every legacy employed component',()=>{
 for(const year of [2023,2025]) {
  const legacy=JSON.parse(read(`../data/employed/${year}.json`));
  const modern=schedules.find(s=>s.id===`sss-employed-${year}`);
  for(const [i,row] of legacy.brackets.entries()) for(const key of Object.keys(row)) assert.equal(modern.brackets[i][key],row[key]);
 }
});

test('catalog data is accessible through package export paths',()=>{
 assert.deepEqual(JSON.parse(readFileSync(new URL(import.meta.resolve('ph-sss-contributions/data/contributions/index.json')))),catalog);
});
test('member schema rejects incorrect units, currency, unsafe totals and EC assignment',()=>{
 for(const change of [s=>s.currency='USD',s=>delete s.monetaryUnit,s=>s.memberCategories=['voluntary'],s=>s.brackets[0].memberECCentavos=Number.MAX_SAFE_INTEGER]) {
  const s=structuredClone(schedules.find(s=>s.id==='sss-self-employed-2025'));change(s);assert.throws(()=>validateMemberSchedule(s));
 }
 const input={memberCategory:'voluntary',basis:'salary-credit',monthlySalaryCreditCentavos:500000,applicableMonth:'2025-01',schedules};
 for(const value of [null,{}, {...input,applicableMonth:'2025-13'}, {...input,schedules:Array(1)}, {...input,monthlyCompensationCentavos:0}]) assert.throws(()=>getMemberContribution(value));
});
test('advance-payment transition metadata preserves circular-specific minimum top-ups',()=>{
 for(const s of schedules) {
  if(!s.advancePaymentTransition) continue;
  const year=s.effectiveFrom.slice(0,4), ofw=s.memberCategories.includes('land-based-ofw');
  assert.equal(s.advancePaymentTransition.minimumMonthlyTopUpCentavos,ofw?8000:year==='2023'?17000:19000);
  assert.equal(s.advancePaymentTransition.automaticPostingImplemented,false);
 }
});
