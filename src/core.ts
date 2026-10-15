export type Frequency = 'monthly' | 'semi-monthly' | 'biweekly' | 'weekly' | 'daily';
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
