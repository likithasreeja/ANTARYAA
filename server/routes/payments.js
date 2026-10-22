const express = require('express');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const axios = require('axios');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware } = require('../middleware');
const { handleSubscriptionWebhook } = require('../services/subscriptionBilling');

const router = express.Router();

// Real-time Event Broadcaster for Server-Sent Events (SSE)
const paymentEmitter = new EventEmitter();
paymentEmitter.setMaxListeners(300);

// Helper: Merchant Payment Provider Configuration
const getGatewayConfig = () => {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  const merchantVpa = process.env.UPI_MERCHANT_VPA || 'payments@antarya';
  const merchantName = process.env.UPI_MERCHANT_NAME || 'Antarya Kirana';
  const isConfigured = Boolean(keyId && keySecret);
  const mode = keyId.startsWith('rzp_test_') 
    ? 'test' 
    : (keyId.startsWith('rzp_live_') ? 'live' : (isConfigured ? 'custom' : 'unconfigured'));

  return {
    provider: 'razorpay',
    keyId,
    keySecret,
    webhookSecret,
    merchantVpa,
    merchantName,
    isConfigured,
    mode,
    // Test events mark payments paid without money moving: opt-in only, never with live keys.
    testEventsEnabled: process.env.ENABLE_PAYMENT_TEST_EVENTS === 'true' && mode !== 'live'
  };
};

const getBasicAuthHeader = (keyId, keySecret) => {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
};

// ============================================================================
// 1. PUBLIC ROUTES (Accessible without JWT for Webhooks & Real-time Listeners)
// ============================================================================

// GET /api/payments/provider-status - Gateway configuration and operational status
router.get('/provider-status', (req, res) => {
  const config = getGatewayConfig();
  res.json({
    provider: config.provider,
    isConfigured: config.isConfigured,
    mode: config.mode,
    merchantVpa: config.merchantVpa,
    merchantName: config.merchantName,
    features: {
      dynamicUpiQr: true,
      webhooks: true,
      signatureVerification: Boolean(config.webhookSecret),
      realTimeTracking: true,
      testEvents: config.testEventsEnabled
    }
  });
});

// GET /api/payments/:id/live-status - Server-Sent Events (SSE) Real-Time Status Stream
router.get('/:id/live-status', async (req, res) => {
  const { id } = req.params;

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  try {
    const payment = await db.payments.findOne({
      $or: [{ id }, { referenceNo: id }]
    });

    if (!payment) {
      res.write(`data: ${JSON.stringify({ error: 'Payment not found', status: 'NotFound' })}\n\n`);
      return res.end();
    }

    // Immediately push current state
    res.write(`data: ${JSON.stringify(payment)}\n\n`);

    // Listener for real-time status updates
    const onPaymentUpdate = (updatedPayment) => {
      if (updatedPayment.id === payment.id || updatedPayment.referenceNo === payment.referenceNo) {
        res.write(`data: ${JSON.stringify(updatedPayment)}\n\n`);
        if (['Successful', 'Paid', 'Failed', 'Cancelled'].includes(updatedPayment.status)) {
          // Keep open briefly for client confirmation, then finish or let client disconnect
        }
      }
    };

    const eventKey = `payment_updated_${payment.id}`;
    const refKey = `payment_updated_${payment.referenceNo}`;

    paymentEmitter.on(eventKey, onPaymentUpdate);
    paymentEmitter.on(refKey, onPaymentUpdate);

    // Keep connection alive with heartbeat comments every 15 seconds
    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      paymentEmitter.removeListener(eventKey, onPaymentUpdate);
      paymentEmitter.removeListener(refKey, onPaymentUpdate);
      res.end();
    });
  } catch (err) {
    console.error('SSE Error:', err);
    res.write(`data: ${JSON.stringify({ error: 'Internal SSE error' })}\n\n`);
    res.end();
  }
});

const isRealCustomer = (customerId) => Boolean(customerId && customerId !== 'walk-in' && !customerId.startsWith('CUST-GUEST-'));

// Helper: Record the non-Khata part of a successful counter payment as a sale (at most once per payment)
async function recordSaleForPayment(payment, paidAmount, creditApplied) {
  if (payment.purpose === 'checkout') return null;
  const saleAmount = Math.round((Number(paidAmount) - (creditApplied || 0)) * 100) / 100;
  if (!(saleAmount > 0)) return null;

  const saleId = uuidv4();
  const claimed = await db.payments.findOneAndUpdate(
    { id: payment.id, saleId: null },
    { $set: { saleId } },
    { returnDocument: 'after' }
  );
  if (!claimed) return null;

  const method = payment.paymentMethod === 'cash' ? 'cash' : 'upi';
  await new db.sales({
    id: saleId,
    shopId: payment.shopId,
    customerId: isRealCustomer(payment.customerId) ? payment.customerId : undefined,
    customerName: payment.customerName,
    amount: saleAmount,
    method,
    items: [{ productId: `payment:${payment.id}`, name: `Counter payment (${payment.referenceNo})`, qty: 1, price: saleAmount }],
    timestamp: new Date()
  }).save();

  return claimed;
}

