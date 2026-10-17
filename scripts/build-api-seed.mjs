import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { getMemberContribution } from '../dist/index.js';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const catalog = JSON.parse(read('data/contributions/index.json'));
const schedules = catalog.schedules.map(entry => JSON.parse(read('data/contributions/' + entry.path)));

// NCB filters cannot match null, so open ends use sentinels with explicit flags.
export const OPEN_DATE = '9999-12-31';
export const OPEN_SALARY = '99999999.99';
const pesos = c => {
  if (!Number.isSafeInteger(c) || c < 0) throw new Error('INVALID_CENTAVOS');
  return Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0');
};
const dayBefore = date => new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
const LABELS = {
  'employed': 'Business employee', 'household': 'Household employee (kasambahay)', 'self-employed': 'Self-employed member',
  'land-based-ofw': 'Land-based OFW', 'voluntary': 'Voluntary member', 'non-working-spouse': 'Non-working spouse',
  'sea-based-ofw': 'Sea-based OFW (seafarer)',
};
// Mirrors the basis rules enforced by getMemberContribution().
const SALARY = new Set(['employed', 'household', 'self-employed', 'land-based-ofw', 'sea-based-ofw']);
const SALARY_CREDIT = new Set(['self-employed', 'land-based-ofw', 'voluntary', 'non-working-spouse']);
const NOTES = {
  'employed': 'Employer and employee share the contribution; employer also pays EC.',
  'household': 'Employer pays everything below PHP5,000 actual compensation; shared from PHP5,000. Look up by salary only: two PHP5,000 salary-credit rows exist.',
  'self-employed': 'Member pays everything, including EC.',
  'land-based-ofw': 'Member pays everything; no EC. Minimum salary credit PHP8,000. No currency conversion.',
  'voluntary': 'Member pays everything; no EC. Look up by an approved monthly salary credit.',
  'non-working-spouse': 'Member pays everything; no EC. Look up by an approved monthly salary credit; the basis is not derived here.',
  'sea-based-ofw': 'Uses the employer/employee table; the manning agency is the employer. No currency conversion.',
};
const law = s => 'SSS Circular ' + s.provenance.circular;
const validity = s => ({
  valid_from: s.effectiveFrom,
  valid_until: s.effectiveTo === null ? OPEN_DATE : dayBefore(s.effectiveTo),
  still_in_effect: s.effectiveTo === null,
});

const funds = [{ fund: 'sss', name: 'Social Security System', official_site: 'https://www.sss.gov.ph/',
  notes: 'Monthly contribution tables for 2023 onward. Not affiliated with or endorsed by SSS.' }];
const memberTypes = Object.keys(LABELS).map(member_type => ({ fund: 'sss', member_type, label: LABELS[member_type],
  accepts_salary: SALARY.has(member_type), accepts_salary_credit: SALARY_CREDIT.has(member_type), notes: NOTES[member_type] }));
const laws = schedules.map(s => ({
  fund: 'sss', law_code: s.id, law: law(s), law_url: s.sourceUrl, member_types: s.memberCategories.join(','),
  calculation_method: 'bracket_table', ...validity(s), bracket_count: s.brackets.length,
  sha256: s.provenance.sha256, table_pages: s.provenance.tablePages.join(','), reviewed_on: s.provenance.reviewedOn,
  verification_method: s.provenance.method, rules_json: JSON.stringify(s.rules),
  advance_payment_transition_json: s.advancePaymentTransition === null ? null : JSON.stringify(s.advancePaymentTransition),
}));

const rates = [];
for (const s of schedules) {
  for (const member_type of s.memberCategories) {
    for (const [i, b] of s.brackets.entries()) {
      // Totals come from the tested SDK, never from separate arithmetic here.
      const r = getMemberContribution({ memberCategory: member_type, applicableMonth: s.effectiveFrom.slice(0, 7), schedules,
        ...(SALARY.has(member_type) ? { basis: 'compensation', monthlyCompensationCentavos: b.minCentavos }
          : { basis: 'salary-credit', monthlySalaryCreditCentavos: b.monthlySalaryCreditCentavos }) });
      if (r.scheduleId !== s.id || JSON.stringify(r.breakdown) !== JSON.stringify(b)) throw new Error('SDK_MISMATCH ' + s.id + ' ' + i);
      rates.push({
        fund: 'sss', member_type, law_code: s.id, law: law(s), law_url: s.sourceUrl, ...validity(s), row_order: i + 1,
        salary_min: pesos(b.minCentavos),
        salary_max: b.maxExclusiveCentavos === null ? OPEN_SALARY : pesos(b.maxExclusiveCentavos - 1),
        no_upper_limit: b.maxExclusiveCentavos === null,
        monthly_salary_credit: pesos(b.monthlySalaryCreditCentavos),
        employer_pays: pesos(r.employerCentavos), employee_pays: pesos(r.employeeCentavos),
        member_pays: pesos(r.memberCentavos), total: pesos(r.grandTotalCentavos),
        breakdown_json: JSON.stringify({
          employer_ss: pesos(b.employerSSCentavos), employer_mpf: pesos(b.employerMPFCentavos), employer_ec: pesos(b.employerECCentavos),
          employee_ss: pesos(b.employeeSSCentavos), employee_mpf: pesos(b.employeeMPFCentavos),
          member_ss: pesos(b.memberSSCentavos), member_mpf: pesos(b.memberMPFCentavos), member_ec: pesos(b.memberECCentavos),
          regular_salary_credit: pesos(b.regularSalaryCreditCentavos), mpf_salary_credit: pesos(b.mpfSalaryCreditCentavos),
        }),
      });
    }
  }
}

// Amounts that point back to more than one row, for reverse-lookup documentation.
const ambiguous = [];
for (const field of ['employer_pays', 'employee_pays', 'member_pays', 'total']) {
  const groups = new Map();
  for (const r of rates) {
    const key = [r.law_code, r.member_type, r[field]].join('|');
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const used = new Set(rates.filter(r => r[field] !== '0.00').map(r => r.law_code + '|' + r.member_type));
  for (const [key, rows] of groups) {
    const [law_code, member_type, amount] = key.split('|');
    // A field that is always zero for a member type is never a valid reverse-lookup key.
    if (rows.length > 1 && used.has(law_code + '|' + member_type)) ambiguous.push({ law_code, member_type, field, amount,
      monthly_salary_credits: rows.map(r => r.monthly_salary_credit) });
  }
}

const outputs = { funds, member_types: memberTypes, laws, contribution_rates: rates, ambiguous_amounts: ambiguous };
const check = process.argv.includes('--check');
if (!check) mkdirSync(new URL('api/seed/', root), { recursive: true });
for (const [name, rows] of Object.entries(outputs)) {
  const path = 'api/seed/' + name + '.json', content = JSON.stringify(rows, null, 2) + '\n';
  if (check) { if (read(path) !== content) throw new Error(path + ' is stale; run npm run build:api-seed'); }
  else writeFileSync(new URL(path, root), content);
}
console.log(check ? 'API seed matches library and source data.' : 'Wrote API seed: ' + rates.length + ' contribution rates, ' + laws.length + ' laws.');
