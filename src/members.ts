export const MEMBER_CATEGORIES = ['employed', 'household', 'self-employed', 'land-based-ofw', 'voluntary', 'non-working-spouse', 'sea-based-ofw'] as const;
export type MemberCategory = typeof MEMBER_CATEGORIES[number];
export type MemberBracket = {
  minCentavos: number; maxExclusiveCentavos: number | null;
  monthlySalaryCreditCentavos: number;
  employeeSSCentavos: number; employeeMPFCentavos: number;
  employerSSCentavos: number; employerMPFCentavos: number; employerECCentavos: number;
  regularSalaryCreditCentavos: number; mpfSalaryCreditCentavos: number;
  memberSSCentavos: number; memberMPFCentavos: number; memberECCentavos: number;
};
export type MemberSchedule = {
  id: string; effectiveFrom: string; effectiveTo: string | null;
  sourceUrl: string; verified: boolean;
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

function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(v) || v.startsWith('0000')) return false;
  const date = new Date(v + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}

/** Structural/component checks do not authenticate caller-supplied verification assertions. */
export function validateMemberSchedule(s: MemberSchedule): void {
  if (!object(s)) throw new Error('INVALID_SCHEDULE');
  if (s.verified !== true || !Array.isArray(s.brackets) || !s.brackets.length) throw new Error('UNVERIFIED_SCHEDULE');
  if (typeof s.id !== 'string' || !s.id.trim()) throw new Error('INVALID_SCHEDULE_ID');
  try { const url = new URL(s.sourceUrl); if (url.protocol !== 'https:') throw new Error(); }
  catch { throw new Error('INVALID_SOURCE_URL'); }
  if (!validDate(s.effectiveFrom) || (s.effectiveTo !== null && (!validDate(s.effectiveTo) || s.effectiveTo <= s.effectiveFrom))) throw new Error('INVALID_EFFECTIVE_DATE');
  if (!dense(s.brackets)) throw new Error('INVALID_BRACKET');
  if (s.currency !== 'PHP' || s.monetaryUnit !== 'centavos') throw new Error('INVALID_MONETARY_UNIT');
  if (s.schemaVersion !== 2 || !dense(s.memberCategories) || s.memberCategories.length === 0 ||
      s.memberCategories.some(c=>!category(c)) || new Set(s.memberCategories).size !== s.memberCategories.length ||
      new Set(s.memberCategories.map(group)).size !== 1) throw new Error('INVALID_MEMBER_CATEGORIES');
  const kind = s.memberCategories[0];
  let previousMSC = 0;
  let previousEnd = 0;
  for (const [i, b] of s.brackets.entries()) {
    if (!object(b)) throw new Error('INVALID_BRACKET');
    for (const key of ['minCentavos','monthlySalaryCreditCentavos','employeeSSCentavos','employeeMPFCentavos','employerSSCentavos','employerMPFCentavos','employerECCentavos'] as const) money(b[key]);
    if (b.monthlySalaryCreditCentavos === 0) throw new Error('INVALID_SALARY_CREDIT');
    if (b.minCentavos !== previousEnd) throw new Error('BRACKET_GAP_OR_OVERLAP');
    if (b.maxExclusiveCentavos === null) {
      if (i !== s.brackets.length - 1) throw new Error('INVALID_FINAL_BRACKET');
    } else {
      money(b.maxExclusiveCentavos);
      if (b.maxExclusiveCentavos <= b.minCentavos) throw new Error('INVALID_BRACKET');
      previousEnd = b.maxExclusiveCentavos;
    }
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
  if (s.brackets.at(-1)?.maxExclusiveCentavos !== null) throw new Error('MISSING_OPEN_ENDED_BRACKET');
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
