/**
 * Monthly Antarya subscription billing (shop owner pays Antarya) through Razorpay.
 *
 * A month is marked paid only after Razorpay's own API reports a captured payment
 * for the exact order and amount. The checkout signature, the webhook and the
 * manual "check status" button all go through confirmOrderPayment(), which is
 * idempotent: the same payment can arrive from all three without double counting.
 *
 * Without Razorpay, the shop can pay by a dynamic UPI QR to the platform VPA
 * (PLATFORM_UPI_VPA). There is no bank callback for that, so the record stays
 * pending until the platform admin checks the bank statement and verifies it.
 */
const crypto = require('crypto');
const axios = require('axios');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');

const apiBase = () => (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/$/, '');

function billingConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const price = Math.round(Number(process.env.SUBSCRIPTION_MONTHLY_PRICE || 299));
  return {
    keyId,
    keySecret,
    configured: Boolean(keyId && keySecret),
    mode: keyId.startsWith('rzp_live_') ? 'live' : keyId.startsWith('rzp_test_') ? 'test' : (keyId ? 'custom' : 'unconfigured'),
    planName: process.env.SUBSCRIPTION_PLAN_NAME || 'Antarya Pro – Monthly Review',
    price: Number.isFinite(price) && price > 0 ? price : 299
  };
}

const VPA_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
const UTR_PATTERN = /^[A-Za-z0-9]{6,35}$/;
const OPEN_UPI_STATUSES = ['created', 'pending_verification'];

function platformUpiConfig() {
  const vpa = (process.env.PLATFORM_UPI_VPA || '').trim();
  return {
    vpa,
    payeeName: (process.env.PLATFORM_UPI_NAME || 'Antarya').trim(),
    configured: VPA_PATTERN.test(vpa)
  };
}

