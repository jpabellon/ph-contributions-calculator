import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMemberContribution } from '../dist/index.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const seed = name => JSON.parse(read(`../api/seed/${name}.json`));
const catalog = JSON.parse(read('../data/contributions/index.json'));
const schedules = catalog.schedules.map(e => JSON.parse(read(`../data/contributions/${e.path}`)));
const [funds, memberTypes, laws, rates, ambiguous] = ['funds', 'member_types', 'laws', 'contribution_rates', 'ambiguous_amounts'].map(seed);
const TABLES = { funds, member_types: memberTypes, laws, contribution_rates: rates };
const centavos = s => { const [p, c = ''] = String(s).split('.'); return Number(p) * 100 + Number(c.padEnd(2, '0')); };
const MONEY = /^\d+\.\d{2}$/;

// Mirrors NCB's documented read filters: col=, col[gt|gte|lt|lte|ne|in]=, sort, order, limit. Booleans are served as 0/1.
function ncbRead(table, query) {
  const params = new URLSearchParams(query);
  const value = (row, col) => typeof row[col] === 'boolean' ? (row[col] ? 1 : 0) : row[col];
  const compare = (a, b) => typeof a === 'number' ? a - Number(b) : MONEY.test(a) ? centavos(a) - centavos(b) : a < b ? -1 : a > b ? 1 : 0;
  let rows = [...TABLES[table]];
  for (const [key, expected] of params) {
    if (['Instance', 'sort', 'order', 'limit', 'page'].includes(key)) continue;
    const [, col, op = 'eq'] = key.match(/^(\w+)(?:\[(\w+)\])?$/);
    assert.ok(rows.length === 0 || col in TABLES[table][0], `unknown column ${col}`);
    rows = rows.filter(r => {
      const c = compare(value(r, col), expected);
      return { eq: c === 0, ne: c !== 0, gt: c > 0, gte: c >= 0, lt: c < 0, lte: c <= 0, in: expected.split(',').some(v => compare(value(r, col), v) === 0) }[op];
    });
  }
  if (params.has('sort')) {
    const col = params.get('sort'), dir = params.get('order') === 'desc' ? -1 : 1;
    rows.sort((a, b) => dir * compare(value(a, col), value(b, col)));
  }
  return rows.slice(0, Number(params.get('limit') ?? 10));
}
const lookup = (memberType, date, extra) => ncbRead('contribution_rates',
  `fund=sss&member_type=${memberType}&valid_from[lte]=${date}&valid_until[gte]=${date}&${extra}&limit=100`);

test('seed sizes, sentinels and money format', () => {
  assert.equal(funds.length, 1); assert.equal(memberTypes.length, 7); assert.equal(laws.length, 10);
  const expectedRows = catalog.schedules.reduce((n, e) => n + e.bracketCount * e.memberCategories.length, 0);
  assert.equal(rates.length, expectedRows); assert.equal(rates.length, 800);
  for (const r of rates) {
    for (const k of ['salary_min', 'salary_max', 'monthly_salary_credit', 'employer_pays', 'employee_pays', 'member_pays', 'total']) assert.match(r[k], MONEY);
    assert.equal(r.no_upper_limit, r.salary_max === '99999999.99');
    assert.equal(r.still_in_effect, r.valid_until === '9999-12-31');
    assert.equal(centavos(r.total), centavos(r.employer_pays) + centavos(r.employee_pays) + centavos(r.member_pays));
  }
});

test('every row reproduces the SDK result for its member type', () => {
  for (const r of rates) {
    const s = schedules.find(x => x.id === r.law_code), b = s.brackets[r.row_order - 1];
    const mt = memberTypes.find(m => m.member_type === r.member_type);
    const result = getMemberContribution({ memberCategory: r.member_type, applicableMonth: r.valid_from.slice(0, 7), schedules,
      ...(mt.accepts_salary ? { basis: 'compensation', monthlyCompensationCentavos: centavos(r.salary_min) }
        : { basis: 'salary-credit', monthlySalaryCreditCentavos: centavos(r.monthly_salary_credit) }) });
    assert.deepEqual(result.breakdown, b);
    assert.equal(centavos(r.salary_min), b.minCentavos);
    assert.equal(centavos(r.salary_max), b.maxExclusiveCentavos === null ? centavos('99999999.99') : b.maxExclusiveCentavos - 1);
    assert.equal(centavos(r.total), result.grandTotalCentavos);
    const parts = JSON.parse(r.breakdown_json);
    assert.equal(centavos(parts.member_ss) + centavos(parts.member_mpf) + centavos(parts.member_ec), result.memberCentavos);
  }
});

