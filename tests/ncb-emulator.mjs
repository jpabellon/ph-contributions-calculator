// In-memory stand-in for NoCodeBackend's public read endpoint over api/seed, used by the API tests.
// Mirrors the documented filters: col=, col[gt|gte|lt|lte|ne|in]=, sort, order, limit. Booleans are served as 0/1.
import { readFileSync } from 'node:fs';
const seed = name => JSON.parse(readFileSync(new URL(`../api/seed/${name}.json`, import.meta.url), 'utf8'));
export const TABLES = Object.fromEntries(['funds', 'member_types', 'laws', 'contribution_rates'].map(n => [n, seed(n)]));
export const centavos = s => { const [p, c = ''] = String(s).split('.'); return Number(p) * 100 + Number(c.padEnd(2, '0')); };
const MONEY = /^\d+\.\d{2}$/;
const value = (row, col) => typeof row[col] === 'boolean' ? (row[col] ? 1 : 0) : row[col];
const compare = (a, b) => typeof a === 'number' ? a - Number(b) : MONEY.test(a) ? centavos(a) - centavos(b) : a < b ? -1 : a > b ? 1 : 0;

/** Returns matching seed rows (the objects themselves) for a table and query string. */
export function ncbRead(table, query) {
  const params = new URLSearchParams(query);
  let rows = [...TABLES[table]];
  for (const [key, expected] of params) {
    if (['Instance', 'sort', 'order', 'limit', 'page'].includes(key)) continue;
    const [, col, op = 'eq'] = key.match(/^(\w+)(?:\[(\w+)\])?$/);
    if (!(col in TABLES[table][0])) throw new Error(`Unknown column '${col}' in 'where clause'`);
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

/** A fetch() replacement that answers like the live API, with booleans as 0/1 and the same envelope. */
export function fakeFetch(url) {
  const { pathname, search } = new URL(url);
  const table = pathname.replace(/^\/read\//, '');
  const params = new URLSearchParams(search);
  let body;
  try {
    if (!TABLES[table]) throw new Error('Unknown table');
    if (params.get('Instance') !== '37012_ph_contributions') throw new Error('Unknown instance');
    const limit = Number(params.get('limit') ?? 10);
    const rows = ncbRead(table, search);
    const data = rows.map((r, i) => Object.fromEntries([['id', i + 1], ...Object.entries(r).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 1 : 0) : v]), ['user_id', null]]));
    body = { status: 'success', data, metadata: { page: 1, limit, hasMore: false, hasPrev: false } };
  } catch (error) { body = { status: 'failed', error: error.message }; }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}
