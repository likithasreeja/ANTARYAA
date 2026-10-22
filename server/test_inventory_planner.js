/**
 * Integration test: Excel/CSV inventory planner (requires the ML service on FASTAPI_URL, default :8000).
 *   cd ml-service && python -m uvicorn main:app --port 8000
 *   cd server && node test_inventory_planner.js
 */

const axios = require('axios');
const { app, connectDB } = require('./index');

const TEST_PORT = 5098;
const BASE_URL = `http://localhost:${TEST_PORT}/api`;
let server;
let failures = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    failures++;
    console.log(`  ❌ ${message}`);
  }
}

function salesCsv(fromDate, days, extraHeaderLines = '') {
  const lines = [extraHeaderLines + 'Bill Date,Item Name,Qty,Rate,Customer Name'];
  const start = new Date(fromDate + 'T00:00:00Z');
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const dateStr = `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    lines.push(`${dateStr},Rice 1kg,${weekend ? 30 : 8},60,Walk-in`);
    lines.push(`${dateStr},Milk 500ml,${18 + (i % 5)},28,Walk-in`);
  }
  return Buffer.from(lines.join('\n')).toString('base64');
}

async function register(phone) {
  const res = await axios.post(`${BASE_URL}/auth/register`, {
    name: `Inventory Test ${phone}`, ownerName: 'Tester', city: 'Bengaluru', phone, password: 'pass12345'
  });
  return { headers: { Authorization: `Bearer ${res.data.token}` } };
}

async function expectStatus(promise, status) {
  try {
    await promise;
    return false;
  } catch (e) {
    return e.response?.status === status ? e.response.data : false;
  }
}

async function run() {
  await connectDB();
  server = await new Promise(resolve => { const s = app.listen(TEST_PORT, () => resolve(s)); });

  const suffix = String(Date.now()).slice(-6);
  const shopA = await register(`91111${suffix}`);
  const shopB = await register(`92222${suffix}`);
  const market = 'Vajarahalli Market';
  const juneAug = salesCsv('2026-06-01', 75, 'Monthly sales export\n\n');
  const augSep = salesCsv('2026-08-12', 47);

  console.log('\n1. Preview detects header row and columns');
  const preview = await axios.post(`${BASE_URL}/inventory/preview`, { fileName: 'jun-aug.csv', fileBase64: juneAug }, shopA);
  check(preview.data.suggested_mapping.date === 'Bill Date', 'date column = Bill Date');
  check(preview.data.suggested_mapping.product === 'Item Name', 'product column = Item Name (not Customer Name)');
  check(preview.data.suggested_mapping.quantity === 'Qty', 'quantity column = Qty');
  check(preview.data.row_count === 150, `row count 150 (got ${preview.data.row_count})`);

  console.log('\n2. Upload several files to one market');
  const up1 = await axios.post(`${BASE_URL}/inventory/uploads`, { market, fileName: 'jun-aug.csv', fileBase64: juneAug, mapping: preview.data.suggested_mapping }, shopA);
  check(up1.status === 201 && up1.data.upload.rowCount === 150, 'first file stored with 150 rows');
  check(up1.data.upload.dateFrom === '2026-06-01' && up1.data.upload.dateTo === '2026-08-14', 'day-first dates parsed (1/6/2026 → 2026-06-01)');

  const dup = await expectStatus(axios.post(`${BASE_URL}/inventory/uploads`, { market, fileName: 'copy.csv', fileBase64: juneAug }, shopA), 409);
  check(!!dup, 'same file uploaded twice is rejected (409)');

  const up2 = await axios.post(`${BASE_URL}/inventory/uploads`, { market: '  vajarahalli   MARKET ', fileName: 'aug-sep.csv', fileBase64: augSep }, shopA);
  check(up2.status === 201, 'second file accepted (market name matched case/space-insensitively)');

  const markets = await axios.get(`${BASE_URL}/inventory/markets`, shopA);
  check(markets.data.length === 1 && markets.data[0].files === 2 && markets.data[0].rows === 244, 'one market with 2 files, 244 rows');

  const badMapping = await expectStatus(axios.post(`${BASE_URL}/inventory/uploads`, {
    market, fileName: 'noqty.csv', fileBase64: Buffer.from('Date,Item\n1/9/2026,Salt\n').toString('base64')
  }, shopA), 400);
  check(badMapping && /quantity/.test(badMapping.error), 'file without quantity column rejected with clear message');

  console.log('\n3. CatBoost plan uses every file + live shop stock');
  await axios.post(`${BASE_URL}/products`, { name: 'Rice 1kg', sellingPrice: 60, costPrice: 50, quantity: 0 }, shopA);
  const plan = await axios.post(`${BASE_URL}/inventory/plan`, { market, reviewDays: 7, leadTimeDays: 2 }, shopA);
  const byName = Object.fromEntries(plan.data.products.map(p => [p.product, p]));
  check(plan.data.method === 'catboost', `method = catboost (got ${plan.data.method})`);
  check(plan.data.data.uploads === 2 && plan.data.data.history_days === 119, `plan combined both uploads into 119 days (got ${plan.data.data.history_days})`);
  check(plan.data.data.overlapping_entries === 6, `overlap of 3 days x 2 products reported (got ${plan.data.data.overlapping_entries})`);
  check(byName['Rice 1kg'].stock_source === 'shop_inventory' && byName['Rice 1kg'].status === 'critical', 'rice: live stock 0 → critical');
  check(byName['Rice 1kg'].order_quantity > 0 && byName['Rice 1kg'].order_quantity === byName['Rice 1kg'].recommended_stock, 'rice: order = recommended stock');
  check(byName['Milk 500ml'].status === 'stock_unknown', 'milk: no stock info → stock_unknown');
  check(plan.data.validation.catboost_wmape < plan.data.validation.baseline_wmape,
    `CatBoost beats moving average on holdout (${plan.data.validation.catboost_wmape.toFixed(1)}% vs ${plan.data.validation.baseline_wmape.toFixed(1)}%)`);

  console.log('\n4. Shops cannot see each other\'s markets');
  const otherUploads = await axios.get(`${BASE_URL}/inventory/uploads?market=${encodeURIComponent(market)}`, shopB);
  check(otherUploads.data.length === 0, 'shop B sees no uploads for shop A market');
  const otherPlan = await expectStatus(axios.post(`${BASE_URL}/inventory/plan`, { market }, shopB), 400);
  check(!!otherPlan, 'shop B cannot plan on shop A data');
  const otherDelete = await expectStatus(axios.delete(`${BASE_URL}/inventory/uploads/${up1.data.upload.id}`, shopB), 404);
  check(!!otherDelete, 'shop B cannot delete shop A upload');

  console.log('\n5. Deleting a file removes its sales from the plan');
  await axios.delete(`${BASE_URL}/inventory/uploads/${up2.data.upload.id}`, shopA);
  const planAfter = await axios.post(`${BASE_URL}/inventory/plan`, { market }, shopA);
  check(planAfter.data.data.uploads === 1 && planAfter.data.data.rows === 150, 'plan now uses only the remaining file');

  console.log('\n6. ML service offline → clear 503, no fake numbers');
  const savedUrl = process.env.FASTAPI_URL;
  process.env.FASTAPI_URL = 'http://127.0.0.1:65530';
  const offline = await expectStatus(axios.post(`${BASE_URL}/inventory/plan`, { market }, shopA), 503);
  check(offline && /not running/.test(offline.error), '503 with instructions to start the ML service');
  if (savedUrl === undefined) delete process.env.FASTAPI_URL; else process.env.FASTAPI_URL = savedUrl;

  console.log('\n7. Discount, cost, festival and promotion columns reach the model');
  const attrLines = ['Date,Product,Qty,Selling Price,Purchase Price,Discount %,Festival,Promo,Category'];
  const start = new Date('2026-06-01T00:00:00Z');
  for (let i = 0; i < 90; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const dateStr = `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
    const disc = i % 3 === 0 ? 20 : 0;
    const fest = i % 30 === 5 ? 'Bonalu' : 'No';
    attrLines.push(`${dateStr},Biscuits,${disc ? 30 : 10},20,15,${disc},${fest},${disc ? 1 : 0},Snacks`);
    attrLines.push(`${dateStr},Salt,${8 + (i % 3)},25,20,0,${fest},0,Staples`);
  }
  const attrMarket = 'Festival Market';
  const attrFile = Buffer.from(attrLines.join('\n')).toString('base64');
  const attrPreview = await axios.post(`${BASE_URL}/inventory/preview`, { fileName: 'attrs.csv', fileBase64: attrFile }, shopA);
  const m = attrPreview.data.suggested_mapping;
  check(m.cost === 'Purchase Price' && m.discount === 'Discount %' && m.festival === 'Festival' && m.promotion === 'Promo',
    `new columns auto-mapped (cost=${m.cost}, discount=${m.discount}, festival=${m.festival}, promotion=${m.promotion})`);
  await axios.post(`${BASE_URL}/inventory/uploads`, { market: attrMarket, fileName: 'attrs.csv', fileBase64: attrFile, mapping: m }, shopA);
  const discPlan = await axios.post(`${BASE_URL}/inventory/plan`, {
    market: attrMarket, reviewDays: 7, leadTimeDays: 1, plannedDiscountPct: 20, localFestivalDates: '2026-09-02, 2026-09-03'
  }, shopA);
  const noDiscPlan = await axios.post(`${BASE_URL}/inventory/plan`, { market: attrMarket, reviewDays: 7, leadTimeDays: 1, plannedDiscountPct: 0 }, shopA);
  const bisc = p => p.data.products.find(x => x.product === 'Biscuits');
  check(discPlan.data.attributes_used.discount && discPlan.data.attributes_used.cost && discPlan.data.attributes_used.promotion,
    'plan reports discount, cost and promotion as used');
  check(discPlan.data.attributes_used.festival_flags_in_sheets === 3, `3 festival days flagged in sheet (got ${discPlan.data.attributes_used.festival_flags_in_sheets})`);
  check(bisc(discPlan).forecast_period_demand > 1.5 * bisc(noDiscPlan).forecast_period_demand,
    `20% planned discount raises biscuit forecast (${bisc(discPlan).forecast_period_demand} vs ${bisc(noDiscPlan).forecast_period_demand})`);
  // ₹20 − 20% = ₹16 selling price, cost ₹15 → 6.25% margin
  check(bisc(discPlan).unit_cost === 15 && Math.abs(bisc(discPlan).margin_pct - 6.25) <= 0.06, `margin after 20% discount uses cost (got ${bisc(discPlan).margin_pct}%)`);
  check(discPlan.data.settings.local_festival_dates.length === 2, 'local festival dates passed to the model');

  console.log('\n8. Dashboard overview reflects uploaded data and the saved plan');
  const overview = await axios.get(`${BASE_URL}/inventory/overview?market=${encodeURIComponent(attrMarket)}`, shopA);
  check(overview.data.hasData && overview.data.market === attrMarket, 'overview for the uploaded market');
  check(overview.data.totals.products === 2 && overview.data.totals.revenue > 0 && overview.data.totals.grossProfit !== null,
    `totals from sheet (revenue ₹${overview.data.totals.revenue}, gross profit ₹${overview.data.totals.grossProfit})`);
  check(overview.data.plan && overview.data.plan.settings.planned_discount_pct === 0, 'latest calculated plan saved for the dashboard');
  check(overview.data.dailyTrend.length === 30, `30-day trend (got ${overview.data.dailyTrend.length})`);
  const emptyOverview = await axios.get(`${BASE_URL}/inventory/overview`, shopB);
  check(emptyOverview.data.hasData === false, 'shop without uploads gets hasData=false (no made-up numbers)');

  console.log(failures === 0 ? '\n🎉 ALL INVENTORY PLANNER TESTS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
}

run()
  .catch(err => {
    failures++;
    console.error('Test run crashed:', err.response?.data || err.message);
  })
  .finally(async () => {
    if (server) await new Promise(r => server.close(r));
    process.exit(failures === 0 ? 0 : 1);
  });
