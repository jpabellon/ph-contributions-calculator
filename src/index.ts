export type Frequency = 'monthly' | 'semi-monthly' | 'biweekly' | 'weekly' | 'daily';
export type Bracket = {
  minCentavos: number; maxExclusiveCentavos: number | null;
  monthlySalaryCreditCentavos: number;
  employeeSSCentavos: number; employeeMPFCentavos: number;
  employerSSCentavos: number; employerMPFCentavos: number; employerECCentavos: number;
};
export type Schedule = {
  id: string; effectiveFrom: string; effectiveTo: string | null;
  sourceUrl: string; verified: boolean; brackets: Bracket[];
};
export type AllocationStrategy = 'equal' | 'single' | 'proportional' | 'reconcile';
type CompensationInput =
  | { amountCentavos: number; frequency: Frequency; mode: 'annualized'; paidDaysPerMonth?: number }
  | { mode: 'actual'; earningsCentavos: number[] };
type AllocationInput = {
  monthlyEmployeeCentavos: number; strategy: AllocationStrategy;
  periods: { id: string; weight?: number; alreadyDeductedCentavos?: number }[];
  targetPeriodId?: string;
};
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const dense = (v: unknown): v is unknown[] => Array.isArray(v) && Array.from({ length: v.length }, (_, i) => Object.hasOwn(v, i)).every(Boolean);
function integer(n: unknown, name: string): number {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) throw new Error(`INVALID_${name.toUpperCase()}`);
  return n;
}
function safe(n: bigint): number {
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('AMOUNT_OVERFLOW');
  return Number(n);
}
const sum = (values: number[]) => safe(values.reduce((a, b) => a + BigInt(b), 0n));
function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(v) || v.startsWith('0000')) return false;
  const date = new Date(v + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}

/** Annualized results are estimates. Actual earnings must all belong to the applicable month. */
export function normalizeCompensation(input: CompensationInput): { monthlyCentavos: number; estimated: boolean } {
  if (!record(input)) throw new Error('INVALID_INPUT');
  if (input.mode === 'actual') {
    if (!dense(input.earningsCentavos) || !input.earningsCentavos.length) throw new Error('INVALID_EARNINGS');
    return { monthlyCentavos: sum(input.earningsCentavos.map(n => integer(n, 'earnings'))), estimated: false };
  }
  if (input.mode !== 'annualized') throw new Error('INVALID_MODE');
  const amount = BigInt(integer(input.amountCentavos, 'amount'));
  let numerator: bigint, denominator = 1n;
  switch (input.frequency) {
    case 'monthly': numerator = 1n; break;
    case 'semi-monthly': numerator = 2n; break;
    case 'biweekly': numerator = 26n; denominator = 12n; break;
    case 'weekly': numerator = 52n; denominator = 12n; break;
    case 'daily': {
      const days = integer(input.paidDaysPerMonth, 'paid_days');
      if (days < 1 || days > 31) throw new Error('INVALID_PAID_DAYS');
      numerator = BigInt(days); break;
    }
    default: throw new Error('INVALID_FREQUENCY');
  }
  // Round half up to one centavo without floating-point multiplication.
  return { monthlyCentavos: safe((amount * numerator * 2n + denominator) / (2n * denominator)), estimated: true };
}

/** Structural validation cannot establish the authenticity of caller-supplied data. */
export function validateSchedule(s: Schedule): void {
  if (!record(s)) throw new Error('INVALID_SCHEDULE');
  if (s.verified !== true || !Array.isArray(s.brackets) || !s.brackets.length) throw new Error('UNVERIFIED_SCHEDULE');
  if (!nonempty(s.id)) throw new Error('INVALID_SCHEDULE_ID');
  try { const url = new URL(s.sourceUrl); if (url.protocol !== 'https:') throw new Error(); }
  catch { throw new Error('INVALID_SOURCE_URL'); }
  if (!validDate(s.effectiveFrom) || (s.effectiveTo !== null && (!validDate(s.effectiveTo) || s.effectiveTo <= s.effectiveFrom))) throw new Error('INVALID_EFFECTIVE_DATE');
  if (!dense(s.brackets)) throw new Error('INVALID_BRACKET');
  let previousEnd = 0;
  for (const [i, b] of s.brackets.entries()) {
    if (!record(b)) throw new Error('INVALID_BRACKET');
    for (const key of ['minCentavos', 'monthlySalaryCreditCentavos', 'employeeSSCentavos', 'employeeMPFCentavos', 'employerSSCentavos', 'employerMPFCentavos', 'employerECCentavos'] as const) integer(b[key], key);
    if (b.monthlySalaryCreditCentavos === 0) throw new Error('INVALID_SALARY_CREDIT');
    if (b.minCentavos !== previousEnd) throw new Error('BRACKET_GAP_OR_OVERLAP');
    if (b.maxExclusiveCentavos === null) {
      if (i !== s.brackets.length - 1) throw new Error('INVALID_FINAL_BRACKET');
    } else {
      integer(b.maxExclusiveCentavos, 'max_exclusive_centavos');
      if (b.maxExclusiveCentavos <= b.minCentavos) throw new Error('INVALID_BRACKET');
      previousEnd = b.maxExclusiveCentavos;
    }
    sum([b.employeeSSCentavos, b.employeeMPFCentavos, b.employerSSCentavos, b.employerMPFCentavos, b.employerECCentavos]);
  }
  if (s.brackets.at(-1)?.maxExclusiveCentavos !== null) throw new Error('MISSING_OPEN_ENDED_BRACKET');
}

