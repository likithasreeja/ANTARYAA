/**
 * Integration test: monthly subscription payments via Razorpay.
 * A local mock of the Razorpay REST API stands in for api.razorpay.com so the
 * verification logic (signature, amount, capture, idempotency, webhook) is exercised
 * without real keys. Run: cd server && node test_subscription_billing.js
 */
const crypto = require('crypto');
const express = require('express');
const axios = require('axios');

const KEY_ID = 'rzp_test_mockKey123';
const KEY_SECRET = 'mock_secret_abc';
const WEBHOOK_SECRET = 'mock_webhook_secret';
const MOCK_PORT = 5197;
const TEST_PORT = 5099;

process.env.RAZORPAY_KEY_ID = KEY_ID;
process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.RAZORPAY_API_BASE = `http://127.0.0.1:${MOCK_PORT}/v1`;
process.env.SUBSCRIPTION_MONTHLY_PRICE = '299';
delete process.env.ENABLE_PAYMENT_TEST_EVENTS;

const { app, connectDB } = require('./index');
const BASE_URL = `http://localhost:${TEST_PORT}/api`;

// ─── Mock Razorpay ──────────────────────────────────────────
const orders = {};
const payments = {};
let orderSeq = 0;
let paySeq = 0;
const mock = express();
mock.use(express.json());
mock.use((req, res, next) => {
  const expected = `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`;
  if (req.headers.authorization !== expected) return res.status(401).json({ error: { description: 'Authentication failed' } });
  next();
});
mock.post('/v1/orders', (req, res) => {
  const id = `order_mock${++orderSeq}`;
  orders[id] = { id, amount: req.body.amount, currency: req.body.currency, notes: req.body.notes, status: 'created' };
  res.json(orders[id]);
});
mock.get('/v1/payments/:id', (req, res) => payments[req.params.id] ? res.json(payments[req.params.id]) : res.status(404).json({ error: { description: 'not found' } }));
mock.get('/v1/orders/:id/payments', (req, res) => res.json({ items: Object.values(payments).filter(p => p.order_id === req.params.id) }));
mock.post('/v1/payments/:id/capture', (req, res) => {
  const p = payments[req.params.id];
  if (!p || p.status !== 'authorized') return res.status(400).json({ error: { description: 'not capturable' } });
  p.status = 'captured';
  res.json(p);
});
function customerPays(orderId, { amount, status = 'captured' } = {}) {
  const id = `pay_mock${++paySeq}`;
  payments[id] = {
    id, order_id: orderId, amount: amount ?? orders[orderId].amount, currency: 'INR', status, method: 'upi',
    acquirer_data: { upi_transaction_id: `UPI${100000 + paySeq}` }, created_at: Math.floor(Date.now() / 1000)
  };
  return id;
}
const sign = (orderId, paymentId, secret = KEY_SECRET) =>
  crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

