export type Frequency = 'monthly'|'semi-monthly'|'biweekly'|'weekly'|'daily';
export type Bracket = { minCentavos:number; maxExclusiveCentavos:number|null; monthlySalaryCreditCentavos:number; employeeSSCentavos:number; employeeMPFCentavos:number; employerSSCentavos:number; employerMPFCentavos:number; employerECCentavos:number };
export type Schedule = { id:string; effectiveFrom:string; effectiveTo:string|null; sourceUrl:string; verified:boolean; brackets:Bracket[] };
export type AllocationStrategy = 'equal'|'single'|'proportional'|'reconcile';
const integer=(n:number,name:string)=>{if(!Number.isSafeInteger(n)||n<0)throw new Error(`INVALID_${name.toUpperCase()}`);return n};
export function normalizeCompensation(input:{amountCentavos:number;frequency:Frequency;mode:'annualized';paidDaysPerMonth?:number}|{mode:'actual';earningsCentavos:number[]}):{monthlyCentavos:number;estimated:boolean}{
 if(input.mode==='actual')return {monthlyCentavos:input.earningsCentavos.reduce((s,n)=>s+integer(n,'earnings'),0),estimated:false};
 const amount=integer(input.amountCentavos,'amount');
 const factors:Record<Exclude<Frequency,'daily'>,number>={monthly:1,'semi-monthly':2,biweekly:26/12,weekly:52/12};
 if(input.frequency==='daily') {const d=input.paidDaysPerMonth;if(d===undefined||!Number.isSafeInteger(d)||d<=0||d>31)throw new Error('INVALID_PAID_DAYS');return {monthlyCentavos:Math.round(amount*d),estimated:true};}
 return {monthlyCentavos:Math.round(amount*factors[input.frequency]),estimated:true};
}
export function validateSchedule(s:Schedule):void{
 if(!s.verified||!s.brackets.length)throw new Error('UNVERIFIED_SCHEDULE');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s.effectiveFrom))throw new Error('INVALID_EFFECTIVE_DATE');
 let prev=0;
 for(const b of s.brackets){if(b.minCentavos!==prev)throw new Error('BRACKET_GAP_OR_OVERLAP');for(const [k,v] of Object.entries(b))if(k!=='maxExclusiveCentavos')integer(v as number,k);if(b.maxExclusiveCentavos===null){if(b!==s.brackets.at(-1))throw new Error('INVALID_FINAL_BRACKET');}else{if(b.maxExclusiveCentavos<=b.minCentavos)throw new Error('INVALID_BRACKET');prev=b.maxExclusiveCentavos;}}
 if(s.brackets.at(-1)?.maxExclusiveCentavos!==null)throw new Error('MISSING_OPEN_ENDED_BRACKET');
}
export function getContribution(input:{monthlyCompensationCentavos:number;applicableMonth:string;schedules:Schedule[]}){
 const {monthlyCompensationCentavos:amount,applicableMonth,schedules}=input;integer(amount,'compensation');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(applicableMonth))throw new Error('INVALID_PERIOD');
 const date=applicableMonth+'-01';const matches=schedules.filter(s=>s.effectiveFrom<=date&&(s.effectiveTo===null||date<s.effectiveTo));
 if(matches.length!==1)throw new Error('UNSUPPORTED_OR_AMBIGUOUS_PERIOD');const schedule=matches[0];validateSchedule(schedule);
 const bracket=schedule.brackets.find(b=>amount>=b.minCentavos&&(b.maxExclusiveCentavos===null||amount<b.maxExclusiveCentavos));if(!bracket)throw new Error('NO_BRACKET');
 const employee=bracket.employeeSSCentavos+bracket.employeeMPFCentavos;
 const employer=bracket.employerSSCentavos+bracket.employerMPFCentavos+bracket.employerECCentavos;
 return {scheduleId:schedule.id,sourceUrl:schedule.sourceUrl,monthlyCompensationCentavos:amount,monthlySalaryCreditCentavos:bracket.monthlySalaryCreditCentavos,employeeCentavos:employee,employerCentavos:employer,grandTotalCentavos:employee+employer,breakdown:bracket};
}
export function allocateContribution(input:{monthlyEmployeeCentavos:number;strategy:AllocationStrategy;periods:{id:string;weight?:number;alreadyDeductedCentavos?:number}[];targetPeriodId?:string}){
 const total=integer(input.monthlyEmployeeCentavos,'monthly_total');const {periods,strategy}=input;if(!periods.length||new Set(periods.map(p=>p.id)).size!==periods.length)throw new Error('INVALID_PERIODS');
 const already=periods.map(p=>integer(p.alreadyDeductedCentavos??0,'deducted'));const remaining=total-already.reduce((a,b)=>a+b,0);if(remaining<0)throw new Error('OVER_DEDUCTED');
 const weights=periods.map(p=>strategy==='proportional'?integer(p.weight??0,'weight'):1);
 if(strategy==='single'||strategy==='reconcile'){const idx=periods.findIndex(p=>p.id===input.targetPeriodId);if(idx<0)throw new Error('TARGET_PERIOD_REQUIRED');return periods.map((p,i)=>({id:p.id,additionalDeductionCentavos:i===idx?remaining:0}));}
 const sum=weights.reduce((a,b)=>a+b,0);if(sum<=0)throw new Error('INVALID_WEIGHTS');let used=0;
 return periods.map((p,i)=>{const value=i===periods.length-1?remaining-used:Math.floor(remaining*weights[i]/sum);used+=value;return {id:p.id,additionalDeductionCentavos:value};});
}
