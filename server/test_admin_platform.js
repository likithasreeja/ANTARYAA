/**
 * Integration test: platform admin dashboard + subscription paid by UPI QR to the platform VPA.
 * Run: cd server && node test_admin_platform.js
 */
const axios = require('axios');
const mongoose = require('mongoose');

const TEST_PORT = 5098;
const ADMIN_USER = 'platform-owner';
const ADMIN_PASS = 'test-admin-pass-123';
const PLATFORM_VPA = 'antarya.platform@okaxis';

process.env.SUBSCRIPTION_MONTHLY_PRICE = '299';
process.env.PLATFORM_UPI_VPA = PLATFORM_VPA;
process.env.PLATFORM_UPI_NAME = 'Antarya Platform';
process.env.UPI_MERCHANT_VPA = 'shop.counter@okicici';
delete process.env.ADMIN_JWT_SECRET;
// Always use a fresh in-memory database so shop counts are exact and real data is never touched.
process.env.MONGO_URI = '';

const { app, connectDB } = require('./index');
const { db } = require('./db');
const BASE_URL = `http://localhost:${TEST_PORT}/api`;

let failures = 0;
const check = (ok, msg) => { if (!ok) failures++; console.log(`  ${ok ? '✅' : '❌'} ${msg}`); };
async function expectStatus(promise, status) {
  try { await promise; return false; } catch (e) { return e.response?.status === status ? (e.response.data || true) : false; }
}
async function register(phone, name) {
  const res = await axios.post(`${BASE_URL}/auth/register`, { name, ownerName: `Owner ${name}`, city: 'Pune', phone, password: 'pass12345' });
  return { headers: { Authorization: `Bearer ${res.data.token}` } };
}