// Helper: Apply verified payment success to database & customer ledger
async function applyPaymentSuccess({ payment, paidAmount, paymentId, utr, method, eventId, updatedBy, note }) {
  // 1. Idempotency Check: Don't process twice if already Successful / Paid
  if (payment.status === 'Successful' || payment.status === 'Paid') {
    return { payment, duplicate: true };
  }

  const oldStatus = payment.status;
  const verifiedPaidAmount = Number(paidAmount) || payment.amount;

  const auditEntry = {
    status: 'Successful',
    updatedBy: updatedBy || 'Merchant Payment Provider (Verified)',
    note: note || `Payment of ₹${verifiedPaidAmount} verified by payment provider. UTR: ${utr || paymentId || 'N/A'}`,
    timestamp: new Date()
  };

  let updatedPayment = await db.payments.findOneAndUpdate(
    { id: payment.id },
    {
      $set: {
        status: 'Successful',
        amountPaid: verifiedPaidAmount,
        balanceRemaining: 0,
        gatewayPaymentId: paymentId || payment.gatewayPaymentId,
        upiTransactionRef: utr || payment.upiTransactionRef || paymentId,
        paymentMethod: method || payment.paymentMethod || 'upi',
        verifiedAt: new Date(),
        webhookReceivedAt: new Date(),
        webhookEventId: eventId || payment.webhookEventId,
        amountVerified: true
      },
      $push: { auditTrail: auditEntry }
    },
    { new: true }
  );

  // 2. Automatically update Customer Khata/Credit and spending ledger
  let creditApplied = 0;
  if (isRealCustomer(payment.customerId)) {
    try {
      const customer = await db.customers.findOne({ id: payment.customerId });
      if (customer) {
        const creditPayment = Math.min(customer.totalCredit || 0, verifiedPaidAmount);
        creditApplied = creditPayment;
        const newCredit = Math.max(0, (customer.totalCredit || 0) - creditPayment);
        const newAmountPaidCust = (customer.amountPaid || 0) + verifiedPaidAmount;
        const newTotalSpent = (customer.totalSpent || 0) + (customer.totalCredit > 0 ? 0 : verifiedPaidAmount);
        const paymentStatus = newCredit === 0 ? 'Paid' : 'Partially Paid';

        await db.customers.findOneAndUpdate(
          { id: customer.id },
          {
            $set: {
              totalCredit: newCredit,
              amountPaid: newAmountPaidCust,
              totalSpent: newTotalSpent,
              paymentStatus,
              lastVisit: new Date()
            }
          }
        );
      }
    } catch (custErr) {
      console.error('Failed to update customer Khata ledger on payment success:', custErr);
    }
  }

  updatedPayment = (await recordSaleForPayment(updatedPayment, verifiedPaidAmount, creditApplied)) || updatedPayment;

  // 3. Emit real-time updates for SSE listeners and connected clients
  paymentEmitter.emit(`payment_updated_${updatedPayment.id}`, updatedPayment);
  paymentEmitter.emit(`payment_updated_${updatedPayment.referenceNo}`, updatedPayment);
  paymentEmitter.emit('payment_broadcast', updatedPayment);

  return { payment: updatedPayment, duplicate: false };
}

// Helper: Apply payment failure to database
async function applyPaymentFailure({ payment, reason, updatedBy, eventId }) {
  const auditEntry = {
    status: 'Failed',
    updatedBy: updatedBy || 'Merchant Payment Provider',
    note: `Payment failed: ${reason || 'Transaction failed or bank timed out'}`,
    timestamp: new Date()
  };

  const updatedPayment = await db.payments.findOneAndUpdate(
    { id: payment.id },
    {
      $set: {
        status: 'Failed',
        failureReason: reason,
        webhookReceivedAt: new Date(),
        webhookEventId: eventId || payment.webhookEventId
      },
      $push: { auditTrail: auditEntry }
    },
    { new: true }
  );

  paymentEmitter.emit(`payment_updated_${updatedPayment.id}`, updatedPayment);
  paymentEmitter.emit(`payment_updated_${updatedPayment.referenceNo}`, updatedPayment);
  paymentEmitter.emit('payment_broadcast', updatedPayment);

  return updatedPayment;
}

