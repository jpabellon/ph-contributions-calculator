import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getContribution, validateSchedule } from '../dist/index.js';
const read = p => readFileSync(new URL(p, import.meta.url));
const schedules = [2023,2025].map(y=>JSON.parse(read(`../data/employed/${y}.json`)));
const lookup = (amount, month) => getContribution({monthlyCompensationCentavos:amount, applicableMonth:month, schedules});
for (const [i,year] of [2023,2025].entries()) {
 const s=schedules[i];
 const rows=read(`./fixtures/${year}.csv`).toString().trim().split(/\r?\n/).slice(1).map(l=>l.split(',').map(x=>x===''?null:Number(x)));
 test(`${year}: provenance PDF matches recorded SHA-256`,()=>{
  assert.equal(createHash('sha256').update(read(`../data/employed/${s.provenance.sourceFile}`)).digest('hex'),s.provenance.sha256);
  const registry=JSON.parse(read('../data/employed/sources.json')).schedules[i];
  assert.equal(registry.sha256,s.provenance.sha256);
  assert.equal(registry.verified,s.verified);
 });
 test(`${year}: full contiguous schedule`,()=>{
  validateSchedule(s); assert.equal(rows.length,year===2023?53:61); assert.equal(s.brackets.length,rows.length);
 });
 for (const [n,row] of rows.entries()) {
  const [min,max,msc,erSS,eeSS,ec,erMPF,eeMPF,erTotal,eeTotal,total]=row;
  const expected={minCentavos:min,maxExclusiveCentavos:max,monthlySalaryCreditCentavos:msc,employeeSSCentavos:eeSS,employeeMPFCentavos:eeMPF,employerSSCentavos:erSS,employerMPFCentavos:erMPF,employerECCentavos:ec};
  test(`${year} row ${n+1}: printed components and totals reconcile`,()=>{
   assert.deepEqual(s.brackets[n],expected);
   const r=lookup(min,`${year}-01`);
   assert.equal(r.employerCentavos,erTotal); assert.equal(r.employeeCentavos,eeTotal); assert.equal(r.grandTotalCentavos,total);
   assert.equal(erSS+erMPF+ec,erTotal); assert.equal(eeSS+eeMPF,eeTotal); assert.equal(erTotal+eeTotal,total);
   // Independent integer statutory cross-check, in addition to printed-column fixtures.
   const eeBasis=year===2023?450:500, erBasis=year===2023?950:1000;
   assert.equal(eeSS,Math.min(msc,2000000)*eeBasis/10000);
   assert.equal(erSS,Math.min(msc,2000000)*erBasis/10000);
   assert.equal(eeMPF,Math.max(msc-2000000,0)*eeBasis/10000);
   assert.equal(erMPF,Math.max(msc-2000000,0)*erBasis/10000);
   assert.equal(ec,msc<1500000?1000:3000);
  });
  test(`${year} row ${n+1}: every centavo boundary and interior`,()=>{
   const amounts=[min,min+1,max===null?Number.MAX_SAFE_INTEGER:Math.floor((min+max)/2),...(max===null?[]:[max-1])];
   for(const a of amounts) assert.deepEqual(lookup(a,`${year}-06`).breakdown,expected);
   if(n>0) assert.deepEqual(lookup(min-1,`${year}-06`).breakdown,s.brackets[n-1]);
   if(max!==null) assert.deepEqual(lookup(max,`${year}-06`).breakdown,s.brackets[n+1]);
  });
 }
}
test('effective dates select exactly one schedule across 2023–2025 transition',()=>{
 for(const month of ['2023-01','2023-12','2024-01','2024-12']) assert.equal(lookup(3000000,month).scheduleId,'sss-employed-2023');
 for(const month of ['2025-01','2025-12']) assert.equal(lookup(3000000,month).scheduleId,'sss-employed-2025');
 assert.throws(()=>lookup(1,'2022-12'),/UNSUPPORTED_OR_AMBIGUOUS_PERIOD/);
});
test('legacy 2025-01 file has identical data and provenance; use only one copy',()=>{
 const alias=JSON.parse(read('../data/employed/2025-01.json'));
 assert.deepEqual({...alias,id:schedules[1].id},schedules[1]);
 assert.throws(()=>getContribution({monthlyCompensationCentavos:0,applicableMonth:'2025-01',schedules:[schedules[1],alias]}),/UNSUPPORTED_OR_AMBIGUOUS_PERIOD/);
});
test('unverified flag and invalid compensation cannot be bypassed',()=>{
 for(const s of schedules) assert.throws(()=>validateSchedule({...s,verified:false}),/UNVERIFIED_SCHEDULE/);
 for(const a of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>lookup(a,'2025-01'),/INVALID_COMPENSATION/);
});