async function run() {
  await connectDB();
  const server = await new Promise(r => { const s = app.listen(TEST_PORT, () => r(s)); });
  const suffix = String(Date.now()).slice(-5);

  try {
    console.log('\n1. Admin login is disabled without env credentials');
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    const disabled = await expectStatus(axios.post(`${BASE_URL}/admin/login`, { username: 'admin', password: 'admin' }), 503);
    check(disabled && /ADMIN_USERNAME/.test(disabled.error), 'login returns 503 explaining ADMIN_USERNAME/ADMIN_PASSWORD');
    process.env.ADMIN_USERNAME = ADMIN_USER;
    process.env.ADMIN_PASSWORD = 'short';
    const weak = await expectStatus(axios.post(`${BASE_URL}/admin/login`, { username: ADMIN_USER, password: 'short' }), 503);
    check(!!weak, 'a password shorter than 8 characters keeps admin login disabled');
    process.env.ADMIN_PASSWORD = ADMIN_PASS;

    console.log('\n2. Wrong credentials rejected, right ones accepted');
    const wrong = await expectStatus(axios.post(`${BASE_URL}/admin/login`, { username: ADMIN_USER, password: 'nope-nope-nope' }), 401);
    check(!!wrong, 'wrong password rejected with 401');
    const login = (await axios.post(`${BASE_URL}/admin/login`, { username: ADMIN_USER, password: ADMIN_PASS })).data;
    check(Boolean(login.token) && login.username === ADMIN_USER, 'correct credentials return an admin token');
    const admin = { headers: { Authorization: `Bearer ${login.token}` } };

    console.log('\n3. Shopkeepers and the public cannot reach admin endpoints');
    const shopA = await register(`91111${suffix}`, 'Sharma Kirana');
    const shopB = await register(`92222${suffix}`, 'Gupta Stores');
    const shopC = await register(`93333${suffix}`, 'Patel General');
    const noToken = await expectStatus(axios.get(`${BASE_URL}/admin/overview`), 401);
    const shopToken = await expectStatus(axios.get(`${BASE_URL}/admin/overview`, shopA), 401);
    const shopVerify = await expectStatus(axios.post(`${BASE_URL}/admin/subscription-payments/anything/verify`, { amountReceived: 299 }, shopA), 401);
    check(!!noToken && !!shopToken && !!shopVerify, 'no token and shop token both get 401 (overview and verify)');

    console.log('\n4. Shop count comes from real registrations');
    const o0 = (await axios.get(`${BASE_URL}/admin/overview`, admin)).data;
    check(o0.shopCount === 3 && o0.unpaidShopsThisMonth === 3 && o0.paidShopsThisMonth === 0, 'overview: 3 shops, 3 unpaid');
    check(o0.totalCollected === 0 && o0.thisMonthCollected === 0, 'nothing collected yet');
    const list0 = (await axios.get(`${BASE_URL}/admin/shops`, admin)).data;
    const sharma = list0.shops.find(s => s.name === 'Sharma Kirana');
    check(list0.count === 3 && sharma && sharma.ownerName === 'Owner Sharma Kirana' && sharma.city === 'Pune' && sharma.joinedAt && !('password' in sharma),
      'shop list has name, owner, city, joined date and no password hash');

    console.log('\n5. Platform UPI QR pays the platform VPA, not the shop VPA');
    const qr = (await axios.post(`${BASE_URL}/subscription/upi`, {}, shopA)).data;
    check(qr.payeeVpa === PLATFORM_VPA && qr.upiIntent.includes(`pa=${PLATFORM_VPA}`) && !qr.upiIntent.includes('shop.counter'), 'intent pays PLATFORM_UPI_VPA');
    check(qr.amount === 299 && qr.upiIntent.includes('am=299.00') && qr.upiIntent.includes(`tr=${qr.upiReference}`), 'amount is the ₹299 plan price with a unique reference');
    check(qr.qrDataUrl.startsWith('data:image/png;base64,') && qr.status === 'created', 'QR image generated, status created');
    const qrAgain = (await axios.post(`${BASE_URL}/subscription/upi`, { amount: 1 }, shopA)).data;
    check(qrAgain.id === qr.id && qrAgain.amount === 299, 'repeat request reuses the same QR; client cannot change the amount');
    const badPeriod = await expectStatus(axios.post(`${BASE_URL}/subscription/upi`, { period: '2020-01' }, shopA), 400);
    check(!!badPeriod, 'cannot create a QR for arbitrary past months');

    console.log('\n6. Shop submits UTR but cannot mark itself paid');
    const badUtr = await expectStatus(axios.post(`${BASE_URL}/subscription/upi/${qr.id}/reference`, { utr: '12' }, shopA), 400);
    check(!!badUtr, 'invalid UTR rejected');
    const otherShop = await expectStatus(axios.post(`${BASE_URL}/subscription/upi/${qr.id}/reference`, { utr: '412345678901' }, shopB), 404);
    check(!!otherShop, 'another shop cannot touch this payment');
    const submitted = (await axios.post(`${BASE_URL}/subscription/upi/${qr.id}/reference`, { utr: '4123 4567 8901' }, shopA)).data;
    check(submitted.status === 'pending_verification' && submitted.upiTransactionId === '412345678901', 'UTR stored, status pending_verification');
    const s1 = (await axios.get(`${BASE_URL}/subscription`, shopA)).data;
    check(s1.currentPaid === false && s1.openUpiPayment?.status === 'pending_verification' && s1.upi.configured, 'month still unpaid while pending');
    const o1 = (await axios.get(`${BASE_URL}/admin/overview`, admin)).data;
    check(o1.pendingVerificationCount === 1 && o1.totalCollected === 0, 'admin sees 1 pending, nothing counted as collected yet');

    console.log('\n7. Admin verifies: month paid, totals updated');
    const wrongAmount = await expectStatus(axios.post(`${BASE_URL}/admin/subscription-payments/${qr.id}/verify`, { amountReceived: 199 }, admin), 400);
    check(wrongAmount && /299/.test(wrongAmount.error), 'verification with the wrong amount rejected');
    const v1 = (await axios.post(`${BASE_URL}/admin/subscription-payments/${qr.id}/verify`, { amountReceived: 299 }, admin)).data;
    check(v1.duplicate === false && v1.payment.status === 'paid' && v1.payment.verifiedBy === `admin:${ADMIN_USER}`, 'payment marked paid by the admin');
    const s2 = (await axios.get(`${BASE_URL}/subscription`, shopA)).data;
    check(s2.currentPaid && s2.totalPaid === 299 && s2.months[11].status === 'paid' && s2.openUpiPayment === null, 'shop sees this month paid');
    const o2 = (await axios.get(`${BASE_URL}/admin/overview`, admin)).data;
    check(o2.totalCollected === 299 && o2.thisMonthCollected === 299 && o2.paidShopsThisMonth === 1 && o2.unpaidShopsThisMonth === 2, 'totals: ₹299 collected, 1 paid / 2 unpaid');
    const list2 = (await axios.get(`${BASE_URL}/admin/shops`, admin)).data;
    const sharma2 = list2.shops.find(s => s.name === 'Sharma Kirana');
    check(sharma2.currentMonthStatus === 'paid' && sharma2.lastPayment?.amount === 299 && sharma2.lastPayment.provider === 'upi_qr', 'shop list shows current month paid and last payment');

    console.log('\n8. Idempotency: no double counting, no paying the same month twice');
    const v2 = (await axios.post(`${BASE_URL}/admin/subscription-payments/${qr.id}/verify`, { amountReceived: 299 }, admin)).data;
    const o3 = (await axios.get(`${BASE_URL}/admin/overview`, admin)).data;
    check(v2.duplicate === true && o3.totalCollected === 299 && o3.paidPaymentCount === 1, 'verifying twice is a no-op');
    const twice = await expectStatus(axios.post(`${BASE_URL}/subscription/upi`, {}, shopA), 409);
    check(!!twice, 'a new QR for an already-paid month is refused (409)');
    const reject = await expectStatus(axios.post(`${BASE_URL}/admin/subscription-payments/${qr.id}/reject`, {}, admin), 409);
    check(!!reject, 'a paid payment cannot be rejected');

    console.log('\n9. Stale duplicate request for a paid month cannot be verified; UTR cannot be reused');
    const { shopId: shopAId } = await db.subscriptionPayments.findOne({ id: qr.id }).lean();
    const stale = await db.subscriptionPayments.create({
      id: `SUB-stale-${suffix}`, shopId: shopAId,
      period: s2.currentPeriod, amount: 299, status: 'pending_verification', provider: 'upi_qr', gatewayMode: 'upi_qr',
      payeeVpa: PLATFORM_VPA, upiReference: `ANTSUBSTALE${suffix}`, upiTransactionId: '599999999999'
    });
    const staleVerify = await expectStatus(axios.post(`${BASE_URL}/admin/subscription-payments/${stale.id}/verify`, { amountReceived: 299 }, admin), 409);
    check(!!staleVerify, 'second payment for the same shop/month cannot be verified');
    const qrB = (await axios.post(`${BASE_URL}/subscription/upi`, {}, shopB)).data;
    const reusedUtr = await expectStatus(axios.post(`${BASE_URL}/subscription/upi/${qrB.id}/reference`, { utr: '412345678901' }, shopB), 409);
    check(!!reusedUtr, 'a UTR already used by another payment is refused');
    const rejected = (await axios.post(`${BASE_URL}/admin/subscription-payments/${qrB.id}/reject`, { reason: 'Not in statement' }, admin)).data;
    check(rejected.payment.status === 'rejected', 'admin can reject an unverified QR payment');
    const all = (await axios.get(`${BASE_URL}/admin/subscription-payments`, admin)).data;
    check(all.payments.length === 3 && all.summary.totalCollected === 299 && all.payments.every(p => p.shopName), 'payments list with shop names and unchanged total');

    console.log('\n10. Without PLATFORM_UPI_VPA: clear error');
    process.env.PLATFORM_UPI_VPA = '';
    const noVpa = await expectStatus(axios.post(`${BASE_URL}/subscription/upi`, {}, shopC), 503);
    check(noVpa && /PLATFORM_UPI_VPA/.test(noVpa.error), '503 explains PLATFORM_UPI_VPA');
    process.env.PLATFORM_UPI_VPA = PLATFORM_VPA;
  } finally {
    console.log(failures === 0 ? '\n🎉 ALL ADMIN PLATFORM TESTS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
    await new Promise(r => server.close(r));
  }
}

run()
  .catch(err => { failures++; console.error('Test run crashed:', err.response?.data || err.stack); })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
    process.exit(failures === 0 ? 0 : 1);
  });
