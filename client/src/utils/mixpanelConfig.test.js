import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_PAGES,
  MIXPANEL_EVENTS,
  MIXPANEL_TOKEN_PLACEHOLDER,
  getAnalyticsEnvironment,
  isMixpanelTokenConfigured,
  mapGaEventToMixpanel,
  maskMixpanelToken,
  sanitizeMixpanelProperties
} from './mixpanelConfig.js';

test('rejects missing, short, and placeholder Mixpanel tokens', () => {
  assert.equal(isMixpanelTokenConfigured(''), false);
  assert.equal(isMixpanelTokenConfigured('   '), false);
  assert.equal(isMixpanelTokenConfigured(MIXPANEL_TOKEN_PLACEHOLDER), false);
  assert.equal(isMixpanelTokenConfigured('abc'), false);
  assert.equal(isMixpanelTokenConfigured('0123456789abcdef0123456789abcdef'), true);
});

test('masks configured tokens and labels missing tokens', () => {
  assert.equal(maskMixpanelToken(''), 'Not Configured');
  assert.equal(maskMixpanelToken(MIXPANEL_TOKEN_PLACEHOLDER), 'Not Configured');
  assert.equal(maskMixpanelToken('0123456789abcdef'), '0123••••ef');
});

test('treats Vite production mode as production and everything else as development', () => {
  assert.equal(getAnalyticsEnvironment('production'), 'production');
  assert.equal(getAnalyticsEnvironment('development'), 'development');
  assert.equal(getAnalyticsEnvironment(undefined), 'development');
});

test('strips personal, payment, and credential fields while keeping safe analytics properties', () => {
  const clean = sanitizeMixpanelProperties({
    page_name: 'Customers',
    feature_name: 'Customer Management',
    customer_count: 12,
    payment_status: 'Pending',
    environment: 'development',
    timestamp: '2026-10-21T00:00:00.000Z',
    name: 'Raju Kirana',
    customerName: 'Priya',
    ownerName: 'Raju',
    phone: '9876543210',
    email: 'owner@example.com',
    upiId: 'shop@upi',
    upiTransactionRef: 'UTR123',
    password: 'secret',
    token: 'jwt-token',
    notes: 'Pay to 9876543210',
    customer: { name: 'Priya', phone: '111' }
  });

  assert.deepEqual(clean, {
    page_name: 'Customers',
    feature_name: 'Customer Management',
    customer_count: 12,
    payment_status: 'Pending',
    environment: 'development',
    timestamp: '2026-10-21T00:00:00.000Z'
  });
});

test('maps page views to Page Viewed and Feature Used only on product screens', () => {
  const landing = mapGaEventToMixpanel('page_view', {
    page_title: 'Landing – ANTARYA',
    page_path: '/'
  });
  assert.deepEqual(landing, [
    {
      name: MIXPANEL_EVENTS.PAGE_VIEWED,
      properties: { page_name: 'Landing – ANTARYA', page_path: '/' }
    }
  ]);

  const customers = mapGaEventToMixpanel('page_view', {
    page_title: 'Customers – ANTARYA',
    page_path: '/customers'
  });
  assert.equal(customers[0].name, MIXPANEL_EVENTS.PAGE_VIEWED);
  assert.equal(customers[1].name, MIXPANEL_EVENTS.FEATURE_USED);
  assert.equal(customers[1].properties.feature_name, FEATURE_PAGES['/customers']);
});

test('maps auth, customer, and payment success events to assignment names', () => {
  assert.equal(mapGaEventToMixpanel('shop_registered', {})[0].name, MIXPANEL_EVENTS.USER_SIGNED_UP);
  assert.equal(mapGaEventToMixpanel('login_completed', { method: 'phone_password' })[0].name, MIXPANEL_EVENTS.USER_LOGGED_IN);

  const added = mapGaEventToMixpanel('customer_added', { customer_id: 'abc', customer_count: 4, city: 'Pune' });
  assert.equal(added[0].name, MIXPANEL_EVENTS.CUSTOMER_ADDED);
  assert.equal(added[0].properties.customer_count, 4);
  assert.equal(added[0].properties.customer_id, undefined);
  assert.equal(added[0].properties.city, undefined);

  const list = mapGaEventToMixpanel('customer_list_viewed', { customer_count: 4 });
  assert.equal(list[0].name, MIXPANEL_EVENTS.CUSTOMER_LIST_VIEWED);

  const created = mapGaEventToMixpanel('payment_initiated', {
    payment_method: 'upi',
    amount_range: '101-500'
  });
  assert.equal(created[0].name, MIXPANEL_EVENTS.PAYMENT_REQUEST_CREATED);
  assert.equal(created[0].properties.payment_status, 'Pending');

  const viewed = mapGaEventToMixpanel('payment_qr_viewed', { payment_method: 'upi' });
  assert.equal(viewed[0].name, MIXPANEL_EVENTS.PAYMENT_REQUEST_VIEWED);

  const paid = mapGaEventToMixpanel('payment_confirmed', {
    payment_method: 'upi',
    amount_range: '101-500',
    verification_type: 'manual'
  });
  assert.equal(paid[0].name, MIXPANEL_EVENTS.PAYMENT_COMPLETED);
  assert.equal(paid[0].properties.payment_status, 'Successful');
});

test('does not invent Mixpanel events for unknown or failed-style actions', () => {
  assert.deepEqual(mapGaEventToMixpanel('payment_failed', { reason: 'timeout' }).filter(e =>
    e.name === MIXPANEL_EVENTS.PAYMENT_COMPLETED
  ), []);
  assert.deepEqual(mapGaEventToMixpanel('unknown_event_xyz', {}), []);
});

test('maps confirmed feature actions without duplicating dashboard page Feature Used', () => {
  const sale = mapGaEventToMixpanel('sale_created', { sale_id: 's1', amount: 250, payment_method: 'cash' });
  assert.equal(sale.some(e => e.name === MIXPANEL_EVENTS.FEATURE_USED && e.properties.feature_name === 'Quick Sale'), true);
  assert.equal(sale.some(e => e.properties.amount !== undefined), false);

  const dashboard = mapGaEventToMixpanel('dashboard_viewed', { time_of_day: 10 });
  assert.equal(dashboard.some(e => e.name === MIXPANEL_EVENTS.FEATURE_USED), false);
});
