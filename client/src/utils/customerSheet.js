export const CUSTOMER_SHEET_ACCEPT = '.xlsx,.xls,.xlsm,.csv';
export const MAX_CUSTOMER_ROWS = 2000;

const COLUMN_ALIASES = {
  name: ['customer name', 'name', 'customer'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number'],
  city: ['city', 'area', 'location', 'address'],
  totalCredit: ['outstanding balance', 'outstanding', 'credit balance', 'credit', 'udhaar', 'balance', 'due', 'pending amount'],
  amountPaid: ['amount paid', 'paid amount', 'paid'],
  lastVisit: ['date of purchase', 'purchase date', 'date']
};

const parseAmount = (text) => {
  const cleaned = text.replace(/[₹,\s]/g, '');
  const num = cleaned === '' ? 0 : Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

// Accepts YYYY-MM-DD, DD-MM-YYYY (or with /) and Excel date numbers. Returns YYYY-MM-DD or null.
function parseDate(text) {
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 86400000).toISOString().slice(0, 10);
  }
  let year, month, day, match;
  if ((match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, year, month, day] = match;
  else if ((match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) [, day, month, year] = match;
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible dates such as 31-02-2026
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === Number(day) ? date.toISOString().slice(0, 10) : null;
}

const normalize = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// "+91 98765-43210" and "9876543210" count as the same number
const phoneKey = (phone) => String(phone ?? '').replace(/\D/g, '').slice(-10);

const customerKey = (c) => phoneKey(c.phone) || `name:${normalize(c.name) || c.name.trim()}`;

/**
 * Turns spreadsheet rows (header row first) into new customers.
 * Rows without a name, and customers already saved or repeated in the file, are skipped.
 */
export function rowsToCustomers(rows, existing = []) {
  const headers = (rows[0] || []).map(normalize);
  const column = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const alias = aliases.find(a => headers.includes(a));
    if (alias) column[field] = headers.indexOf(alias);
  }
  if (column.name === undefined) {
    throw new Error('The first row needs a "Name" or "Customer Name" column.');
  }

  const seen = new Set(existing.map(c => customerKey({ name: c.name || '', phone: c.phone })));
  const customers = [];
  let duplicates = 0;
  let invalid = 0;

  for (const row of rows.slice(1)) {
    if (!row || row.every(cell => String(cell ?? '').trim() === '')) continue;
    const read = (field) => (column[field] === undefined ? '' : String(row[column[field]] ?? '').trim());

    const name = read('name');
    const totalCredit = parseAmount(read('totalCredit'));
    const paidText = read('amountPaid');
    const amountPaid = parseAmount(paidText);
    const dateText = read('lastVisit');
    const lastVisit = parseDate(dateText);
    if (!name || totalCredit === null || amountPaid === null || (dateText && !lastVisit)) {
      invalid += 1;
      continue;
    }

    const customer = { name, phone: read('phone'), city: read('city'), totalCredit };
    if (paidText) customer.amountPaid = amountPaid;
    if (lastVisit) customer.lastVisit = lastVisit;
    const key = customerKey(customer);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    customers.push(customer);
  }

  if (customers.length > MAX_CUSTOMER_ROWS) {
    throw new Error(`The file has ${customers.length} new customers. Upload at most ${MAX_CUSTOMER_ROWS} at a time.`);
  }

  return { customers, duplicates, invalid };
}

export async function parseCustomerSheet(file, existing) {
  const XLSX = await import('xlsx');
  // CSV is read as text so non-English names and leading zeros survive
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read((await file.text()).replace(/^﻿/, ''), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The file has no sheets.');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  return rowsToCustomers(rows, existing);
}
