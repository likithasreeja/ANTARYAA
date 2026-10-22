const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware } = require('../middleware');
const { generateDemoDataset } = require('../data/demoData');

const router = express.Router();
router.use(authMiddleware);

// GET /api/customers - All customers for shop with search, filter, and optional pagination
router.get('/', async (req, res) => {
  try {
    const { segment, status, search, page, limit, paginated } = req.query;
    const filter = { shopId: req.shopId };

    if (segment && segment !== 'all') {
      filter.customerType = segment;
    }
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await db.customers.countDocuments(filter);
    res.setHeader('X-Total-Count', total);

    if (paginated === 'true' || (page && limit)) {
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const customers = await db.customers.find(filter)
        .sort({ totalSpent: -1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);
      return res.json({
        customers,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    const customers = await db.customers.find(filter).sort({ totalSpent: -1, createdAt: -1 });
    res.json(customers);
  } catch (err) {
    console.error('Get customers error:', err);
    res.status(500).json({ error: 'Failed to retrieve customers' });
  }
});

// GET /api/customers/analytics - Aggregate customer analytics & metrics for charts
router.get('/analytics', async (req, res) => {
  try {
    const customers = await db.customers.find({ shopId: req.shopId });
    const sales = await db.sales.find({ shopId: req.shopId });

    const totalCustomers = customers.length;
    const activeCustomers = customers.filter(c => c.status === 'Active').length;
    const newCustomers = customers.filter(c => c.customerType === 'New').length;
    const regularCustomers = customers.filter(c => c.customerType === 'Regular').length;
    const highValueCustomers = customers.filter(c => c.customerType === 'High Value').length;
    const atRiskCustomers = customers.filter(c => c.customerType === 'At Risk').length;
    const inactiveCustomers = customers.filter(c => c.customerType === 'Inactive').length;

    const totalCustomerRevenue = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
    const totalCreditOutstanding = customers.reduce((sum, c) => sum + (c.totalCredit || 0), 0);
    const totalTransactions = customers.reduce((sum, c) => sum + (c.totalTransactions || 0), 0);

    const averageCustomerSpend = totalCustomers > 0 ? Math.round(totalCustomerRevenue / totalCustomers) : 0;
    const averageOrderValue = totalTransactions > 0 ? Math.round(totalCustomerRevenue / totalTransactions) : 0;
    const averageTxPerCustomer = totalCustomers > 0 ? (totalTransactions / totalCustomers).toFixed(1) : '0';

    // 1. Customer Revenue Distribution (Top 10 Spenders for Chart)
    const topRevenueCustomers = [...customers]
      .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        name: c.name,
        totalSpent: c.totalSpent || 0,
        transactions: c.totalTransactions || 1,
        segment: c.customerType || 'Regular'
      }));

    // 2. Transactions by Customer (Top 10 Most Frequent Shoppers)
    const topFrequentCustomers = [...customers]
      .sort((a, b) => (b.totalTransactions || 0) - (a.totalTransactions || 0))
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        name: c.name,
        transactions: c.totalTransactions || 0,
        totalSpent: c.totalSpent || 0
      }));

    // 3. Customer Activity Over Time (Group sales by week)
    const activityMap = {};
    sales.forEach(s => {
      const d = new Date(s.timestamp);
      // Group by Week (Year-Wxx or Date format)
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay()); // Sunday as week start
      const key = weekStart.toISOString().split('T')[0];
      
      if (!activityMap[key]) {
        activityMap[key] = { date: key, transactions: 0, revenue: 0, uniqueCustomers: new Set() };
      }
      activityMap[key].transactions += 1;
      activityMap[key].revenue += (s.amount || 0);
      if (s.customerId) activityMap[key].uniqueCustomers.add(s.customerId);
    });

    const activityOverTime = Object.values(activityMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => ({
        date: item.date,
        transactions: item.transactions,
        revenue: item.revenue,
        activeCustomersCount: item.uniqueCustomers.size
      }));

    // 4. Payment Method Distribution
    const paymentMap = { cash: 0, upi: 0, udhaar: 0 };
    const paymentCountMap = { cash: 0, upi: 0, udhaar: 0 };
    sales.forEach(s => {
      const m = (s.method || 'cash').toLowerCase();
      if (paymentMap[m] !== undefined) {
        paymentMap[m] += (s.amount || 0);
        paymentCountMap[m] += 1;
      } else {
        paymentMap.cash += (s.amount || 0);
        paymentCountMap.cash += 1;
      }
    });

    const paymentDistribution = [
      { name: 'Cash', value: paymentMap.cash, count: paymentCountMap.cash, color: '#10b981' },
      { name: 'UPI / Digital', value: paymentMap.upi, count: paymentCountMap.upi, color: '#3b82f6' },
      { name: 'Udhaar (Credit)', value: paymentMap.udhaar, count: paymentCountMap.udhaar, color: '#f43f5e' }
    ];

    // 5. Top Products Purchased across all customers
    const productStatsMap = {};
    sales.forEach(s => {
      if (s.items && Array.isArray(s.items)) {
        s.items.forEach(it => {
          const name = it.name || 'General Product';
          if (!productStatsMap[name]) {
            productStatsMap[name] = { name, unitsSold: 0, revenue: 0 };
          }
          productStatsMap[name].unitsSold += (it.qty || 1);
          productStatsMap[name].revenue += (it.price || 0) * (it.qty || 1);
        });
      }
    });

    const topProductsPurchased = Object.values(productStatsMap)
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 8);

    // 6. Segmentation Explainability & Rules
    const segmentationRules = [
      {
        segment: 'High Value',
        count: highValueCustomers,
        color: '#a855f7',
        criteria: 'Total lifetime spend ≥ ₹4,500 OR ≥ 12 total orders',
        action: 'VIP priority, early festival discounts & personalized credit limits'
      },
      {
        segment: 'Regular',
        count: regularCustomers,
        color: '#10b981',
        criteria: '≥ 5 transactions and visited store within the last 14 days',
        action: 'Maintain engagement with staple combo offers & quick voice checkout'
      },
      {
        segment: 'New',
        count: newCustomers,
        color: '#3b82f6',
        criteria: '≤ 2 transactions and first purchase within the last 14 days',
        action: 'Welcome discount on second visit to convert to repeat customer'
      },
      {
        segment: 'At Risk',
        count: atRiskCustomers,
        color: '#fbbf24',
        criteria: 'Last purchase between 15 and 45 days ago (previously regular)',
        action: 'Send friendly WhatsApp reminder or check if moved to competitor'
      },
      {
        segment: 'Inactive',
        count: inactiveCustomers,
        color: '#94a3b8',
        criteria: 'No purchases recorded for more than 45 consecutive days',
        action: 'Reactivation promotional offer or settle remaining credit balance'
      }
    ];

    res.json({
      summary: {
        totalCustomers,
        activeCustomers,
        newCustomers,
        regularCustomers,
        highValueCustomers,
        atRiskCustomers,
        inactiveCustomers,
        totalCustomerRevenue,
        averageCustomerSpend,
        averageOrderValue,
        averageTxPerCustomer,
        totalCreditOutstanding
      },
      charts: {
        topRevenueCustomers,
        topFrequentCustomers,
        activityOverTime,
        paymentDistribution,
        topProductsPurchased,
        segmentationBreakdown: segmentationRules.map(r => ({
          name: r.segment,
          count: r.count,
          color: r.color
        }))
      },
      segmentationRules
    });
  } catch (err) {
    console.error('Customer analytics error:', err);
    res.status(500).json({ error: 'Failed to calculate customer analytics' });
  }
});