// POST /api/payments/webhook - Verified Server-Side Webhook
router.post('/webhook', async (req, res) => {
  try {
    const config = getGatewayConfig();
    const signature = req.headers['x-razorpay-signature'] || req.headers['x-signature'];

    // 1. Validate Webhook Signature (unsigned webhooks could mark unpaid bills as paid)
    if (!config.webhookSecret) {
      console.warn('⚠️ Webhook rejected: RAZORPAY_WEBHOOK_SECRET is not configured.');
      return res.status(503).json({ error: 'Webhook secret not configured on server' });
    }
    {
      const payloadString = req.rawBody || JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', config.webhookSecret)
        .update(payloadString)
        .digest('hex');

      if (!signature) {
        console.warn('⚠️ Webhook received without signature while RAZORPAY_WEBHOOK_SECRET is set.');
        return res.status(400).json({ error: 'Missing webhook signature header' });
      }

      // Timing-safe comparison to prevent timing attacks
      const sigBuf = Buffer.from(signature, 'utf8');
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        console.error('❌ Webhook HMAC SHA-256 signature verification failed!');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
      console.log('✅ Webhook HMAC SHA-256 signature verified successfully!');
    }

    const event = req.body.event;
    const eventId = req.body.event_id || req.headers['x-razorpay-event-id'] || `EVT-${Date.now()}`;
    const payload = req.body.payload || {};

    // 2. Identify the payment entity from payload
    const paymentEntity = payload.payment?.entity || payload.payment || {};
    const orderEntity = payload.order?.entity || payload.order || {};
    const qrEntity = payload.qr_code?.entity || payload.qr_code || {};

    const referenceNo = paymentEntity.notes?.referenceNo 
      || orderEntity.receipt 
      || qrEntity.notes?.referenceNo 
      || req.body.referenceNo;

    const appPaymentId = paymentEntity.notes?.paymentId 
      || paymentEntity.notes?.id 
      || req.body.paymentId;

    const orderId = paymentEntity.order_id || orderEntity.id;
    const qrId = qrEntity.id;
    const providerPaymentId = paymentEntity.id;

    // Monthly subscription orders: re-verified against the Razorpay API before being marked paid
    if (orderId) {
      const subscriptionResult = await handleSubscriptionWebhook({ event, orderId, paymentId: providerPaymentId, paymentEntity });
      if (subscriptionResult) {
        return res.status(subscriptionResult.httpStatus || 200).json(subscriptionResult.body);
      }
    }

    // Look up existing payment record in DB
    const searchConditions = [];
    if (referenceNo) searchConditions.push({ referenceNo });
    if (appPaymentId) searchConditions.push({ id: appPaymentId });
    if (orderId) searchConditions.push({ gatewayOrderId: orderId });
    if (qrId) searchConditions.push({ gatewayQrCodeId: qrId });
    if (providerPaymentId) searchConditions.push({ gatewayPaymentId: providerPaymentId });

    if (searchConditions.length === 0) {
      return res.status(400).json({ error: 'Unable to identify payment reference in webhook payload' });
    }

    const existingPayment = await db.payments.findOne({ $or: searchConditions });

    if (!existingPayment) {
      console.warn(`Webhook received for unknown payment reference: ${referenceNo || orderId}`);
      return res.status(404).json({ error: 'Payment record not found for reference' });
    }

    // 3. Handle Supported Webhook Event Types
    if (event === 'payment.captured' || event === 'order.paid' || event === 'qr_code.credited' || req.body.status === 'SUCCESS' || req.body.status === 'PAID') {
      const amountInPaise = paymentEntity.amount !== undefined ? paymentEntity.amount : (Number(req.body.amount) * 100);
      const paidAmount = amountInPaise !== undefined ? (amountInPaise / 100) : existingPayment.amount;

      // Amount verification: prevent underpaid transactions from being marked successful
      if (Math.abs(paidAmount - existingPayment.amount) > 0.5) {
        console.error(`⚠️ Webhook amount mismatch! Expected ₹${existingPayment.amount}, received ₹${paidAmount}`);
        await db.payments.updateOne(
          { id: existingPayment.id },
          {
            $push: {
              auditTrail: {
                status: 'Amount Mismatch Flagged',
                updatedBy: 'Automated Webhook Monitor',
                note: `SECURITY ALERT: Expected ₹${existingPayment.amount} but provider reported ₹${paidAmount}. Payment held for review.`,
                timestamp: new Date()
              }
            }
          }
        );
        return res.status(400).json({ error: 'Payment amount mismatch against original payment request' });
      }

      const utr = paymentEntity.acquirer_data?.upi_transaction_id 
        || paymentEntity.acquirer_data?.bank_transaction_id 
        || req.body.upiTransactionRef 
        || providerPaymentId;

      const result = await applyPaymentSuccess({
        payment: existingPayment,
        paidAmount,
        paymentId: providerPaymentId || existingPayment.gatewayPaymentId,
        utr,
        method: paymentEntity.method || 'upi',
        eventId,
        updatedBy: 'Razorpay Verified Webhook',
        note: `Payment confirmed via verified webhook. Provider ID: ${providerPaymentId || 'N/A'}, UTR: ${utr || 'N/A'}`
      });

      return res.json({ 
        success: true, 
        message: result.duplicate ? 'Duplicate webhook acknowledged (idempotent)' : 'Payment verified and recorded',
        payment: result.payment 
      });
    } else if (event === 'payment.failed' || req.body.status === 'FAILED') {
      const errorReason = paymentEntity.error_description || req.body.reason || 'Payment failed at bank / gateway';
      const updated = await applyPaymentFailure({
        payment: existingPayment,
        reason: errorReason,
        updatedBy: 'Razorpay Webhook',
        eventId
      });

      return res.json({ success: true, message: 'Payment failure recorded', payment: updated });
    }

    res.json({ success: true, message: `Webhook event ${event} acknowledged` });
  } catch (err) {
    console.error('Webhook processing exception:', err);
    res.status(500).json({ error: 'Webhook processing failed', details: err.message });
  }
});

