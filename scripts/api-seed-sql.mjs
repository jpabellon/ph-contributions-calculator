// Prints SQL for loading api/seed into NCB with the execute_sql MCP tool and for verifying the loaded copy.
// Usage: node scripts/api-seed-sql.mjs insert <batch> [batchSize]   (contribution_rates batch, 0-based)
//        node scripts/api-seed-sql.mjs verify                       (checksum query + expected rows)
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => JSON.parse(readFileSync(new URL('../api/seed/' + path, import.meta.url), 'utf8'));
const rates = read('contribution_rates.json');
const [command, batchArg = '0', sizeArg = '200'] = process.argv.slice(2);
const amount = s => s.endsWith('.00') ? s.slice(0, -3) : s;
const BREAKDOWN = ['employer_ss', 'employer_mpf', 'employer_ec', 'employee_ss', 'employee_mpf', 'member_ss', 'member_mpf', 'member_ec', 'regular_salary_credit', 'mpf_salary_credit'];
const COLUMNS = ['mt', 'lc', 'ro', 'smin', 'smax', 'nul', 'msc', 'er', 'ee', 'mb', 'tot', ...BREAKDOWN.map((_, i) => 'b' + i)];

if (command === 'insert') {
  const size = Number(sizeArg), batch = rates.slice(Number(batchArg) * size, (Number(batchArg) + 1) * size);
  if (!batch.length) throw new Error('EMPTY_BATCH');
  const tuples = batch.map((r, i) => {
    const b = JSON.parse(r.breakdown_json);
    const values = ["'" + r.member_type + "'", "'" + r.law_code + "'", r.row_order, amount(r.salary_min), amount(r.salary_max), r.no_upper_limit ? 1 : 0,
      amount(r.monthly_salary_credit), amount(r.employer_pays), amount(r.employee_pays), amount(r.member_pays), amount(r.total), ...BREAKDOWN.map(k => amount(b[k]))];
    return 'SELECT ' + (i ? values.join(',') : values.map((v, j) => v + ' ' + COLUMNS[j]).join(','));
  });
  const money = c => 'CAST(v.' + c + ' AS DECIMAL(12,2))';
  const breakdown = "CONCAT('{'," + BREAKDOWN.map((k, i) => `'${i ? ',' : ''}"${k}":"',${money('b' + i)},'"'`).join(',') + ",'}')";
  console.log('INSERT INTO contribution_rates (fund,member_type,law_code,law,law_url,valid_from,valid_until,still_in_effect,row_order,salary_min,salary_max,no_upper_limit,monthly_salary_credit,employer_pays,employee_pays,member_pays,total,breakdown_json)\n' +
    "SELECT 'sss',v.mt,v.lc,l.law,l.law_url,l.valid_from,l.valid_until,l.still_in_effect,v.ro," + ['smin', 'smax'].map(money).join(',') + ',v.nul,' +
    ['msc', 'er', 'ee', 'mb', 'tot'].map(money).join(',') + ',' + breakdown + '\nFROM (\n' + tuples.join('\nUNION ALL ') + "\n) v JOIN laws l ON l.law_code = v.lc AND l.fund = 'sss'");
} else if (command === 'verify') {
  // Field order must match the CONCAT_WS below; booleans are stored as 0/1 and DATE renders as YYYY-MM-DD.
  const fields = r => [r.fund, r.law, r.law_url, r.valid_from, r.valid_until, r.still_in_effect ? 1 : 0, r.row_order, r.salary_min, r.salary_max,
    r.no_upper_limit ? 1 : 0, r.monthly_salary_credit, r.employer_pays, r.employee_pays, r.member_pays, r.total, r.breakdown_json].join('|');
  const groups = new Map();
  for (const r of rates) { const k = r.law_code + ' ' + r.member_type; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const expected = [...groups].sort(([a], [b]) => a < b ? -1 : 1).map(([k, rows]) => {
    const sorted = rows.sort((a, b) => a.row_order - b.row_order);
    return { group: k, n: rows.length, h: createHash('md5').update(sorted.map(fields).join('\n')).digest('hex') };
  });
  console.log("SELECT CONCAT(law_code,' ',member_type) AS grp, COUNT(*) AS n, MD5(GROUP_CONCAT(CONCAT_WS('|',fund,law,law_url,valid_from,valid_until,still_in_effect,row_order,salary_min,salary_max,no_upper_limit,monthly_salary_credit,employer_pays,employee_pays,member_pays,total,breakdown_json) ORDER BY row_order SEPARATOR '\\n')) AS h FROM contribution_rates GROUP BY law_code, member_type ORDER BY grp");
  console.log(JSON.stringify(expected));
} else throw new Error('Usage: insert <batch> [size] | verify');