export function getContribution(input: { monthlyCompensationCentavos: number; applicableMonth: string; schedules: Schedule[] }) {
  if (!record(input)) throw new Error('INVALID_INPUT');
  const { monthlyCompensationCentavos: amount, applicableMonth, schedules } = input;
  integer(amount, 'compensation');
  if (typeof applicableMonth !== 'string' || !validDate(applicableMonth + '-01')) throw new Error('INVALID_PERIOD');
  if (!dense(schedules)) throw new Error('INVALID_SCHEDULES');
  // Validate before selection so malformed dates cannot silently hide a schedule.
  schedules.forEach(validateSchedule);
  const date = applicableMonth + '-01';
  const matches = schedules.filter(s => s.effectiveFrom <= date && (s.effectiveTo === null || date < s.effectiveTo));
  if (matches.length !== 1) throw new Error('UNSUPPORTED_OR_AMBIGUOUS_PERIOD');
  const schedule = matches[0];
  const bracket = schedule.brackets.find(b => amount >= b.minCentavos && (b.maxExclusiveCentavos === null || amount < b.maxExclusiveCentavos));
  if (!bracket) throw new Error('NO_BRACKET');
  const employee = sum([bracket.employeeSSCentavos, bracket.employeeMPFCentavos]);
  const employer = sum([bracket.employerSSCentavos, bracket.employerMPFCentavos, bracket.employerECCentavos]);
  return { scheduleId: schedule.id, sourceUrl: schedule.sourceUrl, monthlyCompensationCentavos: amount,
    monthlySalaryCreditCentavos: bracket.monthlySalaryCreditCentavos, employeeCentavos: employee,
    employerCentavos: employer, grandTotalCentavos: sum([employee, employer]), breakdown: { ...bracket } };
}

/** Distribute the remaining liability. Final eligible period receives rounding residue. */
export function allocateContribution(input: AllocationInput) {
  if (!record(input)) throw new Error('INVALID_INPUT');
  const total = integer(input.monthlyEmployeeCentavos, 'monthly_total');
  const { periods, strategy } = input;
  if (!['equal', 'single', 'proportional', 'reconcile'].includes(strategy)) throw new Error('INVALID_STRATEGY');
  if (!dense(periods) || !periods.length || periods.some(p => !record(p) || !nonempty(p.id)) || new Set(periods.map(p => p.id)).size !== periods.length) throw new Error('INVALID_PERIODS');
  const deducted = sum(periods.map(p => integer(p.alreadyDeductedCentavos === undefined ? 0 : p.alreadyDeductedCentavos, 'deducted')));
  if (deducted > total) throw new Error('OVER_DEDUCTED');
  const remaining = total - deducted;
  if (strategy === 'single' || strategy === 'reconcile') {
    const idx = periods.findIndex(p => p.id === input.targetPeriodId);
    if (idx < 0) throw new Error('TARGET_PERIOD_REQUIRED');
    return periods.map((p, i) => ({ id: p.id, additionalDeductionCentavos: i === idx ? remaining : 0 }));
  }
  const weights = periods.map(p => strategy === 'proportional' ? integer(p.weight, 'weight') : 1);
  const weightSum = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (weightSum === 0n) throw new Error('INVALID_WEIGHTS');
  const lastEligible = weights.reduce((last, w, i) => w > 0 ? i : last, -1);
  let used = 0;
  return periods.map((p, i) => {
    const value = i === lastEligible ? remaining - used : Number(BigInt(remaining) * BigInt(weights[i]) / weightSum);
    used += value;
    return { id: p.id, additionalDeductionCentavos: value };
  });
}
