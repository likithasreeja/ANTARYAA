const express = require('express');
const { db } = require('../db');
const { adminLogin, adminMiddleware } = require('../adminAuth');
const billing = require('../services/subscriptionBilling');

const router = express.Router();

const wrap = (handler) => (req, res) => Promise.resolve(handler(req, res)).catch(err => {
  if (err instanceof billing.BillingError) return res.status(err.httpStatus).json({ error: err.message });
  console.error(`Admin route error (${req.method} ${req.originalUrl}):`, err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Admin request failed' });
});

const PAYMENT_STATUSES = ['created', 'pending_verification', 'paid', 'failed', 'rejected'];

const paymentView = (p, shop) => ({
  id: p.id, shopId: p.shopId, shopName: shop?.name || '(deleted shop)', ownerName: shop?.ownerName || '', phone: shop?.phone || '',
  period: p.period, amount: p.amount, status: p.status, provider: p.provider || 'razorpay', mode: p.gatewayMode || null,
  upiReference: p.upiReference || null, upiTransactionId: p.upiTransactionId || null, razorpayPaymentId: p.razorpayPaymentId || null,
  verifiedBy: p.verifiedBy || null, failureReason: p.failureReason || null,
  utrSubmittedAt: p.utrSubmittedAt || null, paidAt: p.paidAt || null, createdAt: p.createdAt
});

async function loadPlatformData() {
  const [shops, payments] = await Promise.all([
    db.shops.find({}, { password: 0 }).sort({ createdAt: -1 }).lean(),
    db.subscriptionPayments.find({}).sort({ createdAt: -1 }).lean()
  ]);
  return { shops, payments, shopById: new Map(shops.map(s => [s.id, s])) };
}

function summarize(shops, payments) {
  const currentPeriod = billing.periodOf();
  const paid = payments.filter(p => p.status === 'paid');
  const paidShopsThisPeriod = new Set(paid.filter(p => p.period === currentPeriod).map(p => p.shopId));
  const paidShopCount = shops.filter(s => paidShopsThisPeriod.has(s.id)).length;
  return {
    currentPeriod,
    plan: { amount: billing.billingConfig().price, currency: 'INR' },
    shopCount: shops.length,
    setupCompleteCount: shops.filter(s => s.setupComplete).length,
    paidShopsThisMonth: paidShopCount,
    unpaidShopsThisMonth: shops.length - paidShopCount,
    totalCollected: paid.reduce((s, p) => s + p.amount, 0),
    thisMonthCollected: paid.filter(p => p.paidAt && billing.periodOf(new Date(p.paidAt)) === currentPeriod).reduce((s, p) => s + p.amount, 0),
    paidPaymentCount: paid.length,
    pendingVerificationCount: payments.filter(p => p.status === 'pending_verification').length,
    platformUpi: (({ configured, vpa, payeeName }) => ({ configured, vpa: configured ? vpa : null, payeeName }))(billing.platformUpiConfig())
  };
}

// POST /api/admin/login — env-configured platform admin credentials
router.post('/login', adminLogin);

router.use(adminMiddleware);

router.get('/me', (req, res) => res.json({ username: req.adminUser }));

// GET /api/admin/overview — real counts and totals from shops and subscription payments
router.get('/overview', wrap(async (req, res) => {
  const { shops, payments } = await loadPlatformData();
  res.json(summarize(shops, payments));
}));

// GET /api/admin/shops — every registered shop account is one platform customer
router.get('/shops', wrap(async (req, res) => {
  const { shops, payments } = await loadPlatformData();
  const currentPeriod = billing.periodOf();
  res.json({
    currentPeriod,
    count: shops.length,
    shops: shops.map(s => {
      const own = payments.filter(p => p.shopId === s.id);
      const paid = own.filter(p => p.status === 'paid').sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0));
      const last = paid[0];
      return {
        id: s.id, name: s.name, ownerName: s.ownerName, city: s.city || '', phone: s.phone,
        joinedAt: s.createdAt, setupComplete: Boolean(s.setupComplete),
        currentMonthStatus: paid.some(p => p.period === currentPeriod) ? 'paid'
          : own.some(p => p.period === currentPeriod && p.status === 'pending_verification') ? 'pending_verification' : 'unpaid',
        totalPaid: paid.reduce((sum, p) => sum + p.amount, 0),
        lastPayment: last ? { period: last.period, amount: last.amount, paidAt: last.paidAt, provider: last.provider || 'razorpay' } : null
      };
    })
  });
}));

// GET /api/admin/subscription-payments?status=pending_verification
router.get('/subscription-payments', wrap(async (req, res) => {
  const { shops, payments, shopById } = await loadPlatformData();
  const status = req.query.status;
  if (status && !PAYMENT_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status filter' });
  const list = status ? payments.filter(p => p.status === status) : payments;
  res.json({
    summary: summarize(shops, payments),
    payments: list.slice(0, 500).map(p => paymentView(p, shopById.get(p.shopId)))
  });
}));

// POST /api/admin/subscription-payments/:id/verify — admin confirms money reached the platform UPI account
router.post('/subscription-payments/:id/verify', wrap(async (req, res) => {
  const result = await billing.adminVerifyUpiPayment(req.params.id, {
    amountReceived: req.body?.amountReceived,
    upiTransactionId: req.body?.upiTransactionId,
    adminUser: req.adminUser
  });
  const shop = await db.shops.findOne({ id: result.subscription.shopId }, { password: 0 }).lean();
  res.json({ duplicate: result.duplicate, payment: paymentView(result.subscription, shop) });
}));

// POST /api/admin/subscription-payments/:id/reject
router.post('/subscription-payments/:id/reject', wrap(async (req, res) => {
  const result = await billing.adminRejectUpiPayment(req.params.id, { reason: req.body?.reason, adminUser: req.adminUser });
  const shop = await db.shops.findOne({ id: result.subscription.shopId }, { password: 0 }).lean();
  res.json({ payment: paymentView(result.subscription, shop) });
}));

module.exports = router;
