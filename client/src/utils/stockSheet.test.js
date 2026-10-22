import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { rowsToProducts, parseStockSheet, stockSheetTemplateCsv, MAX_STOCK_SHEET_ITEMS } from './stockSheet.js';

const asFile = (buffer) => ({ arrayBuffer: async () => buffer });

function xlsxFile(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Items');
  return asFile(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

test('maps common column names and fills optional fields', () => {
  const { products, skipped } = rowsToProducts([
    ['Item Name', 'MRP', 'Purchase Price', 'Qty', 'UOM', 'Category', 'Reorder Level'],
    ['Toor Dal', '₹1,140', 115, 20, 'kg', 'Grains', 5],
    ['Salt', 22, '', '', '', '', '']
  ]);
  assert.equal(skipped.length, 0);
  assert.deepEqual(products[0], {
    name: 'Toor Dal', nameHindi: '', emoji: '📦', sellingPrice: 1140, costPrice: 115,
    quantity: 20, unit: 'kg', category: 'Grains', minStock: 5
  });
  assert.deepEqual(
    { cost: products[1].costPrice, qty: products[1].quantity, unit: products[1].unit, cat: products[1].category, min: products[1].minStock },
    { cost: 17, qty: 0, unit: 'pc', cat: 'General', min: 5 }
  );
});

test('finds the header below title rows and ignores blank rows', () => {
  const { products } = rowsToProducts([
    ['Sharma Kirana Store'],
    ['Stock list — Sept'],
    [],
    ['Product', 'Price'],
    ['Milk', 28],
    ['', ''],
    ['Bread', 40]
  ]);
  assert.deepEqual(products.map(p => p.name), ['Milk', 'Bread']);
});

test('does not treat "Customer Name" or "Cost Price" as item name / selling price', () => {
  assert.throws(
    () => rowsToProducts([['Customer Name', 'Cost Price'], ['Ramesh', 10]]),
    /header row/
  );
});

test('skips rows without a valid price, missing names and duplicates', () => {
  const { products, skipped } = rowsToProducts([
    ['Item', 'Selling Price'],
    ['Sugar', 42],
    ['Tea', 'abc'],
    ['Soap', 0],
    ['', 30],
    ['sugar', 45]
  ]);
  assert.deepEqual(products.map(p => p.name), ['Sugar']);
  assert.deepEqual(skipped.map(s => s.reason), [
    'missing or invalid selling price', 'missing or invalid selling price', 'missing item name', 'duplicate item'
  ]);
  assert.equal(skipped[0].row, 3);
});

test('rejects sheets that are too large', () => {
  const rows = [['Item', 'Price']];
  for (let i = 0; i <= MAX_STOCK_SHEET_ITEMS; i++) rows.push([`Item ${i}`, 10]);
  assert.throws(() => rowsToProducts(rows), /at most/);
});

test('reads a real .xlsx workbook', async () => {
  const { products } = await parseStockSheet(xlsxFile([
    ['Item Name', 'Selling Price', 'Stock'],
    ['Ghee', 560, 3],
    ['Eggs', 7, 60]
  ]));
  assert.deepEqual(products.map(p => [p.name, p.sellingPrice, p.quantity]), [['Ghee', 560, 3], ['Eggs', 7, 60]]);
});

test('reads the downloadable CSV template', async () => {
  const { products, skipped } = await parseStockSheet(asFile(new TextEncoder().encode(stockSheetTemplateCsv()).buffer));
  assert.equal(skipped.length, 0);
  assert.deepEqual(products.map(p => p.name), ['Toor Dal', 'Parle-G Biscuit']);
  assert.equal(products[1].minStock, 30);
});