// POST /api/payments/webhook/test-event - Test/Sandbox Webhook Event Simulator (Strictly for testing & sandbox mode)
router.post('/webhook/test-event', async (req, res) => {
  try {
    const config = getGatewayConfig();
    if (!config.testEventsEnabled) {
      return res.status(403).json({ error: 'Payment test events are disabled. Payments are confirmed only by the payment gateway or by the shop owner.' });
    }
    const { referenceNo, paymentId, amount, status, utr, simulateSignature, failureReason, eventId } = req.body;

    if (!referenceNo) {
      return res.status(400).json({ error: 'referenceNo is required' });
    }

    const payment = await db.payments.findOne({ referenceNo });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found for provided reference' });
    }

    // Verify signature if simulateSignature flag is passed and secret is configured
    if (simulateSignature && config.webhookSecret) {
      const signatureHeader = req.headers['x-razorpay-signature'];
      const raw = req.rawBody || JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', config.webhookSecret).update(raw).digest('hex');
      if (signatureHeader !== expected) {
        return res.status(400).json({ error: 'Simulated webhook signature mismatch' });
      }
    }

    const testEventId = eventId || `TEST-EVT-${uuidv4().substring(0, 8)}`;

    if (status === 'Failed') {
      const failed = await applyPaymentFailure({
        payment,
        reason: failureReason || 'Bank payment declined in test simulation',
        updatedBy: 'Payment Gateway Sandbox Simulator',
        eventId: testEventId
      });
      return res.json({ success: true, status: 'Failed', payment: failed });
    }

    // Amount verification check
    const paidAmt = Number(amount) !== undefined && !isNaN(Number(amount)) ? Number(amount) : payment.amount;
    if (Math.abs(paidAmt - payment.amount) > 0.5) {
      await db.payments.updateOne(
        { id: payment.id },
        {
          $push: {
            auditTrail: {
              status: 'Amount Mismatch Flagged',
              updatedBy: 'Payment Gateway Sandbox Simulator',
              note: `SECURITY ALERT: Expected ₹${payment.amount} but provider reported ₹${paidAmt}. Payment held for review.`,
              timestamp: new Date()
            }
          }
        }
      );
      return res.status(400).json({ error: 'Payment amount mismatch against original payment request' });
    }

    const provPayId = paymentId || `pay_test_${uuidv4().substring(0, 10)}`;
    const provUtr = utr || `UTR-TEST-${Math.floor(100000000000 + Math.random() * 900000000000)}`;

    const result = await applyPaymentSuccess({
      payment,
      paidAmount: paidAmt,
      paymentId: provPayId,
      utr: provUtr,
      method: 'upi',
      eventId: testEventId,
      updatedBy: 'Payment Gateway Sandbox Test Confirmation',
      note: `Verified test webhook received. Provider ID: ${provPayId}, Bank UTR: ${provUtr}`
    });

    res.json({
      success: true,
      duplicate: result.duplicate,
      status: result.payment.status,
      payment: result.payment
    });
  } catch (err) {
    console.error('Test webhook error:', err);
    res.status(500).json({ error: 'Test webhook failed', details: err.message });
  }
});

// ============================================================================
// 2. AUTHENTICATED ROUTES (Protected by authMiddleware)
// ============================================================================
router.use(authMiddleware);

