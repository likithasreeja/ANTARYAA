/**
 * Automated Verification Test Suite for:
 * 1. Customer Management Without a Fixed Limit (Unlimited Customers, CRUD, Search, Pagination)
 * 2. Real-Time Payment Transaction Tracking (Dynamic UPI QR, HMAC Webhook, Idempotency, Gateway Sync)
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const { app, connectDB } = require('./index');

const TEST_PORT = 5099;
const BASE_URL = `http://localhost:${TEST_PORT}/api`;

let server;

async function startTestServer() {
  await connectDB();
  return new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Test server running on port ${TEST_PORT}`);
      resolve();
    });
  });
}

async function stopTestServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log('Test server stopped.');
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 TESTING CUSTOMER MANAGEMENT & REAL-TIME PAYMENT TRACKING');
  console.log('================================================================\n');

  try {
    await startTestServer();

    // STEP 1: Register or Login Test Merchant Shop
    console.log('--- STEP 1: Authenticate Merchant Shop ---');
    const testPhone = '9988776655';
    const testPassword = 'securePassword123';
    let token = null;

    try {
      const reg = await axios.post(`${BASE_URL}/auth/register`, {
        name: 'Gupta Kirana & General Store',
        ownerName: 'Sunil Gupta',
        city: 'Indore',
        phone: testPhone,
        password: testPassword
      });
      token = reg.data.token;
      console.log('✅ Registered new test shop.');
    } catch (e) {
      if (e.response && e.response.status === 400) {
        const login = await axios.post(`${BASE_URL}/auth/login`, {
          phone: testPhone,
          password: testPassword
        });
        token = login.data.token;
        console.log('✅ Logged in existing test shop.');
      } else {
        throw e;
      }
    }

    const authHeaders = {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };

    // STEP 2: Verify Customer Management Without 30 Limit
    console.log('\n--- STEP 2: Verify Unlimited Customer Management ---');
    
    // Seed standard 30 demo customers
    const seedRes = await axios.post(`${BASE_URL}/customers/seed-demo`, {}, authHeaders);
    console.log(`✅ Seeded base demo customers. Count: ${seedRes.data.count}`);

    // Add 10 MORE custom customers to clearly exceed the 30-limit barrier
    console.log('   Adding 10 additional customers to verify unlimited scale (> 30)...');
    const addedCustomers = [];
    for (let i = 1; i <= 10; i++) {
      const cust = await axios.post(`${BASE_URL}/customers`, {
        name: `Scale Test Customer ${i}`,
        phone: `98000000${i < 10 ? '0' + i : i}`,
        city: 'Indore Central',
        customerType: 'Regular',
        totalCredit: 500 * i
      }, authHeaders);
      addedCustomers.push(cust.data);
    }
    console.log(`✅ Added ${addedCustomers.length} additional customers beyond 30.`);

    // Check total customer count in DB
    const allCustomersRes = await axios.get(`${BASE_URL}/customers`, authHeaders);
    const totalCustomers = allCustomersRes.data.length;
    console.log(`✅ Total customer count in database: ${totalCustomers}`);
    if (totalCustomers < 40) {
      throw new Error(`Expected at least 40 customers in DB, but found ${totalCustomers}`);
    }
    console.log('✅ Verification Passed: Fixed 30-customer limitation successfully removed!');

    // Test Search API
    const searchRes = await axios.get(`${BASE_URL}/customers?search=Scale Test Customer 5`, authHeaders);
    if (searchRes.data.length === 0 || searchRes.data[0].name !== 'Scale Test Customer 5') {
      throw new Error('Customer search did not return expected match');
    }
    console.log('✅ Customer Search working: found exact match for "Scale Test Customer 5".');

    // Test Pagination API
    const pageRes = await axios.get(`${BASE_URL}/customers?paginated=true&page=1&limit=15`, authHeaders);
    if (!pageRes.data.customers || pageRes.data.customers.length !== 15 || pageRes.data.totalPages < 3) {
      throw new Error('Customer pagination failed');
    }
    console.log(`✅ Customer Pagination working: Page 1 returned ${pageRes.data.customers.length} items of ${pageRes.data.totalCount} total (${pageRes.data.totalPages} pages).`);

    // Test Customer Edit
    const customerToEdit = addedCustomers[0];
    const editRes = await axios.put(`${BASE_URL}/customers/${customerToEdit.id}`, {
      name: 'Edited VIP Customer',
      phone: '9999911111',
      city: 'Indore Palasia',
      customerType: 'High Value',
      totalCredit: 1200
    }, authHeaders);
    if (editRes.data.name !== 'Edited VIP Customer' || editRes.data.totalCredit !== 1200) {
      throw new Error('Customer edit failed');
    }
    console.log('✅ Customer Edit working: name updated to "Edited VIP Customer", credit updated to ₹1200.');

    // Test Customer Delete
    const customerToDelete = addedCustomers[addedCustomers.length - 1];
    await axios.delete(`${BASE_URL}/customers/${customerToDelete.id}`, authHeaders);
    const verifyDeleted = await axios.get(`${BASE_URL}/customers?search=${customerToDelete.name}`, authHeaders);
    if (verifyDeleted.data.length !== 0) {
      throw new Error('Customer was not properly deleted');
    }
    console.log(`✅ Customer Delete working: removed customer ID ${customerToDelete.id}.`);

    // STEP 3: Verify Payment Provider Status
    console.log('\n--- STEP 3: Verify Payment Provider Configuration ---');
    const providerStatus = await axios.get(`${BASE_URL}/payments/provider-status`);
    console.log('✅ Payment Provider Status:', {
      provider: providerStatus.data.provider,
      razorpayConfigured: providerStatus.data.razorpayConfigured,
      merchantVpa: providerStatus.data.merchantVpa
    });

    // STEP 4: Create Dynamic UPI Payment Request
    console.log('\n--- STEP 4: Create Dynamic UPI Payment Request ---');
    const paymentAmount = 1500;
    const createPayRes = await axios.post(`${BASE_URL}/payments`, {
      amount: paymentAmount,
      customerName: 'Edited VIP Customer',
      customerId: customerToEdit.id,
      notes: 'Monthly Grocery Settlement'
    }, authHeaders);

    const payment = createPayRes.data;
    console.log('✅ Dynamic Payment Request Created:');
    console.log(`   - Payment ID: ${payment.id}`);
    console.log(`   - Reference No: ${payment.referenceNo}`);
    console.log(`   - Amount: ₹${payment.amount}`);
    console.log(`   - Status: ${payment.status} (Initial)`);
    console.log(`   - Gateway Provider: ${payment.gatewayProvider}`);
    console.log(`   - UPI Intent URI: ${payment.gatewayUpiIntent}`);
    console.log(`   - Dynamic QR Data URL generated: ${!!payment.qrDataUrl}`);

    if (payment.status !== 'Pending') {
      throw new Error(`Expected initial status 'Pending', got ${payment.status}`);
    }
    if (!payment.referenceNo.startsWith('ANT-PAY-') && !payment.referenceNo.startsWith('PAY-')) {
      throw new Error(`Invalid reference format: ${payment.referenceNo}`);
    }
    if (!payment.qrDataUrl || !payment.qrDataUrl.startsWith('data:image/png;base64,')) {
      throw new Error('Dynamic QR base64 data URL was not generated');
    }

    // STEP 5: Test Cryptographic HMAC Webhook Payment Verification
    console.log('\n--- STEP 5: Test Cryptographic HMAC Webhook (Payment Captured) ---');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'antarya_webhook_secret_sandbox';
    const fakeGatewayPaymentId = 'pay_test_' + Date.now();
    const webhookEventId = 'evt_' + Date.now();

    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: fakeGatewayPaymentId,
            amount: paymentAmount * 100, // Razorpay uses paisa
            currency: 'INR',
            status: 'captured',
            notes: {
              paymentId: payment.id,
              referenceNo: payment.referenceNo
            },
            acquirer_data: {
              rrn: '123456789012',
              upi_transaction_id: 'UPI987654321'
            }
          }
        }
      }
    };

    const rawPayloadString = JSON.stringify(webhookPayload);
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawPayloadString).digest('hex');

    const webhookRes = await axios.post(`${BASE_URL}/payments/webhook`, rawPayloadString, {
      headers: {
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': webhookEventId,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Webhook Response:', webhookRes.data);

    // Verify Payment Record in DB
    const updatedPayment = await axios.get(`${BASE_URL}/payments/${payment.id}`, authHeaders);
    console.log('   - Updated Status:', updatedPayment.data.status);
    console.log('   - Amount Verified:', updatedPayment.data.amountVerified);
    console.log('   - Gateway Payment ID:', updatedPayment.data.gatewayPaymentId);
    console.log('   - UPI Ref / UTR:', updatedPayment.data.upiTransactionRef);
    console.log('   - Webhook Event ID:', updatedPayment.data.webhookEventId);

    if (updatedPayment.data.status !== 'Successful') {
      throw new Error(`Expected status 'Successful', got ${updatedPayment.data.status}`);
    }
    if (!updatedPayment.data.amountVerified) {
      throw new Error('Expected amountVerified to be true');
    }
    if (updatedPayment.data.gatewayPaymentId !== fakeGatewayPaymentId) {
      throw new Error('Gateway payment ID mismatch');
    }

    // Verify Customer Ledger Credit Adjustment
    const updatedCustomer = await axios.get(`${BASE_URL}/customers/${customerToEdit.id}/details`, authHeaders);
    console.log(`   - Customer Initial Credit: ₹1200 | Credit after ₹1500 payment: ₹${updatedCustomer.data.customer.totalCredit}`);
    if (updatedCustomer.data.customer.totalCredit !== 0) {
      throw new Error(`Expected customer credit to be reduced to 0, got ${updatedCustomer.data.customer.totalCredit}`);
    }
    console.log('✅ Customer Khata ledger automatically credited upon payment success!');

    // STEP 6: Test Idempotency (Duplicate Webhook Protection)
    console.log('\n--- STEP 6: Test Webhook Idempotency (Duplicate Prevention) ---');
    const duplicateWebhookRes = await axios.post(`${BASE_URL}/payments/webhook`, rawPayloadString, {
      headers: {
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': webhookEventId,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Duplicate Webhook Result:', duplicateWebhookRes.data);
    if (!duplicateWebhookRes.data.message || (!duplicateWebhookRes.data.message.includes('Duplicate') && !duplicateWebhookRes.data.message.includes('idempotent'))) {
      throw new Error('Duplicate webhook was not recognized as already processed');
    }

    // STEP 7: Test Security Rejection on Amount Mismatch
    console.log('\n--- STEP 7: Test Security: Amount Mismatch Detection ---');
    const payment2 = (await axios.post(`${BASE_URL}/payments`, {
      amount: 1000,
      customerName: 'Security Test Customer'
    }, authHeaders)).data;

    const tamperedPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_tampered_' + Date.now(),
            amount: 500 * 100, // Only 500 paid instead of 1000!
            notes: {
              paymentId: payment2.id,
              referenceNo: payment2.referenceNo
            }
          }
        }
      }
    };
    const tamperedRaw = JSON.stringify(tamperedPayload);
    const tamperedSig = crypto.createHmac('sha256', webhookSecret).update(tamperedRaw).digest('hex');

    const tamperedRes = await axios.post(`${BASE_URL}/payments/webhook`, tamperedRaw, {
      headers: {
        'x-razorpay-signature': tamperedSig,
        'Content-Type': 'application/json'
      }
    }).catch(err => err.response); // Expecting 400 for amount mismatch
    console.log('✅ Mismatched Amount Webhook Handled:', tamperedRes.data);
    const checkTampered = (await axios.get(`${BASE_URL}/payments/${payment2.id}`, authHeaders)).data;
    if (checkTampered.amountVerified === true || checkTampered.status === 'Successful') {
      throw new Error('Security flaw: Payment marked Successful despite amount mismatch!');
    }
    console.log(`✅ Security Passed: Mismatched payment flagged. Status: ${checkTampered.status}, amountVerified: ${checkTampered.amountVerified}`);

    // STEP 8: Test Failed Payment Webhook
    console.log('\n--- STEP 8: Test Failed Payment Event ---');
    const payment3 = (await axios.post(`${BASE_URL}/payments`, {
      amount: 750,
      customerName: 'Fail Test Customer'
    }, authHeaders)).data;

    const failedPayload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_' + Date.now(),
            error_description: 'Customer bank declined transaction: Insufficient Funds',
            notes: {
              paymentId: payment3.id,
              referenceNo: payment3.referenceNo
            }
          }
        }
      }
    };
    const failedRaw = JSON.stringify(failedPayload);
    const failedSig = crypto.createHmac('sha256', webhookSecret).update(failedRaw).digest('hex');

    await axios.post(`${BASE_URL}/payments/webhook`, failedRaw, {
      headers: {
        'x-razorpay-signature': failedSig,
        'Content-Type': 'application/json'
      }
    });

    const checkFailed = (await axios.get(`${BASE_URL}/payments/${payment3.id}`, authHeaders)).data;
    console.log(`✅ Failed Payment Event Handled. Status: ${checkFailed.status}, Reason: ${checkFailed.failureReason}`);
    if (checkFailed.status !== 'Failed') {
      throw new Error(`Expected status 'Failed', got ${checkFailed.status}`);
    }

    // STEP 9: Test Payment History Filters & Summary KPIs
    console.log('\n--- STEP 9: Verify Payments Ledger Filters & Summary KPIs ---');
    const summary = (await axios.get(`${BASE_URL}/payments/summary`, authHeaders)).data;
    console.log('✅ Payments Financial Summary:', {
      totalMoneyCollected: summary.totalMoneyCollected,
      totalSuccessfulPayments: summary.counts.successful,
      pendingPayments: summary.counts.pending,
      failedPayments: summary.counts.failed
    });

    if (summary.counts.successful < 1) {
      throw new Error('Expected at least 1 successful payment in summary');
    }

    const filteredSuccessful = (await axios.get(`${BASE_URL}/payments?status=Successful`, authHeaders)).data;
    console.log(`✅ Filtered Payments (Status=Successful): ${filteredSuccessful.length} records found.`);

    console.log('\n================================================================');
    console.log('🎉 ALL AUTOMATED TESTS COMPLETED WITH 100% SUCCESS!');
    console.log('================================================================');

  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err.response?.data || err.message);
    if (err.stack) console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await stopTestServer();
  }
}

runTests();
