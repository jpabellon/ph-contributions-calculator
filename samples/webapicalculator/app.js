(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = window.SSSApi;
  const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
  const money = cents => currency.formatToParts(BigInt(cents) / 100n).map(part => part.type === 'fraction' ? String(cents % 100).padStart(2, '0') : part.value).join('');
  const pesos = value => money(api.toCentavos(value));
  const labels = {
    employed: 'Business employee', household: 'Household employee / kasambahay',
    'self-employed': 'Self-employed', 'land-based-ofw': 'Land-based OFW',
    'sea-based-ofw': 'Sea-based OFW', voluntary: 'Voluntary member', 'non-working-spouse': 'Non-working spouse',
  };
  const notes = {
    household: 'Below ₱5,000 actual monthly compensation, the household employer pays the entire contribution. At ₱5,000, employer and employee shares apply.',
    'land-based-ofw': 'The minimum land-based OFW salary credit is ₱8,000. EC does not apply. Age and contribution-history rules may limit changes to your MSC.',
    voluntary: 'Select an eligible, approved MSC. Age and contribution-history rules may limit changes. EC does not apply.',
    'non-working-spouse': 'Use an approved MSC for the non-working spouse. This sample does not derive it from personal or spouse income because SSS source wording differs. EC does not apply.',
    'self-employed': 'The individual member pays the full contribution, including Employees’ Compensation (EC).',
    'sea-based-ofw': 'Sea-based OFWs use the employer/employee schedule. Enter compensation in Philippine pesos; currency conversion is not included.',
  };
  const fieldLabels = { employee_pays: 'Employee deduction (payslip)', employer_pays: 'Employer share', total: 'Total remitted to SSS', member_pays: 'Member payment' };
  const fieldHelp = {
    shared: 'Use the payslip deduction to estimate an employee’s salary range, or the total to check a remittance.',
    individual: 'The amount the member paid for the month.',
  };
  // What to search by instead when an amount matches several household rows (see docs/api.md).
  const alternatives = { employee_pays: 'the employer share or the total', employer_pays: 'the total', total: 'the employee deduction' };
  let mode = 'forward', seq = 0, mscSeq = 0, lastResult = null, nearestRequest = null;

  function setText(id, text) { $(id).textContent = text; }
  function node(tag, text, className) {
    const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function monthLabel(month) {
    const [year, m] = month.split('-').map(Number);
    return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(year, m - 1, 1));
  }
  const form = () => $(mode + '-form');
  const errorBox = () => $(mode + '-error');

  function clearError() {
    for (const id of ['forward-error', 'reverse-error']) $(id).hidden = true;
    for (const input of document.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  }
  function showError(error) {
    const fieldIds = { category: mode === 'forward' ? 'category' : 'r-category', month: mode === 'forward' ? 'month' : 'r-month', amount: mode === 'forward' ? 'amount' : 'r-amount', msc: 'msc', field: 'r-field' };
    const known = error instanceof api.InputError || error instanceof api.ApiError;
    errorBox().textContent = known ? error.message : 'The lookup could not be completed. Please try again.';
    errorBox().hidden = false;
    const target = error.field && $(fieldIds[error.field]);
    if (error.code === 'NO_LAW') $(fieldIds.month).setAttribute('aria-invalid', 'true');
    if (target) { target.setAttribute('aria-invalid', 'true'); target.focus(); }
    else errorBox().scrollIntoView({ block: 'nearest' });
  }
  function showEmpty(title, message, nearest) {
    $('result').hidden = true; $('empty-state').hidden = false;
    setText('empty-title', title); setText('empty-message', message);
    nearestRequest = nearest || null; $('nearest').hidden = !nearest;
  }
  function invalidate() {
    seq++; lastResult = null;
    showEmpty('Your result, from the API.', 'Your details have changed. Run the lookup to see an updated result.');
    $('api-panel').hidden = true;
    setText('result-status', 'Inputs changed. Run the lookup to update the result.');
    setText('action-status', ''); clearError();
  }
  function busy(on) {
    form().setAttribute('aria-busy', String(on));
    const button = $(mode + '-submit');
    button.disabled = on;
    button.firstChild.textContent = on ? 'Looking up… ' : (mode === 'forward' ? 'Look up contribution ' : 'Find salary credit ');
  }

  /* ---------- Mode switch ---------- */
  function setMode(next, focus) {
    if (next === mode) return;
    mode = next;
    for (const [id, m] of [['tab-forward', 'forward'], ['tab-reverse', 'reverse']]) {
      const selected = m === mode;
      $(id).setAttribute('aria-selected', String(selected)); $(id).tabIndex = selected ? 0 : -1;
      $(m + '-form').hidden = !selected;
    }
    setText('form-title', mode === 'forward' ? 'Choose a lookup' : 'Work backwards from an amount');
    invalidate();
    if (focus) $(mode === 'forward' ? 'tab-forward' : 'tab-reverse').focus();
  }
  for (const id of ['tab-forward', 'tab-reverse']) {
    $(id).addEventListener('click', () => setMode(id === 'tab-forward' ? 'forward' : 'reverse'));
    $(id).addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setMode(mode === 'forward' ? 'reverse' : 'forward', true); }
    });
  }

  /* ---------- Find contribution ---------- */
  function useMsc() {
    const type = api.MEMBER_TYPES[$('category').value];
    return !type.salary || (type.msc && $('basis').value === 'salary-credit');
  }
  let lastCategory = $('category').value;
  function updateForward() {
    const category = $('category').value, type = api.MEMBER_TYPES[category];
    if (category !== lastCategory) { $('basis').value = 'compensation'; lastCategory = category; }
    const msc = useMsc();
    $('basis-field').hidden = !(type.salary && type.msc);
    $('income-field').hidden = msc; $('amount').disabled = msc;
    $('msc-field').hidden = !msc; $('msc').disabled = !msc;
    setText('category-help', type.shared ? 'Shows your share and your employer’s share separately.' : 'Shows the full contribution payable by the individual member.');
    setText('amount-label', ['self-employed', 'land-based-ofw'].includes(category) ? 'Monthly income' : 'Monthly gross compensation');
    setText('category-note', notes[category] || ''); $('category-note').hidden = !notes[category];
    if (msc) loadMscOptions();
  }
  async function loadMscOptions() {
    const id = ++mscSeq, previous = $('msc').value, select = $('msc');
    select.replaceChildren(new Option('Loading salary credits from the API…', '')); select.disabled = true;
    try {
      const { rows } = await api.rateTable($('category').value, $('month').value);
      if (id !== mscSeq) return;
      select.replaceChildren(new Option('Select an approved MSC', ''));
      for (const value of new Set(rows.map(r => r.monthly_salary_credit))) select.add(new Option(pesos(value), value));
      if ([...select.options].some(o => o.value === previous)) select.value = previous;
    } catch (error) {
      if (id !== mscSeq) return;
      select.replaceChildren(new Option(error.code === 'NO_LAW' ? 'No table for this month' : 'Could not load salary credits', ''));
    } finally { if (id === mscSeq) select.disabled = !useMsc(); }
  }
  async function submitForward() {
    const category = $('category').value, month = $('month').value, msc = useMsc();
    if (msc && !$('msc').value) throw new api.InputError('Select an approved monthly salary credit from the list for this month.', 'msc');
    const result = await (msc ? api.lookupByMsc(category, month, $('msc').value) : api.lookupBySalary(category, month, $('amount').value));
    return { result, render: () => renderRow(result.rows[0], { kind: 'forward', basis: msc ? 'salary-credit' : 'compensation', month, input: msc ? null : api.parsePesos($('amount').value) }) };
  }

  /* ---------- Reverse lookup ---------- */
  function updateReverse() {
    const type = api.MEMBER_TYPES[$('r-category').value], fields = api.reverseFields($('r-category').value);
    const previous = $('r-field').value;
    $('r-field').replaceChildren(...fields.map(f => new Option(fieldLabels[f], f)));
    if (fields.includes(previous)) $('r-field').value = previous;
    setText('r-field-help', fieldHelp[type.shared ? 'shared' : 'individual']);
  }
  async function submitReverse() {
    const category = $('r-category').value, month = $('r-month').value, field = $('r-field').value, amount = $('r-amount').value;
    const result = await api.reverse(category, month, field, amount);
    const entered = api.parsePesos(amount);
    return { result, render: () => {
      if (result.rows.length === 0) {
        showEmpty('No exact match.', pesos(entered) + ' is not a ' + fieldLabels[field].toLowerCase() + ' in the SSS table (' + labels[category] + ', ' + monthLabel(month) + '). Amounts must match a table row exactly.', { category, month, field, amount: entered });
        setText('result-status', 'No exact match for ' + pesos(entered) + '.');
      } else if (result.rows.length === 1) renderRow(result.rows[0], { kind: 'reverse', month, field, input: entered });
      else renderCandidates(result.rows, { month, field, input: entered });
    } };
  }
  $('nearest').addEventListener('click', async () => {
    if (!nearestRequest) return;
    const { category, month, field, amount } = nearestRequest, id = ++seq;
    busy(true); clearError();
    try {
      const result = await api.nearestBelow(category, month, field, amount);
      if (id !== seq) return;
      if (!result.rows.length) showEmpty('No lower amount.', 'There is no table amount at or below ' + pesos(amount) + '.');
      else {
        $('r-amount').value = result.rows[0][field];
        renderRow(result.rows[0], { kind: 'reverse', month, field, input: amount, nearest: true });
      }
      showApi(result);
    } catch (error) { if (id === seq) showError(error); }
    finally { if (id === seq) busy(false); }
  });

  /* ---------- Rendering ---------- */
  function rangeText(row) { return row.no_upper_limit ? pesos(row.salary_min) + ' or more' : pesos(row.salary_min) + ' – ' + pesos(row.salary_max); }
  function lawText(row) {
    return row.law + ' · applies from ' + row.valid_from + (row.still_in_effect ? ', still in effect' : ' to ' + row.valid_until) + '.';
  }
  function renderRow(row, ctx) {
    const individual = !api.MEMBER_TYPES[row.member_type].shared;
    const c = name => api.toCentavos(row[name]);
    const payers = individual ? [{ label: 'Member pays', total: c('member_pays'), note: 'Paid in full by the individual member.' }] : [
      { label: 'Employee share', total: c('employee_pays'), note: row.member_type === 'household' && c('employee_pays') === 0 ? 'Employer pays the full amount below ₱5,000 compensation.' : 'The amount deductible from pay.' },
      { label: 'Employer share', total: c('employer_pays'), note: 'Includes the employer-paid EC premium.' },
    ];
    const reverse = ctx.kind === 'reverse';
    setText('total-eyebrow', reverse ? 'MONTHLY SALARY CREDIT' : 'TOTAL MONTHLY CONTRIBUTION');
    setText('total-amount', reverse ? pesos(row.monthly_salary_credit) : pesos(row.total));
    setText('result-badge', reverse ? (ctx.nearest ? 'Closest amount at or below' : 'Reverse lookup') : ctx.basis === 'salary-credit' ? 'Approved MSC input' : 'Actual monthly input');
    const parts = [monthLabel(ctx.month), labels[row.member_type]];
    if (reverse) parts.push((ctx.nearest ? 'nearest to ' : '') + fieldLabels[ctx.field].toLowerCase() + ' ' + pesos(ctx.nearest ? row[ctx.field] : ctx.input), 'salary range ' + rangeText(row), 'total contribution ' + pesos(row.total));
    else if (ctx.input) parts.push(pesos(ctx.input) + ' monthly compensation');
    setText('total-context', parts.join(' · '));
    $('payer-grid').hidden = false; $('payer-grid').classList.toggle('single', individual); $('payer-grid').replaceChildren();
    for (const payer of payers) {
      const card = node('div'); card.append(node('p', payer.label, 'payer-label'), node('p', money(payer.total), 'payer-value'), node('p', payer.note, 'payer-note')); $('payer-grid').append(card);
    }
    const b = JSON.parse(row.breakdown_json);
    const headers = individual ? ['Component', 'Member', 'Total'] : ['Component', 'Employer', 'Employee', 'Total'];
    const header = node('tr');
    for (const text of headers) { const th = node('th', text); th.scope = 'col'; header.append(th); }
    $('breakdown-head').replaceChildren(header);
    function tableRow(label, values) { const tr = node('tr'); const th = node('th', label); th.scope = 'row'; tr.append(th); for (const v of values) tr.append(node('td', money(v))); return tr; }
    const components = [['Regular SS', 'employer_ss', 'employee_ss', 'member_ss'], ['WISP / MPF', 'employer_mpf', 'employee_mpf', 'member_mpf'], ['EC', 'employer_ec', null, 'member_ec']];
    $('breakdown-body').replaceChildren(...components.map(([label, er, ee, mb]) => {
      const employer = api.toCentavos(b[er]), employee = ee ? api.toCentavos(b[ee]) : 0, member = api.toCentavos(b[mb]);
      return tableRow(label, individual ? [member, member] : [employer, employee, employer + employee]);
    }));
    $('breakdown-foot').replaceChildren(tableRow('Total', individual ? [c('member_pays'), c('total')] : [c('employer_pays'), c('employee_pays'), c('total')]));
    setText('salary-range', rangeText(row)); setText('msc-total', pesos(row.monthly_salary_credit));
    setText('msc-regular', pesos(b.regular_salary_credit)); setText('msc-mpf', pesos(b.mpf_salary_credit));
    setText('source-description', lawText(row)); $('source-link').href = row.law_url;
    $('candidates').hidden = true; $('breakdown').hidden = false;
    $('result').hidden = false; $('empty-state').hidden = true;
    setText('result-status', reverse
      ? 'Monthly salary credit ' + pesos(row.monthly_salary_credit) + ', salary range ' + rangeText(row) + '.'
      : 'Monthly total ' + pesos(row.total) + '. ' + payers.map(p => p.label + ' ' + money(p.total)).join('. '));
    lastResult = { mode: ctx.kind, input: ctx, row };
  }
  function renderCandidates(rows, ctx) {
    const field = ctx.field;
    setText('total-eyebrow', 'MATCHING SALARY CREDITS');
    setText('total-amount', rows.length + ' possible rows');
    setText('result-badge', 'Amount alone cannot decide');
    setText('total-context', monthLabel(ctx.month) + ' · ' + labels[rows[0].member_type] + ' · ' + fieldLabels[field].toLowerCase() + ' ' + pesos(ctx.input));
    $('payer-grid').hidden = true;
    setText('candidates-note', 'This ' + fieldLabels[field].toLowerCase() + ' appears in ' + rows.length + ' rows of the household table, because the employer pays the full contribution below ₱5,000. Search by ' + alternatives[field] + ' instead to get a single answer.');
    $('candidates-body').replaceChildren(...rows.map(r => {
      const tr = node('tr'); const th = node('th', rangeText(r)); th.scope = 'row'; tr.append(th);
      for (const k of ['monthly_salary_credit', 'employee_pays', 'employer_pays', 'total']) tr.append(node('td', pesos(r[k])));
      return tr;
    }));
    setText('source-description', lawText(rows[0])); $('source-link').href = rows[0].law_url;
    $('candidates').hidden = false; $('breakdown').hidden = true;
    $('result').hidden = false; $('empty-state').hidden = true;
    setText('result-status', rows.length + ' rows match this amount. Search by ' + alternatives[field] + ' for a single answer.');
    lastResult = { mode: 'reverse', input: ctx, rows };
  }
  function showApi(result) {
    setText('api-url', result.url); $('api-open').href = result.url;
    setText('api-response', JSON.stringify(result.raw, null, 2));
    $('api-panel').hidden = false;
    if (lastResult) lastResult.request = result.url;
  }

  /* ---------- Submit, copy, download ---------- */
  async function submit(event) {
    event?.preventDefault(); clearError(); setText('action-status', '');
    const id = ++seq;
    busy(true);
    try {
      const { result, render } = await (mode === 'forward' ? submitForward() : submitReverse());
      if (id !== seq) return;
      render(); showApi(result);
    } catch (error) {
      if (id !== seq) return;
      showEmpty('Your result, from the API.', 'Fix the highlighted detail and run the lookup again.');
      if (error.url) { showApi({ url: error.url, raw: { note: 'See the error message above.' } }); }
      showError(error);
    } finally { if (id === seq) busy(false); }
  }
  function summary(r) {
    const row = r.row;
    if (!row) return ['SSS reverse lookup — ' + r.input.month, r.rows.length + ' rows match ' + fieldLabels[r.input.field].toLowerCase() + ' ' + pesos(r.input.input) + ':',
      ...r.rows.map(x => '  MSC ' + pesos(x.monthly_salary_credit) + ', salary ' + rangeText(x) + ', total ' + pesos(x.total)), 'API: ' + r.request].join('\n');
    return [(r.mode === 'reverse' ? 'SSS reverse lookup — ' : 'SSS contribution — ') + r.input.month, labels[row.member_type],
      'Monthly salary credit: ' + pesos(row.monthly_salary_credit), 'Salary range: ' + rangeText(row),
      'Total monthly contribution: ' + pesos(row.total), 'Employee: ' + pesos(row.employee_pays), 'Employer: ' + pesos(row.employer_pays),
      'Individual member: ' + pesos(row.member_pays), 'Source: ' + row.law + ' — ' + row.law_url, 'API: ' + r.request,
      'Reference lookup; eligibility and payment posting require separate handling.'].join('\n');
  }
  async function copyText(text, done) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text); setText('action-status', done);
    } catch { setText('action-status', 'Clipboard access is unavailable in this browser. Select the text and copy it instead.'); }
  }
  $('copy').addEventListener('click', () => lastResult && copyText(summary(lastResult), 'Summary copied.'));
  $('api-copy').addEventListener('click', () => copyText($('api-url').textContent, 'API URL copied.'));
  $('download').addEventListener('click', () => {
    if (!lastResult) return;
    const blob = new Blob([JSON.stringify({ ...lastResult, currency: 'PHP', monetaryUnit: 'pesos', note: 'Values as returned by the public SSS API. Reference lookup; eligibility and payment posting require separate handling.' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = node('a'); link.href = url;
    link.download = 'sss-' + (lastResult.row?.member_type || lastResult.rows[0].member_type) + '-' + lastResult.input.month + (lastResult.mode === 'reverse' ? '-reverse' : '') + '.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); setText('action-status', 'Result download started.');
  });

  for (const f of [$('forward-form'), $('reverse-form')]) {
    f.addEventListener('submit', submit);
    f.addEventListener('input', invalidate);
  }
  $('forward-form').addEventListener('change', event => { invalidate(); if (['category', 'basis', 'month'].includes(event.target.id)) updateForward(); });
  $('reverse-form').addEventListener('change', event => { invalidate(); if (event.target.id === 'r-category') updateReverse(); });
  function setMonths() {
    const date = new Date(), value = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
    $('month').value = value; $('r-month').value = value;
  }
  $('reset-details').addEventListener('click', () => {
    $('forward-form').reset(); $('reverse-form').reset(); setMonths(); lastCategory = $('category').value;
    updateForward(); updateReverse(); submit(); $(mode === 'forward' ? 'category' : 'r-category').focus();
  });
  if (!api) { showEmpty('Sample files missing.', 'api.js could not be loaded. Keep this folder’s files together.'); return; }
  setMonths(); updateForward(); updateReverse(); submit();
})();
