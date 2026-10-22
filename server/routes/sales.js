const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware } = require('../middleware');

const router = express.Router();
router.use(authMiddleware);

// POST /api/sales - Record a new sale
router.post('/', async (req, res) => {
  try {
    const { items, customerId, customerName } = req.body;
    let paymentType = (req.body.paymentType || req.body.paymentMethod || 'cash').toLowerCase();
    
    // Map Frontend names to standard backend names
    if (paymentType === 'udhaar' || paymentType === 'credit') paymentType = 'udhaar';
    if (paymentType === 'upi' || paymentType === 'online') paymentType = 'upi';

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sale items are required' });
    }

    const saleId = uuidv4();
    const { paymentId } = req.body;
    if (paymentId) {
      const claimed = await db.payments.findOneAndUpdate(
        { id: paymentId, shopId: req.shopId, saleId: null },
        { $set: { saleId } },
        { returnDocument: 'after' }
      );
      if (!claimed) {
        const payment = await db.payments.findOne({ id: paymentId, shopId: req.shopId });
        if (!payment) return res.status(404).json({ error: 'Payment not found for this sale' });
        const existing = payment.saleId ? await db.sales.findOne({ id: payment.saleId, shopId: req.shopId }) : null;
        if (!existing) return res.status(409).json({ error: 'A sale is already being recorded for this payment' });
        return res.status(200).json({
          id: existing.id,
          total: existing.amount,
          paymentType: existing.method,
          items: existing.items,
          createdAt: existing.timestamp,
          duplicate: true
        });
      }
    }

    let total = 0;
    const processedItems = [];

    for (const item of items) {
      let product = null;
      if (item.productId) {
        product = await db.products.findOne({
          shopId: req.shopId,
          $or: [{ id: item.productId }, { name: item.productId }]
        });
      }
      if (!product && (item.productName || item.name)) {
        const pName = item.productName || item.name;
        product = await db.products.findOne({ shopId: req.shopId, name: pName });
      }

      if (!product) {
        const price = Number(item.price) || 50;
        const qty = Number(item.quantity || item.qty) || 1;
        const pName = item.productName || item.name || 'Store Item';
        const itemTotal = qty * price;
        total += itemTotal;
        processedItems.push({
          productId: item.productId || uuidv4(),
          name: pName,
          qty,
          price
        });
        continue;
      }

      const qty = Number(item.quantity || item.qty) || 1;
      const price = Number(item.price) || product.sellingPrice;
      const itemTotal = qty * price;
      total += itemTotal;

      processedItems.push({
        productId: product.id,
        name: product.name,
        qty: qty,
        price: price,
        costPrice: product.costPrice,
        category: product.category
      });

      // Reduce stock
      await db.products.findOneAndUpdate(
        { id: product.id, shopId: req.shopId },
        { $set: { quantity: Math.max(0, product.quantity - qty) } }
      );
    }

    // Handle customer (udhaar)
    let custId = customerId || null;
    if (paymentType === 'udhaar' && customerName && !custId) {
      let customer = await db.customers.findOne({ shopId: req.shopId, name: customerName });
      if (!customer) {
        customer = new db.customers({
          id: uuidv4(),
          shopId: req.shopId,
          name: customerName,
          phone: '',
          totalSpent: 0,
          totalCredit: 0,
          lastVisit: new Date()
        });
        await customer.save();
      }
      custId = customer.id;
    }

    // Create sale record
    const sale = new db.sales({
      id: saleId,
      shopId: req.shopId,
      customerId: custId,
      amount: total,
      method: paymentType || 'cash',
      items: processedItems,
      timestamp: new Date()
    });
    
    await sale.save();

    // Update customer stats
    if (custId) {
      const customer = await db.customers.findOne({ id: custId });
      if (customer) {
        const newTotalSpent = (customer.totalSpent || 0) + total;
        const newTotalTx = (customer.totalTransactions || 0) + 1;
        const newAOV = Math.round(newTotalSpent / newTotalTx);
        
        let newSegment = customer.customerType || 'Regular';
        if (newTotalSpent >= 4500 || newTotalTx >= 12) {
          newSegment = 'High Value';
        } else if (newTotalTx <= 2) {
          newSegment = 'New';
        } else {
          newSegment = 'Regular';
        }

        const updates = {
          totalSpent: newTotalSpent,
          totalTransactions: newTotalTx,
          averageOrderValue: newAOV,
          customerType: newSegment,
          status: 'Active',
          lastVisit: new Date()
        };
        if (paymentType === 'udhaar') {
          updates.totalCredit = (customer.totalCredit || 0) + total;
        }
        await db.customers.findOneAndUpdate({ id: custId }, { $set: updates });
      }
    }

    res.status(201).json({
      id: sale.id, // mapped back to legacy payload format
      total: sale.amount,
      paymentType: sale.method,
      items: processedItems,
      createdAt: sale.timestamp
    });
  } catch (err) {
    console.error('Sale error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sales - Get sales history
router.get('/', async (req, res) => {
  try {
    const { date, limit } = req.query;
    
    let query = { shopId: req.shopId };
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.timestamp = { $gte: startDate, $lt: endDate };
    }

    let salesQuery = db.sales.find(query).sort({ timestamp: -1 });
    if (limit) {
      salesQuery = salesQuery.limit(Number(limit));
    }

    const sales = await salesQuery;
    
    // Map to legacy layout
    const mappedSales = sales.map(s => ({
      id: s.id,
      shopId: s.shopId,
      total: s.amount,
      paymentType: s.method,
      createdAt: s.timestamp,
      items: s.items,
      customerId: s.customerId
    }));

    res.json(mappedSales);
  } catch (err) {
    console.error('Get sales error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sales/today
router.get('/today', async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const startDate = new Date(todayStr);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const sales = await db.sales.find({ 
      shopId: req.shopId,
      timestamp: { $gte: startDate, $lt: endDate }
    });

    const totalSales = sales.reduce((sum, s) => sum + s.amount, 0);
    const totalTransactions = sales.length;
    const cashSales = sales.filter(s => s.method === 'cash').reduce((sum, s) => sum + s.amount, 0);
    const creditSales = sales.filter(s => s.method === 'udhaar').reduce((sum, s) => sum + s.amount, 0);

    const mappedSales = sales.map(s => ({
      id: s.id,
      total: s.amount,
      paymentType: s.method,
      createdAt: s.timestamp,
      items: s.items
    }));

    res.json({
      date: todayStr,
      totalSales,
      totalTransactions,
      cashSales,
      creditSales,
      sales: mappedSales
    });
  } catch (err) {
    console.error('Get today sales error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sales/summary - Weekly/Monthly summary
router.get('/summary', async (req, res) => {
  try {
    // A simplified summary using finding all sales. 
    // In production with lots of a sales, this should use MongoDB aggregates.
    const sales = await db.sales.find({ shopId: req.shopId });
    const now = new Date();

    // Map legacy structure for aggregation
    const mappedSales = sales.map(s => ({
      total: s.amount,
      createdAt: s.timestamp.toISOString(),
      paymentType: s.method
    }));

    // Today
    const today = now.toISOString().split('T')[0];
    const todaySales = mappedSales.filter(s => s.createdAt.startsWith(today));

    // Yesterday
    const yesterday = new Date(now - 86400000).toISOString().split('T')[0];
    const yesterdaySales = mappedSales.filter(s => s.createdAt.startsWith(yesterday));

    // This week (last 7 days)
    const weekAgo = new Date(now - 7 * 86400000);
    const weekSales = mappedSales.filter(s => new Date(s.createdAt) >= weekAgo);

    // This month
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthSales = mappedSales.filter(s => s.createdAt.startsWith(monthStart));

    // Daily breakdown for last 7 days
    const dailyBreakdown = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const daySales = mappedSales.filter(s => s.createdAt.startsWith(dateStr));
      
      dailyBreakdown.push({
        date: dateStr,
        day: dayName,
        total: daySales.reduce((sum, s) => sum + s.total, 0),
        count: daySales.length
      });
    }

    // Recent sales (last 5)
    const recentSales = sales
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5)
      .map(s => ({
        amount: s.amount,
        method: s.method,
        items: s.items,
        timestamp: s.timestamp.toISOString()
      }));

    res.json({
      today: {
        total: todaySales.reduce((sum, s) => sum + s.total, 0),
        count: todaySales.length,
        cash: todaySales.filter(s => s.paymentType === 'cash').reduce((sum, s) => sum + s.total, 0),
        udhaar: todaySales.filter(s => s.paymentType === 'udhaar').reduce((sum, s) => sum + s.total, 0)
      },
      yesterday: {
        total: yesterdaySales.reduce((sum, s) => sum + s.total, 0)
      },
      thisWeek: {
        total: weekSales.reduce((sum, s) => sum + s.total, 0),
        count: weekSales.length
      },
      thisMonth: {
        total: monthSales.reduce((sum, s) => sum + s.total, 0),
        count: monthSales.length
      },
      dailyBreakdown,
      recentSales
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