// GET /api/customers/:id/details - Full customer details & purchase history
router.get('/:id/details', async (req, res) => {
  try {
    const customer = await db.customers.findOne({ id: req.params.id, shopId: req.shopId });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get all transactions for this customer
    const sales = await db.sales.find({ 
      shopId: req.shopId, 
      $or: [{ customerId: customer.id }, { customerName: customer.name }]
    }).sort({ timestamp: -1 });

    // Itemized breakdown of products bought
    const productFrequency = {};
    sales.forEach(s => {
      if (s.items && Array.isArray(s.items)) {
        s.items.forEach(it => {
          const name = it.name || 'Item';
          if (!productFrequency[name]) {
            productFrequency[name] = { name, count: 0, totalSpend: 0 };
          }
          productFrequency[name].count += (it.qty || 1);
          productFrequency[name].totalSpend += (it.price || 0) * (it.qty || 1);
        });
      }
    });

    const topPurchasedProducts = Object.values(productFrequency)
      .sort((a, b) => b.totalSpend - a.totalSpend);

    res.json({
      customer,
      sales: sales.map(s => ({
        id: s.id,
        amount: s.amount,
        method: s.method,
        items: s.items,
        timestamp: s.timestamp
      })),
      topPurchasedProducts,
      totalOrders: sales.length,
      calculatedSpent: sales.reduce((sum, s) => sum + s.amount, 0)
    });
  } catch (err) {
    console.error('Customer details error:', err);
    res.status(500).json({ error: 'Failed to retrieve customer details' });
  }
});

