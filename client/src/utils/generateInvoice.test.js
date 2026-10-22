import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoice, invoiceHtml, createInvoicePdf } from './generateInvoice.js';

const sale = {
  shop: { name: 'Golden Supermarket', ownerName: 'Raju', city: 'Pune', phone: '9876543210' },
  items: [
    { name: 'Amul Butter Family Pack', qty: 2, price: 285, unit: 'pc' },
    { name: 'Kurkure Masala Munch Value Pack', qty: 1.5, price: 20 }
  ],
  total: 600,
  method: 'UPI',
  customerName: 'Priya',
  invoiceNo: 'INV-ABC12345',
  date: '2026-09-28T08:30:00.000Z'
};

test('keeps the given bill number and computes line amounts', () => {
  const inv = buildInvoice(sale);
  assert.equal(inv.invoiceNo, 'INV-ABC12345');
  assert.deepEqual(inv.lines.map(l => l.amount), [570, 30]);
  assert.equal(inv.total, 600);
  assert.equal(inv.unitCount, 3.5);
  assert.equal(inv.lines[1].unit, 'pc');
});

test('falls back to defaults and sums the total when none is given', () => {
  const inv = buildInvoice({ items: [{ productName: 'Tea', quantity: 2, price: 45 }] });
  assert.equal(inv.shop.name, 'ANTARYA KIRANA STORE');
  assert.equal(inv.customerName, 'Walk-in Customer');
  assert.equal(inv.total, 90);
  assert.match(inv.invoiceNo, /^INV-\d{4}-\d{4}$/);
});

test('escapes customer, shop and item text in the printable bill', () => {
  const html = invoiceHtml(buildInvoice({
    ...sale,
    customerName: '<img src=x onerror=alert(1)>',
    items: [{ name: 'Chips "<b>"', qty: 1, price: 10 }]
  }));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('Chips &quot;&lt;b&gt;&quot;'));
  assert.ok(html.includes('INV-ABC12345'));
  assert.ok(!html.includes('window.print'));
});

test('creates a real PDF with the bill details', async () => {
  const doc = await createInvoicePdf(buildInvoice(sale));
  const pdf = doc.output();
  assert.ok(pdf.startsWith('%PDF-'));
  for (const text of ['GOLDEN SUPERMARKET', 'INV-ABC12345', 'Customer: Priya', 'Amul Butter Family Pack', 'Rs. 600']) {
    assert.ok(pdf.includes(text), `PDF should contain "${text}"`);
  }
});

test('PDF page grows with long bills', async () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ name: `Item number ${i} with a fairly long product name`, qty: 1, price: 10 }));
  const doc = await createInvoicePdf(buildInvoice({ items, total: 600 }));
  assert.ok(doc.internal.pageSize.getHeight() > 400);
  assert.equal(doc.getNumberOfPages(), 1);
});
