/* Browser client for the public SSS API. Input checks and request building only; every amount comes from the API. */
(function (global) {
  'use strict';
  const BASE = 'https://api.nocodebackend.com/read/';
  const INSTANCE = '37012_ph_contributions';
  // Mirrors the member_types table (accepts_salary / accepts_salary_credit) and who pays.
  const MEMBER_TYPES = Object.freeze({
    employed: { salary: true, msc: false, shared: true },
    household: { salary: true, msc: false, shared: true },
    'sea-based-ofw': { salary: true, msc: false, shared: true },
    'self-employed': { salary: true, msc: true, shared: false },
    'land-based-ofw': { salary: true, msc: true, shared: false },
    voluntary: { salary: false, msc: true, shared: false },
    'non-working-spouse': { salary: false, msc: true, shared: false },
  });
  // Reverse lookup keys that identify a row for each kind of payer.
  const REVERSE_FIELDS = Object.freeze({ shared: ['employee_pays', 'employer_pays', 'total'], individual: ['member_pays'] });
  class InputError extends Error {
    constructor(message, field) { super(message); this.field = field; }
  }
  class ApiError extends Error {
    constructor(message, code, url) { super(message); this.code = code; this.url = url; }
  }
  function memberType(type) {
    if (!Object.hasOwn(MEMBER_TYPES, type)) throw new InputError('Select a membership type.', 'category');
    return MEMBER_TYPES[type];
  }
  function parsePesos(value, field = 'amount') {
    const text = String(value ?? '').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) {
      throw new InputError('Enter a non-negative peso amount with up to 2 decimal places, such as 26,000.50.', field);
    }
    const [whole, fraction = ''] = text.replaceAll(',', '').split('.');
    if (whole.replace(/^0+(?=\d)/, '').length > 12) throw new InputError('This amount is too large. Enter a smaller amount.', field);
    return BigInt(whole).toString() + '.' + fraction.padEnd(2, '0');
  }
  /** Peso strings from the API ("3930.00") to integer centavos, without floating point. */
  function toCentavos(pesos) {
    const [whole, fraction = ''] = String(pesos).split('.');
    return Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2)));
  }
  function incomeDate(month) {
    if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw new InputError('Select a valid contribution month.', 'month');
    return month + '-01';
  }
  /** Readable URL: brackets are left as-is (the API accepts them raw or encoded); values are encoded. */
  function buildUrl(table, filters) {
    const pairs = [['Instance', INSTANCE], ['fund', 'sss'], ...Object.entries(filters)];
    return BASE + table + '?' + pairs.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  }
  async function request(table, filters) {
    const url = buildUrl(table, filters);
    let raw;
    try {
      const response = await global.fetch(url, { headers: { Accept: 'application/json' } });
      raw = await response.json();
    } catch {
      throw new ApiError('Could not reach the SSS API. Check your internet connection and try again.', 'NETWORK', url);
    }
    if (raw?.status !== 'success' || !Array.isArray(raw.data)) throw new ApiError('The API returned an error: ' + (raw?.error || 'unknown response') + '.', 'API', url);
    return { url, rows: raw.data, raw };
  }
  function period(type, month) {
    memberType(type);
    const date = incomeDate(month);
    return { member_type: type, 'valid_from[lte]': date, 'valid_until[gte]': date };
  }
  // Distinguishes "no law covers this month" from "no row matches" when a lookup comes back empty.
  async function explainEmpty(type, month, result, notFoundMessage) {
    const any = await request('contribution_rates', { ...period(type, month), limit: '1' });
    if (any.rows.length === 0) throw new ApiError('No SSS table covers this month. Choose January 2023 or later.', 'NO_LAW', result.url);
    return notFoundMessage;
  }
  async function single(type, month, filters, notFoundMessage) {
    const result = await request('contribution_rates', { ...period(type, month), ...filters });
    if (result.rows.length === 1) return result;
    if (result.rows.length === 0) throw new ApiError(await explainEmpty(type, month, result, notFoundMessage), 'NOT_FOUND', result.url);
    throw new ApiError('The API returned more than one row for this lookup.', 'AMBIGUOUS', result.url);
  }
  async function lookupBySalary(type, month, amount) {
    if (!memberType(type).salary) throw new InputError('This membership type uses an approved monthly salary credit.', 'category');
    const pesos = parsePesos(amount);
    return single(type, month, { 'salary_min[lte]': pesos, 'salary_max[gte]': pesos }, 'No salary range matched this amount.');
  }
  async function lookupByMsc(type, month, msc) {
    if (!memberType(type).msc) throw new InputError('This membership type is looked up by salary.', 'category');
    const pesos = parsePesos(msc, 'msc');
    return single(type, month, { monthly_salary_credit: pesos }, 'Select an approved monthly salary credit from the list for this month.');
  }
  /** All rows of the applicable table, in printed order, for an MSC picker or a rate table. */
  async function rateTable(type, month) {
    const result = await request('contribution_rates', { ...period(type, month), sort: 'row_order', limit: '100' });
    if (result.rows.length === 0) await explainEmpty(type, month, result);
    return result;
  }
  function reverseFields(type) { return REVERSE_FIELDS[memberType(type).shared ? 'shared' : 'individual']; }
  function checkField(type, field) {
    if (!reverseFields(type).includes(field)) throw new InputError('Choose what kind of amount you know.', 'field');
  }
  /** Amount → matching rows. Zero rows (amount not in the table) and several rows (household cases) are valid outcomes. */
  async function reverse(type, month, field, amount) {
    checkField(type, field);
    const pesos = parsePesos(amount);
    const result = await request('contribution_rates', { ...period(type, month), [field]: pesos, sort: 'row_order', limit: '100' });
    if (result.rows.length === 0) await explainEmpty(type, month, result);
    return result;
  }
  /** The row with the highest amount at or below the given one. */
  async function nearestBelow(type, month, field, amount) {
    checkField(type, field);
    const pesos = parsePesos(amount);
    return request('contribution_rates', { ...period(type, month), [field + '[lte]']: pesos, sort: field, order: 'desc', limit: '1' });
  }
  global.SSSApi = Object.freeze({ BASE, INSTANCE, MEMBER_TYPES, REVERSE_FIELDS, InputError, ApiError, parsePesos, toCentavos, buildUrl,
    lookupBySalary, lookupByMsc, rateTable, reverseFields, reverse, nearestBelow });
})(globalThis);
