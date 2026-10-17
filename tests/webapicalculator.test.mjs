import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { fakeFetch, TABLES } from './ncb-emulator.mjs';
const sample = new URL('../samples/webapicalculator/', import.meta.url);
const read = (path, base = sample) => readFileSync(new URL(path, base));
const requests = [];
let fetchImpl = fakeFetch;
const context = vm.createContext({ URL, URLSearchParams, fetch: (url, init) => { requests.push(url); return fetchImpl(url, init); } });
vm.runInContext(read('api.js', sample).toString(), context, { filename: 'api.js' });
const api = context.SSSApi;
const plain = value => JSON.parse(JSON.stringify(value));

test('URLs carry the instance, fund, both validity filters and readable brackets', async () => {
  requests.length = 0;
  const { url, rows } = await api.lookupBySalary('employed', '2025-06', '26,000');
  assert.equal(url, 'https://api.nocodebackend.com/read/contribution_rates?Instance=37012_ph_contributions&fund=sss&member_type=employed&valid_from[lte]=2025-06-01&valid_until[gte]=2025-06-01&salary_min[lte]=26000.00&salary_max[gte]=26000.00');
  assert.deepEqual(requests, [url]);
  assert.equal(rows[0].employee_pays, '1300.00'); assert.equal(rows[0].employer_pays, '2630.00'); assert.equal(rows[0].total, '3930.00');
});

test('forward lookups match the seed for every member type and law', async () => {
  for (const law of TABLES.laws) for (const type of law.member_types.split(',')) {
    const month = law.valid_from.slice(0, 7), rule = api.MEMBER_TYPES[type];
    const table = (await api.rateTable(type, month)).rows;
    assert.equal(table.length, law.bracket_count);
    for (const row of [table[0], table[Math.floor(table.length / 2)], table.at(-1)]) {
      if (rule.salary) {
        const { rows } = await api.lookupBySalary(type, month, row.salary_min);
        assert.equal(rows[0].row_order, row.row_order); assert.equal(rows[0].total, row.total);
      }
      if (rule.msc) {
        const { rows } = await api.lookupByMsc(type, month, row.monthly_salary_credit);
        assert.equal(rows[0].member_pays, row.member_pays);
      }
    }
  }
});

test('household threshold and the law change at January 2025', async () => {
  const below = (await api.lookupBySalary('household', '2025-06', '4999.99')).rows[0];
  const at = (await api.lookupBySalary('household', '2025-06', '5000')).rows[0];
  assert.deepEqual([below.employee_pays, below.employer_pays], ['0.00', '760.00']);
  assert.deepEqual([at.employee_pays, at.employer_pays], ['250.00', '510.00']);
  assert.equal((await api.lookupBySalary('employed', '2024-12', '26000')).rows[0].total, '3670.00');
  assert.equal((await api.lookupBySalary('employed', '2025-01', '26000')).rows[0].law, 'SSS Circular 2024-006');
  assert.equal((await api.lookupByMsc('voluntary', '2025-06', '20000')).rows[0].member_pays, '3000.00');
});

test('reverse lookup: single match, no match, nearest below, ambiguous household and top range', async () => {
  const one = await api.reverse('employed', '2025-06', 'employee_pays', '1500');
  assert.equal(one.rows.length, 1); assert.equal(one.rows[0].monthly_salary_credit, '30000.00');
  assert.deepEqual([one.rows[0].salary_min, one.rows[0].salary_max], ['29750.00', '30249.99']);
  assert.equal((await api.reverse('self-employed', '2025-06', 'member_pays', '3931')).rows.length, 0);
  const near = await api.nearestBelow('self-employed', '2025-06', 'member_pays', '3931');
  assert.ok(near.url.includes('member_pays[lte]=3931.00&sort=member_pays&order=desc&limit=1'));
  assert.equal(near.rows[0].member_pays, '3930.00');
  const many = await api.reverse('household', '2025-06', 'employer_pays', '610');
  assert.deepEqual(plain(many.rows.map(r => r.monthly_salary_credit)), ['4000.00', '6000.00']);
  const top = await api.reverse('employed', '2025-06', 'employee_pays', '1750');
  assert.equal(top.rows[0].no_upper_limit, 1);
  assert.deepEqual(plain(api.reverseFields('voluntary')), ['member_pays']);
  assert.deepEqual(plain(api.reverseFields('household')), ['employee_pays', 'employer_pays', 'total']);
});