// GET /api/payments - List payments with comprehensive filters (Date, Customer, Status, Amount, Search, Pagination)
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      customerId, 
      search, 
      startDate, 
      endDate, 
      minAmount, 
      maxAmount, 
      limit, 
      page,
      paginated 
    } = req.query;

    const filter = { shopId: req.shopId };

    // 1. Status Filter
    if (status && status !== 'all') {
      if (status === 'Successful' || status === 'Paid') {
        filter.status = { $in: ['Successful', 'Paid'] };
      } else {
        filter.status = status;
      }
    }

    // 2. Customer Filter
    if (customerId && customerId !== 'all') {
      if (customerId === 'walk-in') {
        filter.$or = [
          { customerId: 'walk-in' },
          { customerId: { $regex: '^CUST-GUEST-' } },
          { customerName: 'Walk-in Customer' },
          { customerName: 'Counter Customer' }
        ];
      } else {
        filter.customerId = customerId;
      }
    }

    // 3. Date Range Filter
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.timestamp.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = end;
      }
    }

    // 4. Amount Range Filter
    if (minAmount !== undefined || maxAmount !== undefined) {
      filter.amount = {};
      if (minAmount !== undefined && minAmount !== '') {
        filter.amount.$gte = Number(minAmount);
      }
      if (maxAmount !== undefined && maxAmount !== '') {
        filter.amount.$lte = Number(maxAmount);
      }
    }

    // 5. Search Filter
    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { referenceNo: { $regex: search, $options: 'i' } },
        { upiTransactionRef: { $regex: search, $options: 'i' } },
        { gatewayPaymentId: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate aggregated metrics for this filter set
    const allMatching = await db.payments.find(filter);
    const totalCount = allMatching.length;
    const successfulPayments = allMatching.filter(p => p.status === 'Successful' || p.status === 'Paid');
    const totalSuccessfulPayments = successfulPayments.length;
    const totalSuccessfulAmount = successfulPayments.reduce((sum, p) => sum + (p.amountPaid || p.amount || 0), 0);
    const totalPendingAmount = allMatching
      .filter(p => p.status === 'Pending')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // Set informative response headers
    res.setHeader('X-Total-Count', totalCount);
    res.setHeader('X-Total-Successful', totalSuccessfulPayments);
    res.setHeader('X-Total-Successful-Amount', totalSuccessfulAmount);

    let query = db.payments.find(filter).sort({ timestamp: -1 });

    // Handle pagination if requested
    if (paginated === 'true' || (page && limit)) {
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const payments = await query.skip((pageNum - 1) * limitNum).limit(limitNum);

      return res.json({
        payments,
        totalCount,
        totalSuccessfulPayments,
        totalSuccessfulAmount,
        totalPendingAmount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum)
      });
    }

    if (limit) {
      query = query.limit(Number(limit));
    }

    const payments = await query;
    res.json(payments);
  } catch (err) {
    console.error('Get payments error:', err);
    res.status(500).json({ error: 'Failed to retrieve payments' });
  }
});

// GET /api/payments/summary - Financial KPIs & Reconciliation
router.get('/summary', async (req, res) => {
  try {
    const payments = await db.payments.find({ shopId: req.shopId });
    const customers = await db.customers.find({ shopId: req.shopId });
    const sales = await db.sales.find({ shopId: req.shopId });

    const totalSalesRevenue = sales.reduce((sum, s) => sum + (s.amount || 0), 0);
    const totalOrders = sales.length;
    const averageOrderValue = totalOrders > 0 ? Math.round(totalSalesRevenue / totalOrders) : 0;

    const successfulPayments = payments.filter(p => p.status === 'Successful' || p.status === 'Paid');
    const partiallyPaidPayments = payments.filter(p => p.status === 'Partially Paid');
    const pendingPayments = payments.filter(p => p.status === 'Pending');
    const failedPayments = payments.filter(p => p.status === 'Failed');
    const cancelledPayments = payments.filter(p => p.status === 'Cancelled');

    const totalMoneyCollected = successfulPayments.reduce((sum, p) => sum + (p.amountPaid || p.amount || 0), 0)
      + partiallyPaidPayments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);

    const totalPendingAmount = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
      + partiallyPaidPayments.reduce((sum, p) => sum + (p.balanceRemaining !== undefined ? p.balanceRemaining : (p.amount - (p.amountPaid || 0))), 0);
    const totalOutstandingCustomerBalances = customers.reduce((sum, c) => sum + (c.totalCredit || 0), 0);

    res.json({
      totalSalesRevenue,
      totalMoneyCollected,
      totalPendingAmount,
      totalOutstandingCustomerBalances,
      totalSuccessfulPaymentsCount: successfulPayments.length,
      totalOrders,
      averageOrderValue,
      counts: {
        total: payments.length,
        successful: successfulPayments.length,
        paid: successfulPayments.length,
        partiallyPaid: partiallyPaidPayments.length,
        pending: pendingPayments.length,
        failed: failedPayments.length,
        cancelled: cancelledPayments.length
      },
      recentPayments: payments.slice(0, 6)
    });
  } catch (err) {
    console.error('Payment summary error:', err);
    res.status(500).json({ error: 'Failed to generate payment summary' });
  }
});

