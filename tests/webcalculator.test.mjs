import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { getMemberContribution } from '../dist/index.js';
const base = new URL('../samples/webcalculator/', import.meta.url);
const context = vm.createContext({ URL });
for (const file of ['vendor/sss-contributions.js','vendor/schedules.js','calculator.js']) vm.runInContext(readFileSync(new URL(file,base),'utf8'),context,{filename:file});
const calc=context.SSSCalculator;
const fields=(overrides={})=>({category:'employed',month:'2025-06',basis:'compensation',amount:'26000',frequency:'monthly',days:'22',msc:'',...overrides});
test('checked-in browser artifacts match the actual library source and canonical data',()=>{
 execFileSync(process.execPath,[new URL('../scripts/build-web-sample.mjs',import.meta.url).pathname,'--check']);
});
test('offline browser bundle has no external module, fetch or network dependency',()=>{
 assert.equal(typeof context.SSSContributions.getMemberContribution,'function');
 assert.equal(context.SSSCalculatorData.schedules.length,10);
 assert.equal(context.fetch,undefined);assert.equal(context.require,undefined);
 assert.equal(calc.calculate(fields()).grandTotalCentavos,393000);
});
test('browser sample outputs match the library for every category and bundled bracket',()=>{
 for(const s of context.SSSCalculatorData.schedules) for(const c of s.memberCategories) for(const b of s.brackets) {
  const selected=['voluntary','non-working-spouse'].includes(c);
  const result=calc.calculate(fields({category:c,month:s.effectiveFrom.slice(0,7),basis:selected?'salary-credit':'compensation',msc:String(b.monthlySalaryCreditCentavos),amount:(b.minCentavos/100).toFixed(2)}));
  const expected=getMemberContribution({memberCategory:c,applicableMonth:s.effectiveFrom.slice(0,7),schedules:JSON.parse(JSON.stringify(context.SSSCalculatorData.schedules)),basis:selected?'salary-credit':'compensation',...(selected?{monthlySalaryCreditCentavos:b.monthlySalaryCreditCentavos}:{monthlyCompensationCentavos:b.minCentavos})});
  assert.deepEqual(JSON.parse(JSON.stringify(result.breakdown)),expected.breakdown);
  assert.equal(result.grandTotalCentavos,expected.grandTotalCentavos);
 }
});
test('peso parsing preserves centavos and rejects silently rounded, unsafe or malformed values',()=>{
 for(const [input,expected] of [['0',0],['0.01',1],['26,000.50',2600050],[' 26000.5 ',2600050],['90071992547409.91',Number.MAX_SAFE_INTEGER]]) assert.equal(calc.parsePesos(input),expected);
 for(const input of ['', '-1','1.001','1e4','Infinity','NaN','26,00','1,2,3',null,'90071992547409.92','<script>']) assert.throws(()=>calc.parsePesos(input));
});
test('frequency normalization and selected MSC feed the actual library',()=>{
 assert.equal(calc.calculate(fields({amount:'13000',frequency:'semi-monthly'})).monthlyCompensationCentavos,2600000);
 for(const [frequency,amount,days,expected] of [['weekly','6000','',2600000],['biweekly','12000','',2600000],['daily','1000','26',2600000]]) {
  const r=calc.calculate(fields({frequency,amount,days}));assert.equal(r.monthlyCompensationCentavos,expected);assert.equal(r.estimated,true);
 }
 assert.equal(calc.calculate(fields()).estimated,false);
 assert.equal(calc.calculate(fields({category:'self-employed',basis:'salary-credit',msc:'2600000'})).memberCentavos,393000);
 assert.equal(calc.calculate(fields({category:'voluntary',msc:'2600000'})).memberCentavos,390000);
 assert.equal(calc.calculate(fields({category:'non-working-spouse',msc:'1000000'})).memberCentavos,150000);
});
test('invalid dates, missing MSC, bad days and unsupported selections cannot produce results',()=>{
 for(const input of [{month:'2022-12'},{month:''},{month:'2025-13'},{category:'unknown'},{category:'voluntary',msc:''},{category:'voluntary',msc:'525000'},{category:'land-based-ofw',basis:'salary-credit',msc:'500000'},{frequency:'daily',days:'0'},{frequency:'daily',days:'32'},{frequency:'daily',days:'2.5'},{frequency:'daily',days:''},{frequency:'hourly'},{category:'self-employed',basis:'unknown'}]) assert.throws(()=>calc.calculate(fields(input)));
});
test('household threshold and historical table changes are visible through the browser adapter',()=>{
 const before=calc.calculate(fields({category:'household',amount:'4999.99'}));
 const after=calc.calculate(fields({category:'household',amount:'5000'}));
 assert.equal(before.employeeCentavos,0);assert.equal(before.employerCentavos,76000);
 assert.equal(after.employeeCentavos,25000);assert.equal(after.employerCentavos,51000);
 assert.equal(calc.calculate(fields({month:'2024-12'})).grandTotalCentavos,367000);
 assert.equal(calc.calculate(fields({month:'2025-01'})).grandTotalCentavos,393000);
});