test('invalid inputs, wrong basis and pre-2023 months never produce a result', async () => {
  for (const input of ['', '-1', '1.001', '1e4', 'Infinity', 'NaN', '26,00', '1,2,3', null, '<script>', '1000000000000']) {
    await assert.rejects(api.lookupBySalary('employed', '2025-06', input), e => e instanceof api.InputError && e.field === 'amount');
  }
  for (const month of ['', '2025-13', '0000-01', '2025-6']) await assert.rejects(api.lookupBySalary('employed', month, '26000'), e => e.field === 'month');
  await assert.rejects(api.lookupBySalary('unknown', '2025-06', '26000'), e => e.field === 'category');
  await assert.rejects(api.lookupBySalary('voluntary', '2025-06', '26000'), e => e instanceof api.InputError);
  await assert.rejects(api.lookupByMsc('household', '2025-06', '5000'), e => e instanceof api.InputError);
  await assert.rejects(api.lookupByMsc('voluntary', '2025-06', '26100'), e => e.code === 'NOT_FOUND');
  await assert.rejects(api.reverse('voluntary', '2025-06', 'employee_pays', '100'), e => e.field === 'field');
  await assert.rejects(api.lookupBySalary('employed', '2022-12', '26000'), e => e.code === 'NO_LAW');
  await assert.rejects(api.reverse('employed', '2022-12', 'total', '4530'), e => e.code === 'NO_LAW');
});

test('API and network failures surface as typed errors', async () => {
  try {
    fetchImpl = () => Promise.reject(new TypeError('Failed to fetch'));
    await assert.rejects(api.lookupBySalary('employed', '2025-06', '26000'), e => e.code === 'NETWORK' && e.url.includes('contribution_rates'));
    fetchImpl = () => Promise.resolve({ json: () => Promise.resolve({ status: 'failed', error: "Unknown column 'x'" }) });
    await assert.rejects(api.lookupBySalary('employed', '2025-06', '26000'), e => e.code === 'API' && e.message.includes("Unknown column 'x'"));
  } finally { fetchImpl = fakeFetch; }
});

test('member type rules mirror the API member_types table', () => {
  for (const m of TABLES.member_types) {
    const rule = api.MEMBER_TYPES[m.member_type];
    assert.equal(rule.salary, m.accepts_salary); assert.equal(rule.msc, m.accepts_salary_credit);
  }
  assert.equal(Object.keys(api.MEMBER_TYPES).length, TABLES.member_types.length);
});

test('peso parsing keeps exact two-decimal strings and centavo conversion is exact', () => {
  for (const [input, expected] of [['0', '0.00'], ['0.01', '0.01'], ['26,000.50', '26000.50'], [' 26000.5 ', '26000.50'], ['007', '7.00']]) assert.equal(api.parsePesos(input), expected);
  for (const [input, expected] of [['3930.00', 393000], ['0.01', 1], ['99999999.99', 9999999999]]) assert.equal(api.toCentavos(input), expected);
});

test('the sample has no rate formulas and only calls the public API', () => {
  const app = read('app.js').toString(), client = read('api.js').toString();
  for (const source of [app, client]) {
    assert.doesNotMatch(source, /0\.15|0\.05|0\.1\b|\* ?0\.|20000|35000/);
    assert.doesNotMatch(source, /ncb_sec|sk_live|Authorization/);
  }
  assert.deepEqual([...client.matchAll(/https:\/\/[^'"\s]+/g)].map(m => m[0]), ['https://api.nocodebackend.com/read/']);
});

test('assets, license and notices match the offline sample', () => {
  const offline = new URL('../samples/webcalculator/', import.meta.url);
  const walk = (base, dir = '') => readdirSync(new URL(dir, base)).flatMap(name => statSync(new URL(dir + name, base)).isDirectory() ? walk(base, dir + name + '/') : [dir + name]);
  const files = walk(new URL('assets/', sample));
  assert.deepEqual(files.sort(), walk(new URL('assets/', offline)).sort());
  for (const file of files) assert.ok(read('assets/' + file).equals(read('assets/' + file, offline)), file);
  assert.ok(read('LICENSE').equals(readFileSync(new URL('../LICENSE', import.meta.url))));
  assert.ok(read('THIRD-PARTY-NOTICES.md').equals(read('THIRD-PARTY-NOTICES.md', offline)));
  const css = read('styles.css').toString(), offlineCss = read('styles.css', offline).toString();
  assert.equal(css.split('\n').slice(1, offlineCss.split('\n').length).join('\n'), offlineCss.split('\n').slice(1).join('\n'));
});

test('page wiring: every id used by app.js exists in index.html', () => {
  const html = read('index.html').toString(), app = read('app.js').toString();
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  for (const [, id] of app.matchAll(/\$\('([\w-]+)'\)/g)) assert.ok(ids.has(id), id);
  assert.match(html, /<script defer src="api\.js"><\/script>\s*<script defer src="app\.js"><\/script>/);
});