// POST /api/customers/seed-demo and /seed-30-demo - Populate sample demo customers + sales + payments
const seedDemoHandler = async (req, res) => {
  try {
    const { products, customers, sales, payments } = generateDemoDataset(req.shopId);

    // 1. Ensure products exist so items are referenceable
    for (const p of products) {
      const exists = await db.products.findOne({ id: p.id, shopId: req.shopId });
      if (!exists) {
        await db.products.create(p);
      }
    }

    // 2. Insert or update 30 customers avoiding duplicate IDs
    let insertedCount = 0;
    for (const c of customers) {
      const existing = await db.customers.findOne({ id: c.id, shopId: req.shopId });
      if (existing) {
        await db.customers.updateOne(
          { id: c.id, shopId: req.shopId },
          { $set: c }
        );
      } else {
        await db.customers.create(c);
        insertedCount++;
      }
    }

    // 3. Populate sales for these customers
    for (const s of sales) {
      const existingSale = await db.sales.findOne({ id: s.id, shopId: req.shopId });
      if (!existingSale) {
        await db.sales.create(s);
      }
    }

    // 4. Populate payments
    if (payments && payments.length > 0) {
      for (const pay of payments) {
        const existingPay = await db.payments.findOne({ id: pay.id, shopId: req.shopId });
        if (existingPay) {
          await db.payments.updateOne({ id: pay.id, shopId: req.shopId }, { $set: pay });
        } else {
          await db.payments.create(pay);
        }
      }
    }

    res.json({
      success: true,
      count: customers.length,
      inserted: insertedCount,
      paymentsCount: payments ? payments.length : 0,
      message: 'Sample demo customer records loaded successfully.'
    });
  } catch (err) {
    console.error('Seed demo error:', err);
    res.status(500).json({ error: 'Failed to seed sample customer records', details: err.message });
  }
};

// POST /api/customers/seed-demo and legacy /seed-30-demo
router.post('/seed-demo', seedDemoHandler);
router.post('/seed-30-demo', seedDemoHandler);

// POST /api/customers - Add customer (No fixed limit)
router.post('/', async (req, res) => {
  try {
    const { name, phone, city, customerType, status, totalCredit } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Customer name is required' });

    const customer = new db.customers({
      id: `CUST-${uuidv4().substring(0, 8)}`,
      shopId: req.shopId,
      name: name.trim(),
      phone: phone ? phone.trim() : '',
      city: city ? city.trim() : 'Local Area',
      totalSpent: 0,
      totalCredit: Number(totalCredit) || 0,
      totalTransactions: 0,
      averageOrderValue: 0,
      customerType: customerType || 'New',
      status: status || 'Active',
      lastVisit: new Date(),
      isDemo: false
    });

    await customer.save();
    res.status(201).json(customer);
  } catch (err) {
    console.error('Add customer error:', err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// PUT /api/customers/:id - Update customer
router.put('/:id', async (req, res) => {
  try {
    const customer = await db.customers.findOne({ id: req.params.id, shopId: req.shopId });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const updates = {};
    if (req.body.name) updates.name = req.body.name.trim();
    if (req.body.phone !== undefined) updates.phone = req.body.phone.trim();
    if (req.body.city !== undefined) updates.city = req.body.city.trim();
    if (req.body.customerType) updates.customerType = req.body.customerType;
    if (req.body.status) updates.status = req.body.status;
    if (req.body.totalCredit !== undefined) updates.totalCredit = Math.max(0, Number(req.body.totalCredit) || 0);

    const updated = await db.customers.findOneAndUpdate(
      { id: req.params.id, shopId: req.shopId },
      { $set: updates },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// PUT /api/customers/:id/pay-credit - Customer pays udhaar
router.put('/:id/pay-credit', async (req, res) => {
  try {
    const customer = await db.customers.findOne({ id: req.params.id, shopId: req.shopId });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const amount = Number(req.body.amount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'Amount must be positive' });

    const newCredit = Math.max(0, (customer.totalCredit || 0) - amount);
    await db.customers.findOneAndUpdate(
      { id: req.params.id, shopId: req.shopId },
      { $set: { totalCredit: newCredit } }
    );

    res.json({ success: true, newCredit, amountReceived: amount });
  } catch (err) {
    console.error('Pay credit error:', err);
    res.status(500).json({ error: 'Failed to record credit payment' });
  }
});

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.customers.findOneAndDelete({ id: req.params.id, shopId: req.shopId });
    if (!result) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ success: true, message: 'Customer removed successfully' });
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

module.exports = router;
