export const STOCK_SHEET_ACCEPT = '.xlsx,.xls,.xlsm,.csv';
export const MAX_STOCK_SHEET_ITEMS = 2000;

const COLUMN_ALIASES = {
  name: ['item name', 'product name', 'item', 'product', 'name', 'particulars', 'description', 'saaman'],
  nameHindi: ['hindi name', 'name hindi', 'name (hindi)'],
  sellingPrice: ['selling price', 'sale price', 'sp', 'mrp', 'price', 'rate'],
  costPrice: ['cost price', 'purchase price', 'buying price', 'cost', 'cp'],
  quantity: ['current stock', 'opening stock', 'stock', 'quantity', 'qty'],
  unit: ['unit', 'uom'],
  category: ['category', 'group', 'type'],
  minStock: ['min stock', 'minimum stock', 'reorder level', 'reorder point']
};

const HEADER_SCAN_ROWS = 10;

const normalizeHeader = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9()]+/g, ' ').trim();

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value ?? '').replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (cleaned === '') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function mapHeaderRow(row) {
  const headers = row.map(normalizeHeader);
  const mapping = {};
  const used = new Set();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const index = headers.findIndex((h, i) => h === alias && !used.has(i));
      if (index !== -1) {
        mapping[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

/**
 * Turns spreadsheet rows (array of arrays, header row somewhere in the first
 * few rows) into products accepted by POST /api/products/bulk.
 */
export function rowsToProducts(rows) {
  const headerIndex = rows.slice(0, HEADER_SCAN_ROWS).findIndex(row => {
    const m = mapHeaderRow(row || []);
    return m.name !== undefined && m.sellingPrice !== undefined;
  });

  if (headerIndex === -1) {
    throw new Error('Could not find the header row. The sheet needs an "Item Name" column and a "Selling Price" (or MRP / Price) column.');
  }

  const mapping = mapHeaderRow(rows[headerIndex]);
  const products = [];
  const skipped = [];
  const seen = new Set();

  rows.slice(headerIndex + 1).forEach((row, i) => {
    const rowNumber = headerIndex + i + 2;
    if (!row || row.every(cell => String(cell ?? '').trim() === '')) return;

    const name = String(row[mapping.name] ?? '').trim();
    if (!name) {
      skipped.push({ row: rowNumber, reason: 'missing item name' });
      return;
    }

    const sellingPrice = parseNumber(row[mapping.sellingPrice]);
    if (sellingPrice === null || sellingPrice <= 0) {
      skipped.push({ row: rowNumber, name, reason: 'missing or invalid selling price' });
      return;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ row: rowNumber, name, reason: 'duplicate item' });
      return;
    }
    seen.add(key);

    const read = (field) => (mapping[field] === undefined ? null : parseNumber(row[mapping[field]]));
    const text = (field) => (mapping[field] === undefined ? '' : String(row[mapping[field]] ?? '').trim());

    const costPrice = read('costPrice');
    const quantity = read('quantity');
    const minStock = read('minStock');

    products.push({
      name,
      nameHindi: text('nameHindi'),
      emoji: '📦',
      sellingPrice,
      costPrice: costPrice !== null && costPrice >= 0 ? costPrice : Math.round(sellingPrice * 0.75),
      quantity: quantity !== null && quantity >= 0 ? quantity : 0,
      unit: text('unit') || 'pc',
      category: text('category') || 'General',
      minStock: minStock !== null && minStock >= 0 ? minStock : 5
    });
  });

  if (products.length > MAX_STOCK_SHEET_ITEMS) {
    throw new Error(`The sheet has ${products.length} items. Please upload at most ${MAX_STOCK_SHEET_ITEMS} at a time.`);
  }

  return { products, skipped };
}

export async function parseStockSheet(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The file has no sheets.');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  return rowsToProducts(rows);
}

export function stockSheetTemplateCsv() {
  return [
    'Item Name,Selling Price,Cost Price,Stock,Unit,Category,Min Stock',
    'Toor Dal,140,115,20,kg,Grains,5',
    'Parle-G Biscuit,10,8,100,pc,Snacks,30'
  ].join('\n');
}