test('member type basis flags mirror the SDK', () => {
  for (const m of memberTypes) {
    const s = schedules.find(x => x.memberCategories.includes(m.member_type) && x.effectiveTo === null), b = s.brackets[0];
    const attempt = input => { try { getMemberContribution({ memberCategory: m.member_type, applicableMonth: '2025-06', schedules, ...input }); return true; } catch { return false; } };
    assert.equal(attempt({ basis: 'compensation', monthlyCompensationCentavos: b.minCentavos }), m.accepts_salary);
    assert.equal(attempt({ basis: 'salary-credit', monthlySalaryCreditCentavos: b.monthlySalaryCreditCentavos }), m.accepts_salary_credit);
  }
});

test('brackets are contiguous to the centavo and unique per income date and salary', () => {
  for (const law of laws) for (const mt of law.member_types.split(',')) {
    const rows = rates.filter(r => r.law_code === law.law_code && r.member_type === mt).sort((a, b) => a.row_order - b.row_order);
    assert.equal(rows.length, law.bracket_count);
    assert.equal(rows[0].salary_min, '0.00'); assert.ok(rows.at(-1).no_upper_limit);
    for (let i = 1; i < rows.length; i++) assert.equal(centavos(rows[i].salary_min), centavos(rows[i - 1].salary_max) + 1);
  }
  for (const mt of memberTypes.filter(m => m.accepts_salary)) for (const date of ['2023-01-01', '2024-12-31', '2025-01-01', '2026-10-17']) {
    for (const salary of ['0', '4999.99', '5000', '26249.99', '26250', '1000000']) {
      assert.equal(lookup(mt.member_type, date, `salary_min[lte]=${salary}&salary_max[gte]=${salary}`).length, 1, `${mt.member_type} ${date} ${salary}`);
    }
  }
  assert.equal(lookup('employed', '2022-12-31', 'salary_min[lte]=30000&salary_max[gte]=30000').length, 0);
});

test('law changes at the year boundary', () => {
  const at = d => lookup('employed', d, 'salary_min[lte]=30000&salary_max[gte]=30000')[0];
  assert.equal(at('2024-12-31').law_code, 'sss-employed-2023'); assert.equal(at('2024-12-31').employee_pays, '1350.00');
  assert.equal(at('2025-01-01').law_code, 'sss-employed-2025'); assert.equal(at('2025-01-01').employee_pays, '1500.00');
});

test('reverse lookup round trip and the generated ambiguity list', () => {
  const found = [];
  for (const r of rates) for (const field of ['employer_pays', 'employee_pays', 'member_pays', 'total']) {
    if (rates.every(x => x.law_code !== r.law_code || x.member_type !== r.member_type || x[field] === '0.00')) continue;
    const hits = lookup(r.member_type, r.valid_from, `${field}=${r[field]}`);
    assert.ok(hits.includes(r));
    if (hits.length > 1 && hits[0] === r) found.push({ law_code: r.law_code, member_type: r.member_type, field, amount: r[field], monthly_salary_credits: hits.map(h => h.monthly_salary_credit) });
  }
  const key = a => [a.law_code, a.member_type, a.field, a.amount].join('|');
  assert.deepEqual(found.map(key).sort(), ambiguous.map(key).sort());
  assert.ok(ambiguous.every(a => a.member_type === 'household'));
  const near = lookup('self-employed', '2025-06-15', 'member_pays[lte]=3931&sort=member_pays&order=desc&limit=1');
  assert.equal(near.length, 1); assert.equal(near[0].member_pays, '3930.00'); assert.equal(near[0].monthly_salary_credit, '26000.00');
  assert.equal(lookup('self-employed', '2025-06-15', 'member_pays=3931').length, 0);
});

// Every documented URL must work against the seed, so the docs cannot drift from the data.
const docs = ['../docs/api.md', '../docs/api-use-cases.md'].map(read).join('\n');
const urls = [...docs.matchAll(/https:\/\/api\.nocodebackend\.com\/read\/(\w+)\?([^\s"'`)]+)/g)];
test('documented example URLs return the documented results', () => {
  assert.ok(urls.length >= 15, 'docs should contain the example queries');
  for (const [url, table, query] of urls) {
    assert.ok(query.startsWith('Instance=37012_ph_contributions'), url);
    const rows = ncbRead(table, query);
    // An example marked empty in the docs is followed by the comment "# returns no rows".
    const expectEmpty = docs.slice(docs.indexOf(url), docs.indexOf(url) + url.length + 40).includes('# returns no rows');
    assert.equal(rows.length === 0, expectEmpty, url);
  }
  for (const a of ambiguous) assert.ok(docs.includes(`${a.field}=${a.amount.replace(/\.00$/, '')}`) || docs.includes(a.amount), `ambiguous ${a.law_code} ${a.field} ${a.amount} undocumented`);
});

test('documented README example', () => {
  const [row] = lookup('self-employed', '2025-06-15', 'salary_min[lte]=26000&salary_max[gte]=26000');
  assert.equal(row.member_pays, '3930.00'); assert.equal(row.law, 'SSS Circular 2024-008');
});
