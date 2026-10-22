const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware } = require('../middleware');

const router = express.Router();
router.use(authMiddleware);

const mlUrl = () => process.env.FASTAPI_URL || 'http://localhost:8000';
const PARSE_TIMEOUT_MS = 60000;
const FORECAST_TIMEOUT_MS = 180000;

const wrap = (handler) => (req, res) => Promise.resolve(handler(req, res)).catch(err => {
  console.error(`Inventory route error (${req.method} ${req.originalUrl}):`, err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Inventory request failed' });
});

function normalizeMarket(market) {
  const name = String(market || '').replace(/\s+/g, ' ').trim();
  return { name, key: name.toLowerCase() };
}

function stripDataUrl(fileBase64) {
  const str = String(fileBase64 || '');
  return str.startsWith('data:') ? str.slice(str.indexOf(',') + 1) : str;
}

function sendMlError(res, err, action) {
  if (err.response) {
    const detail = err.response.data?.detail;
    const message = typeof detail === 'string' ? detail : `ML service could not ${action}.`;
    return res.status(err.response.status >= 500 ? 502 : err.response.status).json({ error: message });
  }
  console.error(`Inventory ML error (${action}):`, err.code || err.message);
  return res.status(503).json({
    error: 'The CatBoost ML service is not running. Start it with: cd ml-service && uvicorn main:app --port 8000'
  });
}

function validateFile(req, res) {
  const { fileName, fileBase64 } = req.body || {};
  if (!fileName || !fileBase64) {
    res.status(400).json({ error: 'fileName and fileBase64 are required' });
    return null;
  }
  return { fileName: String(fileName), fileBase64: stripDataUrl(fileBase64) };
}

// POST /api/inventory/preview — columns, sample rows and suggested column mapping
router.post('/preview', wrap(async (req, res) => {
  const file = validateFile(req, res);
  if (!file) return;
  try {
    const { data } = await axios.post(`${mlUrl()}/inventory/parse`, {
      file_name: file.fileName, file_base64: file.fileBase64
    }, { timeout: PARSE_TIMEOUT_MS, maxBodyLength: Infinity });
    res.json(data);
  } catch (err) {
    sendMlError(res, err, 'read this file');
  }
}));

// POST /api/inventory/uploads — store a sheet's sales under a market (adds to earlier uploads)
router.post('/uploads', wrap(async (req, res) => {
  const file = validateFile(req, res);
  if (!file) return;
  const market = normalizeMarket(req.body.market);
  if (!market.key) return res.status(400).json({ error: 'Market name is required' });

  const fileHash = crypto.createHash('sha256').update(Buffer.from(file.fileBase64, 'base64')).digest('hex');
  const existing = await db.inventoryUploads.findOne({ shopId: req.shopId, marketKey: market.key, fileHash });
  if (existing) {
    return res.status(409).json({ error: `This file was already uploaded to "${existing.market}" as ${existing.fileName}.` });
  }

  let normalized;
  try {
    const { data } = await axios.post(`${mlUrl()}/inventory/normalize`, {
      file_name: file.fileName, file_base64: file.fileBase64, mapping: req.body.mapping || null
    }, { timeout: PARSE_TIMEOUT_MS, maxBodyLength: Infinity, maxContentLength: Infinity });
    normalized = data;
  } catch (err) {
    return sendMlError(res, err, 'read this file');
  }

  const uploadId = uuidv4();
  const { stats } = normalized;
  try {
    const upload = await db.inventoryUploads.create({
      id: uploadId,
      shopId: req.shopId,
      market: market.name,
      marketKey: market.key,
      fileName: file.fileName,
      fileHash,
      sheetName: normalized.sheet_name,
      mapping: normalized.mapping,
      rowCount: stats.valid_rows,
      skippedRows: stats.skipped_rows,
      productCount: stats.product_count,
      dateFrom: stats.date_from,
      dateTo: stats.date_to
    });

    await db.inventorySaleRows.insertMany(normalized.rows.map(r => ({
      shopId: req.shopId,
      marketKey: market.key,
      uploadId,
      date: r.date,
      product: r.product,
      quantity: r.quantity,
      category: r.category ?? undefined,
      price: r.price ?? undefined,
      stock: r.stock ?? undefined,
      cost: r.cost ?? undefined,
      discountPct: r.discount_pct ?? undefined,
      festival: r.festival ?? undefined,
      festivalName: r.festival_name ?? undefined,
      promotion: r.promotion ?? undefined
    })), { ordered: false });
    await db.inventoryPlans.deleteOne({ shopId: req.shopId, marketKey: market.key });

    res.status(201).json({ upload, stats });
  } catch (err) {
    await db.inventorySaleRows.deleteMany({ uploadId }).catch(() => {});
    await db.inventoryUploads.deleteOne({ id: uploadId }).catch(() => {});
    if (err.code === 11000) {
      return res.status(409).json({ error: 'This file was already uploaded to this market.' });
    }
    console.error('Inventory upload save error:', err.message);
    res.status(500).json({ error: 'Could not save uploaded sales' });
  }
}));

// GET /api/inventory/markets — markets with their uploaded file counts and date ranges
router.get('/markets', wrap(async (req, res) => {
  try {
    const markets = await db.inventoryUploads.aggregate([
      { $match: { shopId: req.shopId } },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: '$marketKey',
          market: { $last: '$market' },
          files: { $sum: 1 },
          rows: { $sum: '$rowCount' },
          dateFrom: { $min: '$dateFrom' },
          dateTo: { $max: '$dateTo' },
          lastUploadAt: { $max: '$createdAt' }
        }
      },
      { $sort: { lastUploadAt: -1 } }
    ]);
    res.json(markets.map(({ _id, ...m }) => m));
  } catch (err) {
    res.status(500).json({ error: 'Could not load markets' });
  }
}));

