/**
 * Regression test: a verified UPI QR payment must show up in dashboard revenue and orders
 * exactly once, without double counting Khata repayments or Quick Sale checkouts.
 */
const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');

process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret';
const { app, connectDB } = require('./index');

const TEST_PORT = 5098;
const BASE_URL = `http://localhost:${TEST_PORT}/api`;
let server;
let failures = 0;

function check(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    failures++;
    console.log(`  ❌ ${label}`);
  }
}

async function registerShop(suffix) {
  const phone = `98${Date.now().toString().slice(-6)}${suffix}`;
  const { data } = await axios.post(`${BASE_URL}/auth/register`, {
    name: `Revenue Test ${suffix}`, ownerName: 'Tester', city: 'Pune', phone, password: 'secret123'
  });
  return { headers: { Authorization: `Bearer ${data.token}` } };
}

const dashboard = async (auth) => (await axios.get(`${BASE_URL}/dashboard`, auth)).data;

function signedWebhook(body) {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  return axios.post(`${BASE_URL}/payments/webhook`, raw, {
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature }
  });
}

async function run() {
  await connectDB();
  server = await new Promise(resolve => {
    const s = app.listen(TEST_PORT, () => resolve(s));
  });

  console.log('\n1. Counter QR payment marked paid by shop owner');
  const auth = await registerShop('1');
  const counter = (await axios.post(`${BASE_URL}/payments`, { amount: 200, customerName: 'Walk-in Customer', notes: 'Store counter payment' }, auth)).data;
  await axios.put(`${BASE_URL}/payments/${counter.id}/status`, { status: 'Paid' }, auth);
  let d = await dashboard(auth);
  check(d.totalMoneyCollected === 200, `collected ₹200 (got ₹${d.totalMoneyCollected})`);
  check(d.totalRevenue === 200, `sales revenue ₹200 (got ₹${d.totalRevenue})`);
  check(d.totalOrders === 1, `1 order (got ${d.totalOrders})`);
  check(d.averageOrderValue === 200, `avg order value ₹200 (got ₹${d.averageOrderValue})`);
  check(d.todaySales === 200, `today's sales ₹200 (got ₹${d.todaySales})`);
  const paid = (await axios.get(`${BASE_URL}/payments/${counter.id}`, auth)).data;
  check(Boolean(paid.saleId), 'payment linked to the recorded sale');

  console.log('\n2. Marking the same payment paid again does not add a second sale');
  await axios.put(`${BASE_URL}/payments/${counter.id}/status`, { status: 'Paid' }, auth);
  d = await dashboard(auth);
  check(d.totalOrders === 1 && d.totalRevenue === 200, `still 1 order / ₹200 (got ${d.totalOrders} / ₹${d.totalRevenue})`);

  console.log('\n3. Razorpay webhook confirmation records the sale once, even if delivered twice');
  const viaWebhook = (await axios.post(`${BASE_URL}/payments`, { amount: 350, customerName: 'Walk-in Customer' }, auth)).data;
  const webhookBody = {
    event: 'payment.captured',
    event_id: `evt_${Date.now()}`,
    payload: { payment: { entity: { id: `pay_${Date.now()}`, amount: 35000, method: 'upi', notes: { referenceNo: viaWebhook.referenceNo } } } }
  };
  await signedWebhook(webhookBody);
  await signedWebhook(webhookBody);
  d = await dashboard(auth);
  check(d.totalOrders === 2, `2 orders after webhook (got ${d.totalOrders})`);
  check(d.totalRevenue === 550, `revenue ₹550 (got ₹${d.totalRevenue})`);

  console.log('\n4. Khata repayment is not counted as new revenue; overpayment is');
  const credit = (await axios.post(`${BASE_URL}/sales`, {
    items: [{ productName: 'Rice', quantity: 2, price: 150 }], paymentType: 'udhaar', customerName: 'Ramesh'
  }, auth)).data;
  check(credit.total === 300, 'credit sale of ₹300 recorded');
  const ramesh = (await axios.get(`${BASE_URL}/customers`, auth)).data;
  const rameshList = Array.isArray(ramesh) ? ramesh : (ramesh.customers || []);
  const rameshId = rameshList.find(c => c.name === 'Ramesh').id;
  d = await dashboard(auth);
  const revenueBefore = d.totalRevenue;
  const ordersBefore = d.totalOrders;
  const settle = (await axios.post(`${BASE_URL}/payments`, { amount: 300, customerId: rameshId, customerName: 'Ramesh' }, auth)).data;
  await axios.put(`${BASE_URL}/payments/${settle.id}/status`, { status: 'Paid' }, auth);
  d = await dashboard(auth);
  check(d.totalRevenue === revenueBefore && d.totalOrders === ordersBefore, `repaying ₹300 credit leaves revenue unchanged (₹${revenueBefore} → ₹${d.totalRevenue})`);
  check(d.totalCreditOutstanding === 0, `Ramesh's credit cleared (got ₹${d.totalCreditOutstanding})`);
  const extra = (await axios.post(`${BASE_URL}/payments`, { amount: 120, customerId: rameshId, customerName: 'Ramesh' }, auth)).data;
  await axios.put(`${BASE_URL}/payments/${extra.id}/status`, { status: 'Paid' }, auth);
  d = await dashboard(auth);
  check(d.totalRevenue === revenueBefore + 120 && d.totalOrders === ordersBefore + 1, `new ₹120 payment with no credit due counts as a sale (₹${d.totalRevenue})`);

  console.log('\n5. Quick Sale checkout payment: the itemised sale is the only sale');
  const auth2 = await registerShop('2');
  const checkout = (await axios.post(`${BASE_URL}/payments`, { amount: 90, customerName: 'Walk-in Customer', purpose: 'checkout' }, auth2)).data;
  await axios.put(`${BASE_URL}/payments/${checkout.id}/status`, { status: 'Paid' }, auth2);
  d = await dashboard(auth2);
  check(d.totalOrders === 0, `payment alone does not create a sale (got ${d.totalOrders})`);
  const checkoutSale = { items: [{ productName: 'Tea', quantity: 1, price: 90 }], paymentType: 'upi', paymentId: checkout.id };
  const [first, second] = await Promise.all([
    axios.post(`${BASE_URL}/sales`, checkoutSale, auth2).catch(e => e.response),
    axios.post(`${BASE_URL}/sales`, checkoutSale, auth2).catch(e => e.response)
  ]);
  const retry = await axios.post(`${BASE_URL}/sales`, checkoutSale, auth2);
  d = await dashboard(auth2);
  check(d.totalOrders === 1 && d.totalRevenue === 90, `checkout submitted 3 times, recorded once: 1 order / ₹90 (got ${d.totalOrders} / ₹${d.totalRevenue})`);
  check(retry.data.duplicate === true && retry.data.id === (first.data.id || second.data.id), 'retry returns the original sale');

  console.log('\n6. Unpaid, partial and cancelled payments do not create sales');
  const auth3 = await registerShop('3');
  const pending = (await axios.post(`${BASE_URL}/payments`, { amount: 500, customerName: 'Walk-in Customer' }, auth3)).data;
  const partial = (await axios.post(`${BASE_URL}/payments`, { amount: 400, customerName: 'Walk-in Customer' }, auth3)).data;
  await axios.put(`${BASE_URL}/payments/${partial.id}/status`, { status: 'Partially Paid', amountPaid: 100 }, auth3);
  await axios.put(`${BASE_URL}/payments/${pending.id}/status`, { status: 'Cancelled' }, auth3);
  d = await dashboard(auth3);
  check(d.totalOrders === 0 && d.totalRevenue === 0, `no sales yet (got ${d.totalOrders} / ₹${d.totalRevenue})`);
  await axios.put(`${BASE_URL}/payments/${partial.id}/status`, { status: 'Paid' }, auth3);
  d = await dashboard(auth3);
  check(d.totalOrders === 1 && d.totalRevenue === 400, `partial payment completed → one ₹400 sale (got ${d.totalOrders} / ₹${d.totalRevenue})`);

  console.log(failures === 0 ? '\n🎉 ALL PAYMENT REVENUE TESTS PASSED\n' : `\n❌ ${failures} CHECK(S) FAILED\n`);
}

run()
  .catch(err => {
    failures++;
    console.error('\n❌ TEST RUN FAILED:', err.response?.data || err.message);
  })
  .finally(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect().catch(() => {});
    process.exit(failures === 0 ? 0 : 1);
  });
