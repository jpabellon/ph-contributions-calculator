import { validateSchedule, type Bracket, type Schedule } from './core.js';

export const MEMBER_CATEGORIES = ['employed', 'household', 'self-employed', 'land-based-ofw', 'voluntary', 'non-working-spouse', 'sea-based-ofw'] as const;
export type MemberCategory = typeof MEMBER_CATEGORIES[number];
export type MemberBracket = Bracket & {
  regularSalaryCreditCentavos: number; mpfSalaryCreditCentavos: number;
  memberSSCentavos: number; memberMPFCentavos: number; memberECCentavos: number;
};
export type MemberSchedule = Omit<Schedule, 'brackets'> & {
  schemaVersion: 2; currency: 'PHP'; monetaryUnit: 'centavos';
  memberCategories: MemberCategory[]; brackets: MemberBracket[];
};
export type MemberContributionInput = {
  memberCategory: MemberCategory; applicableMonth: string; schedules: MemberSchedule[];
} & (
  | { basis: 'compensation'; monthlyCompensationCentavos: number; monthlySalaryCreditCentavos?: never }
  | { basis: 'salary-credit'; monthlySalaryCreditCentavos: number; monthlyCompensationCentavos?: never }
);
const category = (v: unknown): v is MemberCategory => MEMBER_CATEGORIES.includes(v as MemberCategory);
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const dense = (v: unknown): v is unknown[] => Array.isArray(v) && Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean);
function money(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new Error('INVALID_AMOUNT');
  return v;
}
function total(values: number[]) {
  const n = values.reduce((a,b)=>a+BigInt(b),0n);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('AMOUNT_OVERFLOW');
  return Number(n);
}
const sharedEmployer = (c: MemberCategory) => ['employed','household','sea-based-ofw'].includes(c);
const group = (c: MemberCategory) => c === 'sea-based-ofw' ? 'employed' : c === 'non-working-spouse' ? 'voluntary' : c;

/** Structural/component checks do not authenticate caller-supplied verification assertions. */
export function validateMemberSchedule(s: MemberSchedule): void {
  validateSchedule(s);
  if (s.currency !== 'PHP' || s.monetaryUnit !== 'centavos') throw new Error('INVALID_MONETARY_UNIT');
  if (s.schemaVersion !== 2 || !dense(s.memberCategories) || s.memberCategories.length === 0 ||
      s.memberCategories.some(c=>!category(c)) || new Set(s.memberCategories).size !== s.memberCategories.length ||
      new Set(s.memberCategories.map(group)).size !== 1) throw new Error('INVALID_MEMBER_CATEGORIES');
  const kind = s.memberCategories[0];
  let previousMSC = 0;
  for (const b of s.brackets) {
    for (const key of ['regularSalaryCreditCentavos','mpfSalaryCreditCentavos','memberSSCentavos','memberMPFCentavos','memberECCentavos'] as const) money(b[key]);
    if (total([b.regularSalaryCreditCentavos,b.mpfSalaryCreditCentavos]) !== b.monthlySalaryCreditCentavos ||
        b.regularSalaryCreditCentavos !== Math.min(b.monthlySalaryCreditCentavos,2000000)) throw new Error('INVALID_SALARY_CREDIT_COMPONENTS');
    if (b.monthlySalaryCreditCentavos < previousMSC || (b.monthlySalaryCreditCentavos === previousMSC && kind !== 'household')) throw new Error('INVALID_SALARY_CREDIT_ORDER');
    previousMSC = b.monthlySalaryCreditCentavos;
    const employer = total([b.employerSSCentavos,b.employerMPFCentavos,b.employerECCentavos]);
    const employee = total([b.employeeSSCentavos,b.employeeMPFCentavos]);
    const member = total([b.memberSSCentavos,b.memberMPFCentavos,b.memberECCentavos]);
    total([employer,employee,member]);
    if (sharedEmployer(kind) ? member !== 0 : (employer !== 0 || employee !== 0)) throw new Error('INVALID_PAYER_COMPONENTS');
    if (kind !== 'self-employed' && b.memberECCentavos !== 0) throw new Error('INVALID_EC_PAYER');
  }
}

/** Explicit category and input basis prevent employed-table fallback and household MSC ambiguity. */
export function getMemberContribution(input: MemberContributionInput) {
  if (!object(input)) throw new Error('INVALID_INPUT');
  if (!category(input.memberCategory)) throw new Error('INVALID_MEMBER_CATEGORY');
  if (typeof input.applicableMonth !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(input.applicableMonth)) throw new Error('INVALID_PERIOD');
  if (!dense(input.schedules)) throw new Error('INVALID_SCHEDULES');
  input.schedules.forEach(validateMemberSchedule);
  const date = input.applicableMonth + '-01';
  const matches = input.schedules.filter(s=>s.memberCategories.includes(input.memberCategory) && s.effectiveFrom <= date && (s.effectiveTo === null || date < s.effectiveTo));
  if (matches.length !== 1) throw new Error('UNSUPPORTED_OR_AMBIGUOUS_PERIOD');
  const schedule = matches[0];
  let bracket: MemberBracket | undefined;
  if (input.basis === 'compensation') {
    if (input.monthlySalaryCreditCentavos !== undefined || ['voluntary','non-working-spouse'].includes(input.memberCategory)) throw new Error('SALARY_CREDIT_BASIS_REQUIRED');
    const amount = money(input.monthlyCompensationCentavos);
    bracket = schedule.brackets.find(b=>amount >= b.minCentavos && (b.maxExclusiveCentavos === null || amount < b.maxExclusiveCentavos));
  } else if (input.basis === 'salary-credit') {
    if (input.monthlyCompensationCentavos !== undefined || sharedEmployer(input.memberCategory)) throw new Error('COMPENSATION_BASIS_REQUIRED');
    const msc = money(input.monthlySalaryCreditCentavos);
    bracket = schedule.brackets.find(b=>b.monthlySalaryCreditCentavos === msc);
    if (!bracket) throw new Error('UNSUPPORTED_SALARY_CREDIT');
  } else throw new Error('INVALID_BASIS');
  if (!bracket) throw new Error('NO_BRACKET');
  const employerCentavos = total([bracket.employerSSCentavos,bracket.employerMPFCentavos,bracket.employerECCentavos]);
  const employeeCentavos = total([bracket.employeeSSCentavos,bracket.employeeMPFCentavos]);
  const memberCentavos = total([bracket.memberSSCentavos,bracket.memberMPFCentavos,bracket.memberECCentavos]);
  return {
    scheduleId:schedule.id, memberCategory:input.memberCategory, sourceUrl:schedule.sourceUrl,
    basis:input.basis, monthlySalaryCreditCentavos:bracket.monthlySalaryCreditCentavos,
    employerCentavos, employeeCentavos, memberCentavos,
    grandTotalCentavos:total([employerCentavos,employeeCentavos,memberCentavos]), breakdown:{...bracket},
  };
}
