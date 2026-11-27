const { db } = require('../db');

/**
 * Sales lines from the sheets uploaded in the Inventory Planner, for the most
 * recently uploaded market (one market only, so repeat uploads under different
 * market names are not added together). Dates are optional YYYY-MM-DD bounds.
 */
async function getSheetSales(shopId, { from, before } = {}) {
  const [latest] = await db.inventoryUploads.find({ shopId }).sort({ createdAt: -1 }).limit(1);
  if (!latest) return { rows: [], market: null };

  const filter = { shopId, marketKey: latest.marketKey };
  if (from || before) filter.date = { ...(from && { $gte: from }), ...(before && { $lt: before }) };
  const rows = await db.inventorySaleRows.find(filter).sort({ date: 1 }).lean();
  return { rows, market: latest.market };
}

const rowRevenue = (row) => row.quantity * (row.price || 0);

module.exports = { getSheetSales, rowRevenue };