// ─── Helpers ────────────────────────────────────────────────
let failures = 0;
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? '✅' : '❌'} ${msg}`); };
async function expectStatus(promise, status) {
  try { await promise; return false; } catch (e) { return e.response?.status === status ? (e.response.data || true) : false; }
}
async function register(phone) {
  const res = await axios.post(`${BASE_URL}/auth/register`, { name: `Sub Test ${phone}`, ownerName: 'Owner', city: 'Pune', phone, password: 'pass12345' });
  return { headers: { Authorization: `Bearer ${res.data.token}` } };
}

async function run() {
  const mockServer = await new Promise(r => { const s = mock.listen(MOCK_PORT, () => r(s)); });
  await connectDB();
  const server = await new Promise(r => { const s = app.listen(TEST_PORT, () => r(s)); });
  const suffix = String(Date.now()).slice(-6);
  const shopA = await register(`93333${suffix}`);
  const shopB = await register(`94444${suffix}`);

  try {
    console.log('\n1. Status before paying');
    const s0 = (await axios.get(`${BASE_URL}/subscription`, shopA)).data;
    check(s0.configured && s0.mode === 'test' && s0.plan.amount === 299, 'gateway configured in test mode, ₹299/month');
    check(s0.currentPaid === false && s0.months.length === 12 && s0.totalPaid === 0, 'current month unpaid, 12-month progress empty');

    console.log('\n2. Checkout creates one Razorpay order and reuses it');
    const c1 = (await axios.post(`${BASE_URL}/subscription/checkout`, {}, shopA)).data;
    const c2 = (await axios.post(`${BASE_URL}/subscription/checkout`, {}, shopA)).data;
    check(c1.orderId && c1.orderId === c2.orderId && orderSeq === 1, 'same order reused on repeat clicks');
    check(c1.amount === 29900 && c1.keyId === KEY_ID && !('keySecret' in c1), 'amount in paise; only the public key id is sent to the browser');
    const badPeriod = await expectStatus(axios.post(`${BASE_URL}/subscription/checkout`, { period: '2020-01' }, shopA), 400);
    check(!!badPeriod, 'cannot pay for arbitrary past months');

    console.log('\n3. Forged or wrong payments are rejected');
    const unpaid = await expectStatus(axios.post(`${BASE_URL}/subscription/verify`, {
      razorpay_order_id: c1.orderId, razorpay_payment_id: 'pay_fake', razorpay_signature: 'deadbeef'
    }, shopA), 400);
    check(unpaid && /signature/i.test(unpaid.error), 'invalid signature rejected');
    const under = customerPays(c1.orderId, { amount: 100 });
    const underRes = await expectStatus(axios.post(`${BASE_URL}/subscription/verify`, {
      razorpay_order_id: c1.orderId, razorpay_payment_id: under, razorpay_signature: sign(c1.orderId, under)
    }, shopA), 400);
    check(underRes && /mismatch/.test(underRes.error), 'under-payment (₹1 instead of ₹299) rejected even with a valid signature');
    delete payments[under];
    const cross = await expectStatus(axios.post(`${BASE_URL}/subscription/verify`, {
      razorpay_order_id: c1.orderId, razorpay_payment_id: 'x', razorpay_signature: sign(c1.orderId, 'x')
    }, shopB), 404);
    check(!!cross, 'another shop cannot verify this order');
    const statusStill = (await axios.get(`${BASE_URL}/subscription`, shopA)).data;
    check(statusStill.currentPaid === false, 'month still unpaid after rejected attempts');

    console.log('\n4. Real payment: authorized → captured → month marked paid');
    const payId = customerPays(c1.orderId, { status: 'authorized' });
    const v = (await axios.post(`${BASE_URL}/subscription/verify`, {
      razorpay_order_id: c1.orderId, razorpay_payment_id: payId, razorpay_signature: sign(c1.orderId, payId)
    }, shopA)).data;
    check(v.subscription.status === 'paid' && payments[payId].status === 'captured', 'authorized payment captured and recorded');
    check(v.subscription.upiTransactionId && v.subscription.verifiedBy === 'checkout_signature', 'UPI transaction id stored');

    console.log('\n5. Idempotency: webhook + sync after checkout do not double count');
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payments[payId] } } });
    const webhookSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    const wh = await axios.post(`${BASE_URL}/payments/webhook`, body, { headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': webhookSig } });
    check(wh.data.duplicate === true, 'webhook for the same payment acknowledged as duplicate');
    const sync = (await axios.post(`${BASE_URL}/subscription/orders/${c1.orderId}/sync`, {}, shopA)).data;
    check(sync.duplicate === true, 'status sync acknowledged as duplicate');
    const s1 = (await axios.get(`${BASE_URL}/subscription`, shopA)).data;
    check(s1.currentPaid && s1.totalPaid === 299 && s1.history.filter(h => h.status === 'paid').length === 1, 'exactly one ₹299 payment recorded');
    check(s1.streakMonths === 1 && s1.months[11].status === 'paid', 'progress shows current month paid');
    const again = await expectStatus(axios.post(`${BASE_URL}/subscription/checkout`, {}, shopA), 409);
    check(!!again, 'cannot pay the same month twice');

    console.log('\n6. Webhook-only path (browser closed before verify) for next month');
    const next = (await axios.post(`${BASE_URL}/subscription/checkout`, { period: s1.nextPeriod }, shopA)).data;
    const pay2 = customerPays(next.orderId);
    const forged = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payments[pay2] } } });
    const unsigned = await expectStatus(axios.post(`${BASE_URL}/payments/webhook`, forged, { headers: { 'Content-Type': 'application/json' } }), 400);
    check(!!unsigned, 'unsigned webhook rejected');
    const goodSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(forged).digest('hex');
    const wh2 = await axios.post(`${BASE_URL}/payments/webhook`, forged, { headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': goodSig } });
    check(wh2.data.status === 'paid', 'signed webhook confirmed with Razorpay API and marked next month paid');

    console.log('\n7. Webhook claiming payment that Razorpay does not have is not trusted');
    const c3shop = await register(`95555${suffix}`);
    const c3 = (await axios.post(`${BASE_URL}/subscription/checkout`, {}, c3shop)).data;
    const fakeBody = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_doesnotexist', order_id: c3.orderId, amount: 29900 } } } });
    const fakeSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(fakeBody).digest('hex');
    await expectStatus(axios.post(`${BASE_URL}/payments/webhook`, fakeBody, { headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': fakeSig } }), 502);
    const s3 = (await axios.get(`${BASE_URL}/subscription`, c3shop)).data;
    check(s3.currentPaid === false, 'month stays unpaid when Razorpay has no such payment');

    console.log('\n8. Payment test simulator is disabled by default');
    const sim = await expectStatus(axios.post(`${BASE_URL}/payments/webhook/test-event`, { referenceNo: 'ANY' }), 403);
    check(!!sim, '/payments/webhook/test-event returns 403');
    const provider = (await axios.get(`${BASE_URL}/payments/provider-status`)).data;
    check(provider.features.testEvents === false, 'provider-status reports testEvents=false');

    console.log('\n9. Without keys: clear error, nothing faked');
    process.env.RAZORPAY_KEY_ID = '';
    const noKeys = await expectStatus(axios.post(`${BASE_URL}/subscription/checkout`, {}, shopB), 503);
    check(noKeys && /RAZORPAY_KEY_ID/.test(noKeys.error), '503 explains which keys to add');
    process.env.RAZORPAY_KEY_ID = KEY_ID;
  } finally {
    console.log(failures === 0 ? '\n🎉 ALL SUBSCRIPTION BILLING TESTS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
    await new Promise(r => server.close(r));
    await new Promise(r => mockServer.close(r));
  }
}

run()
  .catch(err => { failures++; console.error('Test run crashed:', err.response?.data || err.stack); })
  .finally(() => process.exit(failures === 0 ? 0 : 1));