// GET /api/payments/:id - Get single payment record with audit trail
router.get('/:id', async (req, res) => {
  try {
    const payment = await db.payments.findOne({
      $or: [{ id: req.params.id }, { referenceNo: req.params.id }],
      shopId: req.shopId
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    res.json(payment);
  } catch (err) {
    console.error('Get payment details error:', err);
    res.status(500).json({ error: 'Failed to retrieve payment details' });
  }
});

// POST /api/payments - Create Genuine Dynamic UPI Payment Request
router.post('/', async (req, res) => {
  try {
    const { customerId, customerName, customerPhone, amount, paymentMethod, saleId, invoiceNumber, notes, purpose } = req.body;

    const numAmount = Math.round(Number(amount));
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'A valid payment amount greater than ₹0 is required' });
    }

    // Generate unique verifiable payment reference
    const timestampCode = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const referenceNo = `ANT-PAY-${timestampCode}-${randomSuffix}`;
    const paymentId = `PAY-${referenceNo}`;

    // Verify Customer linkage
    let matchedCustomer = null;
    if (customerId && customerId !== 'walk-in') {
      matchedCustomer = await db.customers.findOne({ id: customerId, shopId: req.shopId });
    }
    if (!matchedCustomer && customerName && customerName !== 'Walk-in Customer' && customerName !== 'Counter Customer') {
      matchedCustomer = await db.customers.findOne({ name: customerName, shopId: req.shopId });
    }

    const custId = matchedCustomer ? matchedCustomer.id : (customerId || 'walk-in');
    const custName = matchedCustomer ? matchedCustomer.name : (customerName || 'Walk-in Customer');
    const custPhone = matchedCustomer ? matchedCustomer.phone : (customerPhone || '');

    const gatewayConfig = getGatewayConfig();

    // 1. Generate Standard Dynamic UPI Intent URL
    // Format: upi://pay?pa=VPA&pn=NAME&am=AMOUNT&tr=REF&tn=NOTE&cu=INR
    const encodedMerchantName = encodeURIComponent(gatewayConfig.merchantName);
    const noteText = encodeURIComponent(`Bill ${referenceNo}`);
    const standardUpiIntent = `upi://pay?pa=${gatewayConfig.merchantVpa}&pn=${encodedMerchantName}&am=${numAmount}&tr=${referenceNo}&tn=${noteText}&cu=INR`;

    // 2. Generate Crisp Base64 QR Code Data URL
    let qrDataUrl = '';
    try {
      qrDataUrl = await qrcode.toDataURL(standardUpiIntent, {
        width: 320,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (qrErr) {
      console.error('Failed to generate QR data URL:', qrErr);
    }

    let gatewayOrderId = null;
    let gatewayQrCodeId = null;
    let gatewayQrImageUrl = null;
    let gatewayProvider = gatewayConfig.isConfigured ? 'razorpay' : 'upi_direct';
    let auditNote = `Payment request created for ₹${numAmount} via Dynamic UPI QR. Ref: ${referenceNo}`;

    // 3. If Razorpay Gateway is configured, create Razorpay Order & Dynamic UPI QR
    if (gatewayConfig.isConfigured) {
      try {
        const authHeader = getBasicAuthHeader(gatewayConfig.keyId, gatewayConfig.keySecret);
        
        // Create Razorpay Order
        const orderRes = await axios.post(
          'https://api.razorpay.com/v1/orders',
          {
            amount: numAmount * 100, // Razorpay takes paise
            currency: 'INR',
            receipt: referenceNo,
            notes: {
              referenceNo,
              shopId: req.shopId,
              customerId: custId,
              customerName: custName
            }
          },
          {
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );

        if (orderRes.data && orderRes.data.id) {
          gatewayOrderId = orderRes.data.id;
          auditNote += ` | Razorpay Order: ${gatewayOrderId}`;
        }

        // Try creating Razorpay Dynamic UPI QR if account supports QR API
        try {
          const qrRes = await axios.post(
            'https://api.razorpay.com/v1/payments/qr_codes',
            {
              type: 'upi_qr',
              name: `${custName.substring(0, 18)} Bill`,
              usage: 'single_use',
              fixed_amount: true,
              payment_amount: numAmount * 100,
              description: `Payment for Ref #${referenceNo}`,
              notes: { referenceNo }
            },
            {
              headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json'
              },
              timeout: 4000
            }
          );

          if (qrRes.data && qrRes.data.id) {
            gatewayQrCodeId = qrRes.data.id;
            gatewayQrImageUrl = qrRes.data.image_url;
            auditNote += ` | Razorpay QR: ${gatewayQrCodeId}`;
          }
        } catch (qrApiErr) {
          // Non-critical: Many sandbox keys don't have separate QR permissions enabled; standard Orders UPI QR works
        }
      } catch (rzpErr) {
        console.warn('Razorpay order creation fallback (continuing with dynamic UPI QR):', rzpErr.response?.data?.error?.description || rzpErr.message);
        auditNote += ` (Gateway offline fallback: ${rzpErr.message})`;
      }
    }

    const payment = new db.payments({
      id: paymentId,
      shopId: req.shopId,
      customerId: custId,
      customerName: custName,
      customerPhone: custPhone,
      amount: numAmount,
      amountPaid: 0,
      balanceRemaining: numAmount,
      paymentMethod: paymentMethod || 'upi',
      status: 'Pending',
      referenceNo,
      gatewayProvider,
      gatewayOrderId,
      gatewayQrCodeId,
      gatewayQrImageUrl,
      gatewayUpiIntent: standardUpiIntent,
      qrDataUrl,
      saleId: saleId || null,
      invoiceNumber: invoiceNumber || null,
      purpose: purpose === 'checkout' ? 'checkout' : 'counter',
      notes: notes || 'Dynamic UPI QR Payment Request',
      auditTrail: [{
        status: 'Pending',
        updatedBy: 'Shop Owner',
        note: auditNote,
        timestamp: new Date()
      }],
      timestamp: new Date()
    });

    await payment.save();
    res.status(201).json(payment);
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(500).json({ error: 'Failed to create payment record', details: err.message });
  }
});

// POST /api/payments/:id/sync-gateway - Actively poll/sync status from Razorpay API
router.post('/:id/sync-gateway', async (req, res) => {
  try {
    const payment = await db.payments.findOne({
      $or: [{ id: req.params.id }, { referenceNo: req.params.id }],
      shopId: req.shopId
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Already settled
    if (payment.status === 'Successful' || payment.status === 'Paid') {
      return res.json({ synced: true, status: payment.status, payment });
    }

    const config = getGatewayConfig();
    if (!config.isConfigured || !payment.gatewayOrderId) {
      return res.json({ 
        synced: false, 
        message: 'No live gateway order attached or credentials unconfigured.', 
        payment 
      });
    }

    // Query Razorpay Payments for this Order
    const authHeader = getBasicAuthHeader(config.keyId, config.keySecret);
    const orderPaymentsRes = await axios.get(
      `https://api.razorpay.com/v1/orders/${payment.gatewayOrderId}/payments`,
      {
        headers: { Authorization: authHeader },
        timeout: 6000
      }
    );

    const items = orderPaymentsRes.data?.items || [];
    const captured = items.find(it => it.status === 'captured');

    if (captured) {
      const paidAmount = captured.amount / 100;
      const utr = captured.acquirer_data?.upi_transaction_id || captured.id;
      const result = await applyPaymentSuccess({
        payment,
        paidAmount,
        paymentId: captured.id,
        utr,
        method: captured.method || 'upi',
        updatedBy: 'Razorpay API Active Sync',
        note: `Payment confirmed via active gateway API sync. ID: ${captured.id}, UTR: ${utr}`
      });

      return res.json({ synced: true, status: 'Successful', payment: result.payment });
    }

    const failed = items.find(it => it.status === 'failed');
    if (failed) {
      const updated = await applyPaymentFailure({
        payment,
        reason: failed.error_description || 'Payment failed during gateway processing',
        updatedBy: 'Razorpay API Sync'
      });
      return res.json({ synced: true, status: 'Failed', payment: updated });
    }

    res.json({ synced: true, status: payment.status, payment });
  } catch (err) {
    console.error('Sync gateway error:', err);
    res.status(500).json({ error: 'Failed to sync with gateway', details: err.message });
  }
});

// PUT /api/payments/:id/status - Update payment status (Manual verification, partial pay, cancel, fail)
router.put('/:id/status', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { status, amountPaid, upiTransactionRef, note, updatedBy } = req.body;
    const validStatuses = ['Pending', 'Paid', 'Successful', 'Partially Paid', 'Failed', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const searchOr = [
      { id: req.params.id },
      { referenceNo: req.params.id }
    ];
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      searchOr.push({ _id: req.params.id });
    }

    const query = { $or: searchOr };
    if (req.shopId) {
      query.shopId = req.shopId;
    }

    const payment = await db.payments.findOne(query);

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    const oldStatus = payment.status;
    let newAmountPaid = payment.amountPaid || 0;
    let newBalanceRemaining = payment.balanceRemaining !== undefined ? payment.balanceRemaining : payment.amount;
    let verifiedAt = payment.verifiedAt;

    if (status === 'Successful' || status === 'Paid') {
      newAmountPaid = payment.amount;
      newBalanceRemaining = 0;
      verifiedAt = new Date();
    } else if (status === 'Partially Paid') {
      const parsedPartial = Number(amountPaid);
      newAmountPaid = (!isNaN(parsedPartial) && parsedPartial > 0) ? parsedPartial : (payment.amountPaid || 0);
      newBalanceRemaining = Math.max(0, payment.amount - newAmountPaid);
    } else if (status === 'Failed' || status === 'Cancelled') {
      newAmountPaid = 0;
      newBalanceRemaining = payment.amount;
    }

    const auditEntry = {
      status,
      updatedBy: updatedBy || 'Shop Owner (Manual Verification)',
      note: note || `Status changed from ${oldStatus} to ${status}${upiTransactionRef ? ` (Ref: ${upiTransactionRef})` : ''}`,
      timestamp: new Date()
    };

    const setFields = {
      status,
      amountPaid: newAmountPaid,
      balanceRemaining: newBalanceRemaining,
      verifiedAt: (status === 'Successful' || status === 'Paid') ? (verifiedAt || new Date()) : payment.verifiedAt
    };

    if (upiTransactionRef && upiTransactionRef.trim()) {
      setFields.upiTransactionRef = upiTransactionRef.trim();
    }

    let updatedPayment = await db.payments.findOneAndUpdate(
      { _id: payment._id },
      {
        $set: setFields,
        $push: { auditTrail: auditEntry }
      },
      { returnDocument: 'after', new: true }
    );

    if (!updatedPayment) {
      return res.status(500).json({ error: 'Failed to apply status update to payment document' });
    }

    const becamePaid = (status === 'Successful' || status === 'Paid') && oldStatus !== 'Paid' && oldStatus !== 'Successful';
    let creditApplied = 0;

    // Update customer credit & amountPaid ledger if applicable
    if (isRealCustomer(payment.customerId)) {
      try {
        const customer = await db.customers.findOne({ id: payment.customerId, shopId: req.shopId });
        if (customer) {
          if (becamePaid) {
            const creditPayment = Math.min(customer.totalCredit || 0, payment.amount);
            creditApplied = creditPayment;
            const newCredit = Math.max(0, (customer.totalCredit || 0) - creditPayment);
            const newAmountPaidCust = (customer.amountPaid || 0) + payment.amount;
            const newTotalSpent = (customer.totalSpent || 0) + (customer.totalCredit > 0 ? 0 : payment.amount);
            const paymentStatus = newCredit === 0 ? 'Paid' : 'Partially Paid';

            await db.customers.findOneAndUpdate(
              { id: customer.id, shopId: req.shopId },
              { 
                $set: { 
                  totalCredit: newCredit,
                  amountPaid: newAmountPaidCust,
                  totalSpent: newTotalSpent,
                  paymentStatus,
                  lastVisit: new Date()
                } 
              }
            );
          } else if (status === 'Partially Paid') {
            const deltaPaid = Math.max(0, newAmountPaid - (payment.amountPaid || 0));
            const newCredit = Math.max(0, (customer.totalCredit || 0) - deltaPaid);
            const newAmountPaidCust = (customer.amountPaid || 0) + deltaPaid;
            const paymentStatus = newCredit === 0 ? 'Paid' : 'Partially Paid';

            await db.customers.findOneAndUpdate(
              { id: customer.id, shopId: req.shopId },
              { 
                $set: { 
                  totalCredit: newCredit,
                  amountPaid: newAmountPaidCust,
                  paymentStatus,
                  lastVisit: new Date()
                } 
              }
            );
          }
        }
      } catch (custErr) {
        console.warn('Customer Khata update non-critical warning:', custErr.message);
      }
    }

    if (becamePaid) {
      updatedPayment = (await recordSaleForPayment(updatedPayment, payment.amount, creditApplied)) || updatedPayment;
    }

    paymentEmitter.emit(`payment_updated_${updatedPayment.id}`, updatedPayment);
    paymentEmitter.emit(`payment_updated_${updatedPayment.referenceNo}`, updatedPayment);
    paymentEmitter.emit('payment_broadcast', updatedPayment);

    res.json(updatedPayment);
  } catch (err) {
    console.error('Update payment status error:', err);
    res.status(500).json({ error: 'Failed to update payment status: ' + err.message });
  }
});

module.exports = router;
