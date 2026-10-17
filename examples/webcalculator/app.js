(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('contribution-form');
  const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
  const money = cents => currency.formatToParts(BigInt(cents) / 100n).map(part => part.type === 'fraction' ? String(cents % 100).padStart(2, '0') : part.value).join('');
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
  let lastResult = null;
  let changedCategory = $('category').value;
  function setText(id, text) { $(id).textContent = text; }
  function showError(error) {
    const text = error.field ? error.message : ({
      AMOUNT_OVERFLOW: 'The calculated amount is too large. Enter a smaller income amount.',
      INVALID_FREQUENCY: 'Choose a supported pay frequency.',
    }[error.message] || 'The calculation could not be completed. Check your inputs and bundled schedule files.');
    setText('form-error', text); $('form-error').hidden = false;
    if (error.field && $(error.field)) { $(error.field).setAttribute('aria-invalid', 'true'); $(error.field).focus(); }
    else $('form-error').scrollIntoView({ block: 'nearest' });
  }
  function clearError() {
    $('form-error').hidden = true;
    for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  }
  function invalidate() {
    lastResult = null; $('result').hidden = true; $('empty-state').hidden = false;
    setText('empty-message', 'Your details have changed. Calculate to see an updated contribution.');
    setText('result-status', 'Inputs changed. Calculate to update the result.');
    setText('action-status', ''); clearError();
  }
  function readFields() {
    return Object.fromEntries(['category', 'month', 'basis', 'amount', 'frequency', 'days', 'msc'].map(id => [id, $(id).value]));
  }
  function updateFields() {
    const category = $('category').value;
    const forced = ['voluntary', 'non-working-spouse'].includes(category);
    const flexible = ['self-employed', 'land-based-ofw'].includes(category);
    const categoryChanged = changedCategory !== category;
    if (categoryChanged) { $('basis').value = 'compensation'; $('msc').value = ''; changedCategory = category; }
    const useMSC = forced || (flexible && $('basis').value === 'salary-credit');
    $('basis-field').hidden = !flexible;
    $('income-fields').hidden = useMSC; $('msc-field').hidden = !useMSC;
    $('amount').disabled = useMSC; $('frequency').disabled = useMSC; $('msc').disabled = !useMSC;
    $('days-field').hidden = useMSC || $('frequency').value !== 'daily';
    $('days').disabled = useMSC || $('frequency').value !== 'daily';
    $('estimate-note').hidden = useMSC || $('frequency').value === 'monthly';
    setText('category-help', ['employed', 'household', 'sea-based-ofw'].includes(category) ? 'Shows your share and your employer’s share separately.' : 'Shows the full contribution payable by the individual member.');
    setText('amount-label', ['self-employed', 'land-based-ofw'].includes(category) ? 'Income amount' : 'Gross compensation amount');
    setText('amount-help', category === 'self-employed' ? 'Enter declared earnings for the selected frequency. Up to 2 decimal places.' : 'Enter gross compensation in PHP, not take-home pay. Up to 2 decimal places.');
    setText('category-note', notes[category] || ''); $('category-note').hidden = !notes[category];
    if (useMSC) {
      const previous = $('msc').value;
      $('msc').replaceChildren(new Option('Select an approved MSC', ''));
      try {
        const schedule = window.SSSCalculator.findSchedule(category, $('month').value);
        for (const value of new Set(schedule.brackets.map(b => b.monthlySalaryCreditCentavos))) $('msc').add(new Option(money(value), String(value)));
        if ([...$('msc').options].some(o => o.value === previous)) $('msc').value = previous;
      } catch { /* A month error is displayed on submit. */ }
    }
  }
  function node(tag, text, className) {
    const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function render(r) {
    const individual = !['employed', 'household', 'sea-based-ofw'].includes(r.memberCategory);
    const payers = individual ? [{ label: 'Your contribution', total: r.memberCentavos, note: 'Paid in full by the individual member.' }] : [
      { label: 'Employee share', total: r.employeeCentavos, note: r.memberCategory === 'household' && r.employeeCentavos === 0 ? 'Employer pays the full amount below ₱5,000 compensation.' : 'The amount deductible from your pay.' },
      { label: 'Employer share', total: r.employerCentavos, note: 'Includes the employer-paid EC premium.' },
    ];
    setText('total-amount', money(r.grandTotalCentavos));
    setText('result-badge', r.estimated ? 'Annualized estimate' : r.basis === 'salary-credit' ? 'Approved MSC input' : 'Actual monthly input');
    const [year, month] = r.applicableMonth.split('-').map(Number);
    const period = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
    setText('total-context', period + ' · ' + labels[r.memberCategory] + (r.monthlyCompensationCentavos !== null ? ' · ' + money(r.monthlyCompensationCentavos) + ' monthly ' + (r.estimated ? 'estimate' : 'compensation') : ''));
    $('payer-grid').classList.toggle('single', individual); $('payer-grid').replaceChildren();
    for (const payer of payers) {
      const card = node('div'); card.append(node('p', payer.label, 'payer-label'), node('p', money(payer.total), 'payer-value'), node('p', payer.note, 'payer-note')); $('payer-grid').append(card);
    }
    const headers = individual ? ['Component', 'Member', 'Total'] : ['Component', 'Employer', 'Employee', 'Total'];
    const header = node('tr');
    for (const text of headers) { const th = node('th', text); th.scope = 'col'; header.append(th); }
    $('breakdown-head').replaceChildren(header);
    const b = r.breakdown;
    const components = [
      ['Regular SS', b.employerSSCentavos, b.employeeSSCentavos, b.memberSSCentavos],
      ['WISP / MPF', b.employerMPFCentavos, b.employeeMPFCentavos, b.memberMPFCentavos],
      ['EC', b.employerECCentavos, 0, b.memberECCentavos],
    ];
    $('breakdown-body').replaceChildren();
    function row(label, values) { const tr = node('tr'); const th = node('th', label); th.scope = 'row'; tr.append(th); for (const value of values) tr.append(node('td', money(value))); return tr; }
    for (const [label, employer, employee, member] of components) $('breakdown-body').append(row(label, individual ? [member, member] : [employer, employee, employer + employee]));
    $('breakdown-foot').replaceChildren(row('Total', individual ? [r.memberCentavos, r.grandTotalCentavos] : [r.employerCentavos, r.employeeCentavos, r.grandTotalCentavos]));
    setText('msc-total', money(r.monthlySalaryCreditCentavos)); setText('msc-regular', money(b.regularSalaryCreditCentavos)); setText('msc-mpf', money(b.mpfSalaryCreditCentavos));
    setText('bracket-description', r.basis === 'salary-credit' ? 'Selected approved salary credit: ' + money(r.monthlySalaryCreditCentavos) + '.' : 'Monthly compensation bracket: ' + money(b.minCentavos) + (b.maxExclusiveCentavos === null ? ' and above.' : ' – ' + money(b.maxExclusiveCentavos - 1) + '.'));
    setText('source-description', 'Circular ' + r.sourceCircular + ' · Schedule effective ' + r.scheduleEffectiveFrom + '. The result uses this bundled schedule, including for later months until a replacement is added.');
    $('source-link').href = r.sourceUrl;
    $('result').hidden = false; $('empty-state').hidden = true;
    setText('result-status', 'Calculated ' + (r.estimated ? 'estimated ' : '') + 'monthly total ' + money(r.grandTotalCentavos) + '. ' + payers.map(p => p.label + ' ' + money(p.total)).join('. '));
    lastResult = r;
  }
  function submit(event) {
    event?.preventDefault(); clearError(); setText('action-status', '');
    try { render(window.SSSCalculator.calculate(readFields())); }
    catch (error) { invalidate(); showError(error); }
  }
  function summary(r) {
    return ['SSS contribution — ' + r.applicableMonth, labels[r.memberCategory],
      'Total monthly contribution: ' + money(r.grandTotalCentavos),
      'Employee: ' + money(r.employeeCentavos), 'Employer: ' + money(r.employerCentavos),
      'Individual member: ' + money(r.memberCentavos), 'Monthly salary credit: ' + money(r.monthlySalaryCreditCentavos),
      r.estimated ? 'Annualized estimate; use actual monthly earnings for final payroll.' : r.basis === 'salary-credit' ? 'Based on an approved MSC input.' : 'Based on actual monthly compensation.',
      'Source: SSS Circular ' + r.sourceCircular + ' — ' + r.sourceUrl,
      'Reference calculation; eligibility and payment posting require separate handling.'].join('\n');
  }
  form.addEventListener('submit', submit);
  form.addEventListener('input', invalidate);
  form.addEventListener('change', () => { invalidate(); updateFields(); });
  $('reset-details').addEventListener('click', () => { form.reset(); setMonth(); changedCategory = $('category').value; updateFields(); submit(); $('category').focus(); });
  $('copy').addEventListener('click', async () => {
    if (!lastResult) return;
    const text = summary(lastResult);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else throw new Error('Clipboard unavailable');
      setText('action-status', 'Summary copied.');
    } catch {
      const area = node('textarea'); area.value = text; area.setAttribute('aria-label', 'Contribution summary'); document.body.append(area); area.focus(); area.select();
      try { if (!document.execCommand('copy')) throw new Error(); setText('action-status', 'Summary copied.'); }
      catch { setText('action-status', 'Clipboard access is unavailable. Download the result instead.'); }
      finally { area.remove(); $('copy').focus(); }
    }
  });
  $('download').addEventListener('click', () => {
    if (!lastResult) return;
    const blob = new Blob([JSON.stringify({ ...lastResult, currency: 'PHP', monetaryUnit: 'centavos', note: 'Reference calculation; eligibility and payment posting require separate handling.' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = node('a'); link.href = url; link.download = 'sss-' + lastResult.memberCategory + '-' + lastResult.applicableMonth + '.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); setText('action-status', 'Result download started.');
  });
  function setMonth() {
    const date = new Date(); $('month').value = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }
  try {
    if (!window.SSSContributions || !window.SSSCalculatorData || !window.SSSCalculator) throw new Error('Missing sample files');
    setMonth(); updateFields(); submit();
  } catch { $('result').hidden = true; $('empty-state').hidden = false; showError(new Error('Missing sample files')); }
})();