class BillingError extends Error {
  constructor(message, httpStatus = 400) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

function razorpay(config) {
  return axios.create({
    baseURL: apiBase(),
    auth: { username: config.keyId, password: config.keySecret },
    timeout: 10000
  });
}

function gatewayMessage(err) {
  return err.response?.data?.error?.description || err.message;
}

function periodOf(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftPeriod(period, months) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function verifyCheckoutSignature(orderId, paymentId, signature, keySecret) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(String(signature), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function getStatus(shopId) {
  const config = billingConfig();
  const current = periodOf();
  const payments = await db.subscriptionPayments.find({ shopId }).sort({ createdAt: -1 }).lean();
  const paid = payments.filter(p => p.status === 'paid');
  const paidPeriods = new Set(paid.map(p => p.period));

  const months = [];
  for (let i = 11; i >= 0; i--) {
    const period = shiftPeriod(current, -i);
    const payment = paid.find(p => p.period === period);
    months.push({
      period,
      status: payment ? 'paid' : 'unpaid',
      amount: payment?.amount ?? null,
      paidAt: payment?.paidAt ?? null,
      paymentId: payment?.razorpayPaymentId ?? null
    });
  }

  let streak = 0;
  for (let p = current; paidPeriods.has(p); p = shiftPeriod(p, -1)) streak += 1;

  const upi = platformUpiConfig();
  const payable = [current, shiftPeriod(current, 1)];
  const openUpi = payments.find(p => p.provider === 'upi_qr' && OPEN_UPI_STATUSES.includes(p.status)
    && payable.includes(p.period) && !paidPeriods.has(p.period));

  return {
    configured: config.configured,
    mode: config.mode,
    upi: { configured: upi.configured, payeeName: upi.payeeName, vpa: upi.configured ? upi.vpa : null },
    openUpiPayment: openUpi ? {
      id: openUpi.id, period: openUpi.period, amount: openUpi.amount, status: openUpi.status,
      upiReference: openUpi.upiReference, upiTransactionId: openUpi.upiTransactionId || null, utrSubmittedAt: openUpi.utrSubmittedAt || null
    } : null,
    plan: { name: config.planName, amount: config.price, currency: 'INR', interval: 'month' },
    currentPeriod: current,
    currentPaid: paidPeriods.has(current),
    nextPeriod: shiftPeriod(current, 1),
    nextPaid: paidPeriods.has(shiftPeriod(current, 1)),
    streakMonths: streak,
    totalPaid: paid.reduce((s, p) => s + p.amount, 0),
    paidMonthsLast12: months.filter(m => m.status === 'paid').length,
    months,
    history: payments.slice(0, 24).map(p => ({
      id: p.id, period: p.period, amount: p.amount, status: p.status, mode: p.gatewayMode,
      provider: p.provider || 'razorpay', upiReference: p.upiReference || null,
      paymentId: p.razorpayPaymentId || null, method: p.method || null, upiTransactionId: p.upiTransactionId || null,
      verifiedBy: p.verifiedBy || null, paidAt: p.paidAt || null, createdAt: p.createdAt, failureReason: p.failureReason || null
    }))
  };
}

async function assertPayablePeriod(shopId, requestedPeriod) {
  const current = periodOf();
  const period = requestedPeriod || current;
  if (![current, shiftPeriod(current, 1)].includes(period)) {
    throw new BillingError('You can pay for the current month or the next month only.');
  }
  const alreadyPaid = await db.subscriptionPayments.findOne({ shopId, period, status: 'paid' });
  if (alreadyPaid) throw new BillingError(`${period} is already paid.`, 409);
  return period;
}

async function createCheckout(shop, requestedPeriod) {
  const config = billingConfig();
  if (!config.configured) {
    throw new BillingError('Online payments are not set up yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to server/.env and restart the server.', 503);
  }
  const period = await assertPayablePeriod(shop.id, requestedPeriod);

  const amountPaise = config.price * 100;
  // Reuse an unpaid order for the same month and price so repeated clicks don't create new orders.
  let sub = await db.subscriptionPayments.findOne({ shopId: shop.id, period, status: 'created', amount: config.price, gatewayMode: config.mode })
    .sort({ createdAt: -1 });

  if (!sub) {
    let order;
    try {
      ({ data: order } = await razorpay(config).post('/orders', {
        amount: amountPaise,
        currency: 'INR',
        receipt: `sub_${period}_${uuidv4().slice(0, 8)}`,
        notes: { kind: 'antarya_subscription', shopId: shop.id, period }
      }));
    } catch (err) {
      console.error('Razorpay order creation failed:', gatewayMessage(err));
      throw new BillingError(`Payment gateway error: ${gatewayMessage(err)}`, 502);
    }
    sub = await db.subscriptionPayments.create({
      id: `SUB-${uuidv4()}`,
      shopId: shop.id,
      period,
      amount: config.price,
      status: 'created',
      gatewayMode: config.mode,
      razorpayOrderId: order.id
    });
  }

  return {
    keyId: config.keyId,
    orderId: sub.razorpayOrderId,
    amount: amountPaise,
    currency: 'INR',
    period,
    mode: config.mode,
    name: 'Antarya',
    description: `${config.planName} – ${period}`,
    prefill: { name: shop.ownerName || shop.name || '', contact: shop.phone ? `+91${String(shop.phone).replace(/\D/g, '').slice(-10)}` : '' }
  };
}

/**
 * Ask Razorpay which payment (if any) settled this order, capture it if only authorized,
 * and mark the month paid. Returns the updated subscription document.
 */
async function confirmOrderPayment(sub, { paymentId, verifiedBy }) {
  const config = billingConfig();
  if (!config.configured) throw new BillingError('Payment gateway keys are not configured on the server.', 503);
  if (sub.status === 'paid') return { subscription: sub, duplicate: true };

  const client = razorpay(config);
  let payment;
  try {
    if (paymentId) {
      ({ data: payment } = await client.get(`/payments/${encodeURIComponent(paymentId)}`));
    } else {
      const { data } = await client.get(`/orders/${encodeURIComponent(sub.razorpayOrderId)}/payments`);
      const items = data.items || [];
      payment = items.find(p => p.status === 'captured') || items.find(p => p.status === 'authorized') || items[0];
    }
  } catch (err) {
    throw new BillingError(`Could not confirm payment with Razorpay: ${gatewayMessage(err)}`, 502);
  }

  if (!payment) return { subscription: sub, pending: true };
  if (payment.order_id !== sub.razorpayOrderId) throw new BillingError('Payment does not belong to this order.', 400);
  if (payment.amount !== sub.amount * 100 || payment.currency !== 'INR') {
    throw new BillingError(`Payment amount mismatch: expected ₹${sub.amount}, Razorpay reports ₹${payment.amount / 100}.`, 400);
  }

  if (payment.status === 'authorized') {
    try {
      ({ data: payment } = await client.post(`/payments/${encodeURIComponent(payment.id)}/capture`, { amount: payment.amount, currency: 'INR' }));
    } catch (err) {
      throw new BillingError(`Payment authorized but capture failed: ${gatewayMessage(err)}`, 502);
    }
  }

  if (payment.status === 'failed') {
    const failed = await db.subscriptionPayments.findOneAndUpdate(
      { id: sub.id, status: 'created' },
      { $set: { failureReason: payment.error_description || 'Payment failed', razorpayPaymentId: payment.id } },
      { returnDocument: 'after' }
    );
    return { subscription: failed || sub, failed: true };
  }
  if (payment.status !== 'captured') return { subscription: sub, pending: true };

  const updated = await db.subscriptionPayments.findOneAndUpdate(
    { id: sub.id, status: { $ne: 'paid' } },
    {
      $set: {
        status: 'paid',
        razorpayPaymentId: payment.id,
        method: payment.method,
        upiTransactionId: payment.acquirer_data?.upi_transaction_id || payment.acquirer_data?.rrn || null,
        verifiedBy,
        paidAt: payment.created_at ? new Date(payment.created_at * 1000) : new Date(),
        failureReason: null
      }
    },
    { returnDocument: 'after' }
  );
  if (!updated) {
    return { subscription: await db.subscriptionPayments.findOne({ id: sub.id }), duplicate: true };
  }
  console.log(`✅ Subscription paid: shop=${sub.shopId} period=${sub.period} order=${sub.razorpayOrderId} payment=${payment.id} via=${verifiedBy}`);
  return { subscription: updated, duplicate: false };
}

async function verifyCheckout(shopId, body) {
  const config = billingConfig();
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body || {};
  if (!orderId || typeof orderId !== 'string') throw new BillingError('Subscription order not found.', 404);
  const sub = await db.subscriptionPayments.findOne({ razorpayOrderId: orderId, shopId });
  if (!sub) throw new BillingError('Subscription order not found.', 404);
  if (!config.configured) throw new BillingError('Payment gateway keys are not configured on the server.', 503);
  if (!verifyCheckoutSignature(orderId, paymentId, signature, config.keySecret)) {
    throw new BillingError('Payment signature is invalid. The payment was not recorded.', 400);
  }
  return confirmOrderPayment(sub, { paymentId, verifiedBy: 'checkout_signature' });
}

async function syncOrder(shopId, orderId) {
  const sub = await db.subscriptionPayments.findOne({ razorpayOrderId: orderId, shopId });
  if (!sub) throw new BillingError('Subscription order not found.', 404);
  return confirmOrderPayment(sub, { verifiedBy: 'api_sync' });
}

/** Called from the signed Razorpay webhook. Returns null when the order is not a subscription. */
async function handleSubscriptionWebhook({ event, orderId, paymentId }) {
  const sub = await db.subscriptionPayments.findOne({ razorpayOrderId: orderId });
  if (!sub) return null;
  if (!['payment.captured', 'order.paid', 'payment.authorized', 'payment.failed'].includes(event)) {
    return { body: { success: true, message: `Subscription event ${event} acknowledged` } };
  }
  try {
    const result = await confirmOrderPayment(sub, { paymentId, verifiedBy: 'webhook' });
    return { body: { success: true, status: result.subscription.status, duplicate: Boolean(result.duplicate) } };
  } catch (err) {
    console.error(`Subscription webhook for ${orderId} failed:`, err.message);
    // 5xx makes Razorpay retry later; 4xx means the payload itself does not match our order.
    return { httpStatus: err.httpStatus >= 500 ? 502 : 400, body: { error: err.message } };
  }
}

// ─── Platform UPI QR (shop → platform VPA, verified by the platform admin) ───

function buildPlatformUpiIntent({ vpa, payeeName, amount, reference, period }) {
  const note = encodeURIComponent(`Antarya subscription ${period}`);
  return `upi://pay?pa=${vpa}&pn=${encodeURIComponent(payeeName)}&am=${Number(amount).toFixed(2)}&tr=${reference}&tn=${note}&cu=INR`;
}

async function upiPaymentView(sub, upi) {
  const upiIntent = buildPlatformUpiIntent({
    vpa: sub.payeeVpa, payeeName: upi.payeeName, amount: sub.amount, reference: sub.upiReference, period: sub.period
  });
  const qrDataUrl = await qrcode.toDataURL(upiIntent, { width: 280, margin: 1, errorCorrectionLevel: 'M' });
  return {
    id: sub.id, period: sub.period, amount: sub.amount, currency: 'INR', status: sub.status,
    payeeVpa: sub.payeeVpa, payeeName: upi.payeeName, upiReference: sub.upiReference,
    upiTransactionId: sub.upiTransactionId || null, utrSubmittedAt: sub.utrSubmittedAt || null,
    upiIntent, qrDataUrl
  };
}

/** Create (or reuse) an open UPI QR request for a month. The amount always comes from the plan price. */
async function createUpiPayment(shop, requestedPeriod) {
  const upi = platformUpiConfig();
  if (!upi.configured) {
    throw new BillingError('UPI QR payments to Antarya are not set up yet. Add PLATFORM_UPI_VPA (and PLATFORM_UPI_NAME) to server/.env and restart the server.', 503);
  }
  const { price } = billingConfig();
  const period = await assertPayablePeriod(shop.id, requestedPeriod);

  let sub = await db.subscriptionPayments.findOne({
    shopId: shop.id, period, provider: 'upi_qr', status: { $in: OPEN_UPI_STATUSES }, amount: price, payeeVpa: upi.vpa
  }).sort({ createdAt: -1 });

  if (!sub) {
    sub = await db.subscriptionPayments.create({
      id: `SUB-${uuidv4()}`,
      shopId: shop.id,
      period,
      amount: price,
      status: 'created',
      provider: 'upi_qr',
      gatewayMode: 'upi_qr',
      method: 'upi',
      payeeVpa: upi.vpa,
      upiReference: `ANTSUB${uuidv4().replace(/-/g, '').slice(0, 14).toUpperCase()}`
    });
  }
  return upiPaymentView(sub, upi);
}

async function assertUtrUnused(utr, subId) {
  const reused = await db.subscriptionPayments.findOne({ upiTransactionId: utr, id: { $ne: subId } }).lean();
  if (reused) throw new BillingError('This UPI transaction reference is already linked to another subscription payment.', 409);
}

/** Shop tells us the UTR / UPI ref it paid with. This never marks the month paid. */
async function submitUpiReference(shopId, subId, rawUtr) {
  const utr = String(rawUtr || '').replace(/\s+/g, '');
  if (!UTR_PATTERN.test(utr)) {
    throw new BillingError('Enter the UPI transaction reference (UTR) from your UPI app: 6–35 letters or digits.');
  }
  const sub = await db.subscriptionPayments.findOne({ id: subId, shopId, provider: 'upi_qr' }).lean();
  if (!sub) throw new BillingError('UPI payment request not found.', 404);
  if (sub.status === 'paid') throw new BillingError(`${sub.period} is already paid.`, 409);
  if (!OPEN_UPI_STATUSES.includes(sub.status)) {
    throw new BillingError('This payment request was closed. Generate a new QR to pay.', 409);
  }
  await assertUtrUnused(utr, sub.id);

  const updated = await db.subscriptionPayments.findOneAndUpdate(
    { id: sub.id, status: { $in: OPEN_UPI_STATUSES } },
    { $set: { upiTransactionId: utr, status: 'pending_verification', utrSubmittedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new BillingError('This payment request is no longer open.', 409);
  return upiPaymentView(updated, platformUpiConfig());
}

/**
 * Platform admin confirms the money reached the platform account. Idempotent: verifying
 * an already-paid record returns duplicate=true and changes nothing.
 */
async function adminVerifyUpiPayment(subId, { amountReceived, upiTransactionId, adminUser }) {
  const sub = await db.subscriptionPayments.findOne({ id: subId }).lean();
  if (!sub) throw new BillingError('Subscription payment not found.', 404);
  if (sub.provider !== 'upi_qr') throw new BillingError('Only UPI QR payments are verified manually; Razorpay payments are confirmed automatically.');
  if (sub.status === 'paid') return { subscription: sub, duplicate: true };
  if (!OPEN_UPI_STATUSES.includes(sub.status)) throw new BillingError(`This payment is ${sub.status} and cannot be verified.`, 409);

  if (Number(amountReceived) !== sub.amount) {
    throw new BillingError(`Amount received must equal the plan amount of ₹${sub.amount}.`);
  }
  const utr = String(upiTransactionId || sub.upiTransactionId || '').replace(/\s+/g, '');
  if (!UTR_PATTERN.test(utr)) throw new BillingError('A valid UPI transaction reference (UTR) from the bank statement is required.');
  await assertUtrUnused(utr, sub.id);

  const otherPaid = await db.subscriptionPayments.findOne({ shopId: sub.shopId, period: sub.period, status: 'paid' }).lean();
  if (otherPaid) throw new BillingError(`${sub.period} is already paid for this shop (${otherPaid.id}). Reject this request instead.`, 409);

  const updated = await db.subscriptionPayments.findOneAndUpdate(
    { id: sub.id, status: { $in: OPEN_UPI_STATUSES } },
    { $set: { status: 'paid', upiTransactionId: utr, method: 'upi', verifiedBy: `admin:${adminUser}`, paidAt: new Date(), failureReason: null } },
    { returnDocument: 'after' }
  ).lean();
  if (!updated) {
    const latest = await db.subscriptionPayments.findOne({ id: sub.id }).lean();
    if (latest?.status === 'paid') return { subscription: latest, duplicate: true };
    throw new BillingError('This payment changed while verifying. Refresh and try again.', 409);
  }
  console.log(`✅ Subscription paid (UPI QR): shop=${sub.shopId} period=${sub.period} ref=${sub.upiReference} utr=${utr} via=admin:${adminUser}`);
  return { subscription: updated, duplicate: false };
}

async function adminRejectUpiPayment(subId, { reason, adminUser }) {
  const updated = await db.subscriptionPayments.findOneAndUpdate(
    { id: subId, provider: 'upi_qr', status: { $in: OPEN_UPI_STATUSES } },
    { $set: { status: 'rejected', failureReason: String(reason || 'Payment not found in bank statement').slice(0, 200), verifiedBy: `admin:${adminUser}` } },
    { returnDocument: 'after' }
  ).lean();
  if (updated) return { subscription: updated };
  const sub = await db.subscriptionPayments.findOne({ id: subId }).lean();
  if (!sub) throw new BillingError('Subscription payment not found.', 404);
  throw new BillingError(`This payment is ${sub.status} and cannot be rejected.`, 409);
}

module.exports = {
  BillingError,
  billingConfig,
  platformUpiConfig,
  getStatus,
  createCheckout,
  verifyCheckout,
  syncOrder,
  handleSubscriptionWebhook,
  createUpiPayment,
  submitUpiReference,
  adminVerifyUpiPayment,
  adminRejectUpiPayment,
  buildPlatformUpiIntent,
  verifyCheckoutSignature,
  periodOf,
  shiftPeriod
};