// GET /api/inventory/uploads?market=
router.get('/uploads', wrap(async (req, res) => {
  const market = normalizeMarket(req.query.market);
  if (!market.key) return res.status(400).json({ error: 'market query parameter is required' });
  const uploads = await db.inventoryUploads
    .find({ shopId: req.shopId, marketKey: market.key }, { fileHash: 0, _id: 0, __v: 0 })
    .sort({ createdAt: -1 });
  res.json(uploads);
}));

// DELETE /api/inventory/uploads/:id — remove a file and its sales rows
router.delete('/uploads/:id', wrap(async (req, res) => {
  const upload = await db.inventoryUploads.findOne({ id: req.params.id, shopId: req.shopId });
  if (!upload) return res.status(404).json({ error: 'Upload not found' });
  await db.inventorySaleRows.deleteMany({ uploadId: upload.id, shopId: req.shopId });
  await db.inventoryUploads.deleteOne({ id: upload.id, shopId: req.shopId });
  // The saved plan no longer matches the data; it is recalculated on the next "Calculate".
  await db.inventoryPlans.deleteOne({ shopId: req.shopId, marketKey: upload.marketKey });
  res.json({ deleted: upload.id });
}));

function parseLocalFestivalDates(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,\n;]+/);
  return list.map(s => String(s).trim()).filter(Boolean).slice(0, 60);
}

// POST /api/inventory/plan — CatBoost forecast over every file uploaded for the market
router.post('/plan', wrap(async (req, res) => {
  const market = normalizeMarket(req.body.market);
  if (!market.key) return res.status(400).json({ error: 'Market name is required' });

  const rows = await db.inventorySaleRows
    .find({ shopId: req.shopId, marketKey: market.key }, { _id: 0, shopId: 0, marketKey: 0, __v: 0 })
    .lean();
  if (rows.length === 0) {
    return res.status(400).json({ error: `No sales uploaded for "${market.name}" yet. Upload at least one Excel sheet.` });
  }

  const products = await db.products.find({ shopId: req.shopId }, { name: 1, quantity: 1 }).lean();
  const currentStock = {};
  products.forEach(p => { currentStock[p.name.trim().toLowerCase()] = Number(p.quantity) || 0; });

  const plannedDiscount = req.body.plannedDiscountPct;
  const hasPlannedDiscount = plannedDiscount !== undefined && plannedDiscount !== null && plannedDiscount !== '';

  let data;
  try {
    ({ data } = await axios.post(`${mlUrl()}/inventory/forecast`, {
      rows: rows.map(r => ({
        date: r.date,
        product: r.product,
        quantity: r.quantity,
        category: r.category ?? null,
        price: r.price ?? null,
        stock: r.stock ?? null,
        cost: r.cost ?? null,
        discount_pct: r.discountPct ?? null,
        festival: r.festival ?? null,
        festival_name: r.festivalName ?? null,
        promotion: r.promotion ?? null,
        upload_id: r.uploadId
      })),
      current_stock: currentStock,
      review_days: Number(req.body.reviewDays) || 7,
      lead_time_days: req.body.leadTimeDays === undefined ? 2 : Number(req.body.leadTimeDays),
      service_level: Number(req.body.serviceLevel) || 0.95,
      planned_discount_pct: hasPlannedDiscount ? Number(plannedDiscount) : null,
      local_festival_dates: parseLocalFestivalDates(req.body.localFestivalDates)
    }, { timeout: FORECAST_TIMEOUT_MS, maxBodyLength: Infinity, maxContentLength: Infinity }));
  } catch (err) {
    return sendMlError(res, err, 'calculate the inventory plan');
  }

  await db.inventoryPlans.findOneAndUpdate(
    { shopId: req.shopId, marketKey: market.key },
    {
      $set: {
        market: market.name,
        method: data.method,
        settings: data.settings,
        data: data.data,
        summary: data.summary,
        validation: data.validation,
        attributeEffects: data.attribute_effects,
        upcomingFestivals: data.upcoming_festivals,
        topProducts: data.products.filter(p => p.order_quantity > 0).slice(0, 8).map(p => ({
          product: p.product, status: p.status, order_quantity: p.order_quantity,
          recommended_stock: p.recommended_stock, current_stock: p.current_stock,
          estimated_order_cost: p.estimated_order_cost, estimated_order_value: p.estimated_order_value
        })),
        notes: data.notes
      }
    },
    { upsert: true }
  ).catch(err => console.error('Saving inventory plan failed:', err.message));

  res.json({ market: market.name, ...data });
}));

