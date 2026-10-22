const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware');
const billing = require('../services/subscriptionBilling');

const router = express.Router();
router.use(authMiddleware);

const wrap = (handler) => (req, res) => Promise.resolve(handler(req, res)).catch(err => {
  if (err instanceof billing.BillingError) return res.status(err.httpStatus).json({ error: err.message });
  console.error(`Subscription route error (${req.method} ${req.originalUrl}):`, err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Subscription request failed' });
});

const publicSubscription = (sub) => sub && ({
  id: sub.id, period: sub.period, amount: sub.amount, status: sub.status,
  provider: sub.provider || 'razorpay', paymentId: sub.razorpayPaymentId || null, method: sub.method || null,
  upiTransactionId: sub.upiTransactionId || null, paidAt: sub.paidAt || null,
  verifiedBy: sub.verifiedBy || null, failureReason: sub.failureReason || null
});

// GET /api/subscription — plan, this month's status and 12-month payment progress
router.get('/', wrap(async (req, res) => {
  res.json(await billing.getStatus(req.shopId));
}));

// POST /api/subscription/checkout — create (or reuse) a Razorpay order for a month
router.post('/checkout', wrap(async (req, res) => {
  const shop = await db.shops.findOne({ id: req.shopId }).lean();
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  res.json(await billing.createCheckout(shop, req.body?.period));
}));

// POST /api/subscription/verify — Razorpay Checkout success handler payload
router.post('/verify', wrap(async (req, res) => {
  const result = await billing.verifyCheckout(req.shopId, req.body);
  res.json({ ...result, subscription: publicSubscription(result.subscription) });
}));

// POST /api/subscription/orders/:orderId/sync — ask Razorpay if the order was paid (e.g. browser closed)
router.post('/orders/:orderId/sync', wrap(async (req, res) => {
  const result = await billing.syncOrder(req.shopId, req.params.orderId);
  res.json({ ...result, subscription: publicSubscription(result.subscription) });
}));

// POST /api/subscription/upi — dynamic UPI QR payable to the platform VPA (reused until paid)
router.post('/upi', wrap(async (req, res) => {
  const shop = await db.shops.findOne({ id: req.shopId }).lean();
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  res.json(await billing.createUpiPayment(shop, req.body?.period));
}));

// POST /api/subscription/upi/:id/reference — shop submits the UTR; the platform admin verifies it
router.post('/upi/:id/reference', wrap(async (req, res) => {
  res.json(await billing.submitUpiReference(req.shopId, req.params.id, req.body?.utr));
}));

module.exports = router;
