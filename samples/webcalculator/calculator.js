/* Browser adapter: parsing and presentation context only. All contribution math uses the library. */
(function (global) {
  'use strict';
  class InputError extends Error {
    constructor(message, field) { super(message); this.field = field; }
  }
  const lib = global.SSSContributions;
  const data = global.SSSCalculatorData;
  function parsePesos(value) {
    const text = String(value ?? '').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) {
      throw new InputError('Enter a non-negative peso amount with up to 2 decimal places, such as 26,000.50.', 'amount');
    }
    const [whole, fraction = ''] = text.replaceAll(',', '').split('.');
    const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new InputError('This amount is too large. Enter a smaller amount.', 'amount');
    return Number(amount);
  }
  function findSchedule(category, month) {
    if (!lib.MEMBER_CATEGORIES.includes(category)) throw new InputError('Select a membership type.', 'category');
    if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw new InputError('Select a valid contribution month.', 'month');
    const date = month + '-01';
    const schedules = data.schedules.filter(s => s.memberCategories.includes(category) && s.effectiveFrom <= date && (s.effectiveTo === null || date < s.effectiveTo));
    if (schedules.length !== 1) throw new InputError('No supported schedule for this month. Choose January 2023 or later.', 'month');
    return schedules[0];
  }
  function calculate(fields) {
    const schedule = findSchedule(fields.category, fields.month);
    const forcedMSC = ['voluntary', 'non-working-spouse'].includes(fields.category);
    const flexible = ['self-employed', 'land-based-ofw'].includes(fields.category);
    const basis = forcedMSC ? 'salary-credit' : flexible ? fields.basis : 'compensation';
    const request = { memberCategory: fields.category, applicableMonth: fields.month, schedules: data.schedules, basis };
    let normalized = null;
    if (basis === 'salary-credit') {
      if (!/^\d+$/.test(fields.msc ?? '') || !schedule.brackets.some(b => b.monthlySalaryCreditCentavos === Number(fields.msc))) {
        throw new InputError('Select an approved monthly salary credit from the list for this month.', 'msc');
      }
      request.monthlySalaryCreditCentavos = Number(fields.msc);
    } else if (basis === 'compensation') {
      const amount = parsePesos(fields.amount);
      if (fields.frequency === 'monthly') normalized = lib.normalizeCompensation({ mode: 'actual', earningsCentavos: [amount] });
      else {
        let paidDaysPerMonth;
        if (fields.frequency === 'daily') {
          if (!/^\d+$/.test(fields.days ?? '') || Number(fields.days) < 1 || Number(fields.days) > 31) throw new InputError('Enter a whole number of paid days from 1 to 31.', 'days');
          paidDaysPerMonth = Number(fields.days);
        }
        normalized = lib.normalizeCompensation({ mode: 'annualized', amountCentavos: amount, frequency: fields.frequency, paidDaysPerMonth });
      }
      request.monthlyCompensationCentavos = normalized.monthlyCentavos;
    } else throw new InputError('Select a valid calculation basis.', 'basis');
    const result = lib.getMemberContribution(request);
    return {
      applicableMonth: fields.month, estimated: normalized?.estimated ?? false,
      monthlyCompensationCentavos: normalized?.monthlyCentavos ?? null,
      enteredAmountCentavos: basis === 'compensation' ? parsePesos(fields.amount) : null,
      frequency: basis === 'compensation' ? fields.frequency : null,
      paidDaysPerMonth: basis === 'compensation' && fields.frequency === 'daily' ? Number(fields.days) : null,
      ...result, sourceCircular: schedule.provenance.circular, scheduleEffectiveFrom: schedule.effectiveFrom,
      verificationStatus: schedule.verificationStatus,
    };
  }
  global.SSSCalculator = Object.freeze({ InputError, parsePesos, findSchedule, calculate });
})(globalThis);