// GET /api/inventory/overview — what the uploaded sheets say, for the dashboard
router.get('/overview', wrap(async (req, res) => {
  const shopId = req.shopId;
  const [markets, plans] = await Promise.all([
    db.inventoryUploads.aggregate([
      { $match: { shopId } },
      { $group: { _id: '$marketKey', market: { $last: '$market' }, files: { $sum: 1 }, rows: { $sum: '$rowCount' },
        dateFrom: { $min: '$dateFrom' }, dateTo: { $max: '$dateTo' }, lastUploadAt: { $max: '$createdAt' } } },
      { $sort: { lastUploadAt: -1 } }
    ]),
    db.inventoryPlans.find({ shopId }, { _id: 0, __v: 0 }).sort({ updatedAt: -1 }).lean()
  ]);
  if (markets.length === 0) return res.json({ hasData: false, markets: [], plans: [] });

  const marketKey = req.query.market ? normalizeMarket(req.query.market).key : markets[0]._id;
  const current = markets.find(m => m._id === marketKey) || markets[0];

  const [totals, byProduct, byCategory, byDay] = await Promise.all([
    db.inventorySaleRows.aggregate([
      { $match: { shopId, marketKey: current._id } },
      { $group: { _id: null, units: { $sum: '$quantity' },
        revenue: { $sum: { $multiply: ['$quantity', { $ifNull: ['$price', 0] }] } },
        cost: { $sum: { $multiply: ['$quantity', { $ifNull: ['$cost', 0] }] } },
        rowsWithPrice: { $sum: { $cond: [{ $gt: ['$price', null] }, 1, 0] } },
        rowsWithCost: { $sum: { $cond: [{ $gt: ['$cost', null] }, 1, 0] } },
        products: { $addToSet: { $toLower: '$product' } } } }
    ]),
    db.inventorySaleRows.aggregate([
      { $match: { shopId, marketKey: current._id } },
      { $group: { _id: { $toLower: '$product' }, name: { $first: '$product' }, units: { $sum: '$quantity' },
        revenue: { $sum: { $multiply: ['$quantity', { $ifNull: ['$price', 0] }] } } } },
      { $sort: { units: -1 } }, { $limit: 8 }
    ]),
    db.inventorySaleRows.aggregate([
      { $match: { shopId, marketKey: current._id } },
      { $group: { _id: { $ifNull: ['$category', 'Uncategorised'] }, units: { $sum: '$quantity' },
        revenue: { $sum: { $multiply: ['$quantity', { $ifNull: ['$price', 0] }] } } } },
      { $sort: { units: -1 } }, { $limit: 8 }
    ]),
    db.inventorySaleRows.aggregate([
      { $match: { shopId, marketKey: current._id } },
      { $group: { _id: '$date', units: { $sum: '$quantity' },
        revenue: { $sum: { $multiply: ['$quantity', { $ifNull: ['$price', 0] }] } } } },
      { $sort: { _id: -1 } }, { $limit: 30 }, { $sort: { _id: 1 } }
    ])
  ]);
  const t = totals[0] || {};
  res.json({
    hasData: true,
    market: current.market,
    markets: markets.map(({ _id, ...m }) => m),
    totals: {
      units: t.units || 0,
      revenue: t.rowsWithPrice ? Math.round(t.revenue) : null,
      grossProfit: t.rowsWithPrice && t.rowsWithCost ? Math.round(t.revenue - t.cost) : null,
      products: (t.products || []).length,
      rows: current.rows,
      files: current.files,
      dateFrom: current.dateFrom,
      dateTo: current.dateTo
    },
    topProducts: byProduct.map(p => ({ name: p.name, units: p.units, revenue: Math.round(p.revenue) })),
    categories: byCategory.map(c => ({ name: c._id, units: c.units, revenue: Math.round(c.revenue) })),
    dailyTrend: byDay.map(d => ({ date: d._id, units: d.units, revenue: Math.round(d.revenue) })),
    plan: plans.find(p => p.marketKey === current._id) || null
  });
}));

module.exports = router;
