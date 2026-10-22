/**
 * Mixpanel mapping and privacy helpers (no SDK import).
 * Kept separate so unit tests can run in Node without mixpanel-browser.
 */

export const MIXPANEL_EVENTS = {
  PAGE_VIEWED: 'Page Viewed',
  USER_SIGNED_UP: 'User Signed Up',
  USER_LOGGED_IN: 'User Logged In',
  CUSTOMER_ADDED: 'Customer Added',
  CUSTOMER_LIST_VIEWED: 'Customer List Viewed',
  PAYMENT_REQUEST_CREATED: 'Payment Request Created',
  PAYMENT_REQUEST_VIEWED: 'Payment Request Viewed',
  PAYMENT_COMPLETED: 'Payment Completed',
  FEATURE_USED: 'Feature Used'
};

export const MIXPANEL_TOKEN_PLACEHOLDER = 'YOUR_MIXPANEL_TOKEN';

const SENSITIVE_VALUE_KEY_PATTERN = /(password|passwd|secret|token|authorization|email|phone|upi|vpa|aadhaar|aadhar|cvv|otp)/i;
const ALLOWED_NAME_KEYS = new Set(['pagename', 'featurename', 'sourcename']);

const SENSITIVE_KEYS = new Set([
  'password',
  'userpassword',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'email',
  'phone',
  'fullphone',
  'customerphone',
  'ownername',
  'customername',
  'name',
  'upi',
  'upiid',
  'upitransactionref',
  'notes',
  'note',
  'customer'
]);

export const FEATURE_PAGES = {
  '/dashboard': 'Dashboard',
  '/customers': 'Customer Management',
  '/payments': 'Payment Requests',
  '/sale': 'Quick Sale',
  '/product-analytics': 'Product Analytics',
  '/inventory-planner': 'Inventory Planner',
  '/stock': 'Stock Management',
  '/add-stock': 'Stock Management',
  '/suggestions': 'Smart Suggestions',
  '/ask': 'Ask Anything',
  '/subscription': 'Subscription',
  '/analytics-setup': 'Analytics Setup',
  '/money': 'My Money',
  '/decision-center': 'Decision Center',
  '/learning-engine': 'Learning Engine',
  '/grow': 'Grow Shop'
};

const FEATURE_BY_GA_EVENT = {
  dashboard_viewed: 'Dashboard',
  analytics_dashboard_viewed: 'Product Analytics',
  inventory_excel_uploaded: 'Inventory Planner',
  inventory_plan_generated: 'Inventory Planner',
  prediction_viewed: 'Demand Prediction',
  sale_created: 'Quick Sale',
  stock_added: 'Stock Management',
  product_added: 'Stock Management',
  stock_sheet_imported: 'Stock Import',
  subscription_checkout_started: 'Subscription',
  subscription_payment_verified: 'Subscription',
  subscription_upi_qr_shown: 'Subscription',
  ga_test_event: 'Analytics Setup',
  mixpanel_test_event: 'Analytics Setup',
  invoice_created: 'Invoice',
  customer_segment_viewed: 'Customer Analytics',
  search_used: 'Search',
  onboarding_started: 'Onboarding'
};

export function isMixpanelTokenConfigured(token) {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (trimmed === MIXPANEL_TOKEN_PLACEHOLDER) return false;
  if (trimmed.toLowerCase().includes('your_mixpanel')) return false;
  return trimmed.length >= 8;
}

export function maskMixpanelToken(token) {
  if (!isMixpanelTokenConfigured(token)) return 'Not Configured';
  const trimmed = token.trim();
  if (trimmed.length <= 8) return '••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-2)}`;
}

export function getAnalyticsEnvironment(mode) {
  return mode === 'production' ? 'production' : 'development';
}

function isSensitiveKey(key) {
  if (!key) return false;
  const normalized = String(key).toLowerCase().replace(/[_-]/g, '');
  if (ALLOWED_NAME_KEYS.has(normalized)) return false;
  if (SENSITIVE_KEYS.has(normalized)) return true;
  if (SENSITIVE_VALUE_KEY_PATTERN.test(String(key))) return true;
  return /(customername|ownername|fullname|firstname|lastname|username)$/i.test(normalized);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Drop personal, payment, and credential fields before Mixpanel ingest.
 * Nested objects and arrays are omitted rather than walked for PII.
 */
export function sanitizeMixpanelProperties(params = {}) {
  const sanitized = {};

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (isSensitiveKey(key)) return;
    if (typeof value === 'function') return;
    if (isPlainObject(value) || Array.isArray(value)) return;
    sanitized[key] = value;
  });

  return sanitized;
}

function compactProperties(properties) {
  const compact = {};
  Object.entries(properties || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    compact[key] = value;
  });
  return compact;
}

function pushUnique(events, name, properties) {
  events.push({ name, properties: compactProperties(properties) });
}

/**
 * Map existing GA/internal events to Mixpanel assignment event names.
 * Returns zero or more Mixpanel events. Unknown GA events are not invented
 * unless they already represent a known product feature.
 */
export function mapGaEventToMixpanel(gaEventName, params = {}) {
  const events = [];
  const pagePath = params.page_path || params.pagePath;
  const featureFromPage = FEATURE_PAGES[pagePath];
  const featureFromGa = FEATURE_BY_GA_EVENT[gaEventName];

  switch (gaEventName) {
    case 'page_view':
      pushUnique(events, MIXPANEL_EVENTS.PAGE_VIEWED, {
        page_name: params.page_name || params.page_title,
        page_path: pagePath
      });
      if (featureFromPage) {
        pushUnique(events, MIXPANEL_EVENTS.FEATURE_USED, {
          feature_name: featureFromPage,
          page_name: params.page_name || params.page_title
        });
      }
      return events;
    case 'shop_registered':
      pushUnique(events, MIXPANEL_EVENTS.USER_SIGNED_UP, {
        method: params.method || 'phone_password'
      });
      break;
    case 'login_completed':
      pushUnique(events, MIXPANEL_EVENTS.USER_LOGGED_IN, {
        method: params.method || 'phone_password'
      });
      break;
    case 'customer_added':
      pushUnique(events, MIXPANEL_EVENTS.CUSTOMER_ADDED, {
        customer_count: params.customer_count
      });
      break;
    case 'customer_list_viewed':
      pushUnique(events, MIXPANEL_EVENTS.CUSTOMER_LIST_VIEWED, {
        customer_count: params.customer_count
      });
      break;
    case 'payment_initiated':
      pushUnique(events, MIXPANEL_EVENTS.PAYMENT_REQUEST_CREATED, {
        payment_status: params.payment_status || 'Pending',
        payment_method: params.payment_method,
        amount_range: params.amount_range
      });
      break;
    case 'payment_qr_viewed':
      pushUnique(events, MIXPANEL_EVENTS.PAYMENT_REQUEST_VIEWED, {
        payment_status: params.payment_status || 'Pending',
        payment_method: params.payment_method,
        amount_range: params.amount_range
      });
      break;
    case 'payment_confirmed':
      pushUnique(events, MIXPANEL_EVENTS.PAYMENT_COMPLETED, {
        payment_status: 'Successful',
        payment_method: params.payment_method,
        amount_range: params.amount_range,
        verification_type: params.verification_type
      });
      break;
    default:
      break;
  }

  if (featureFromGa && gaEventName !== 'page_view') {
    // Skip Feature Used here when the same navigation already emits it from page_view.
    const skipBecausePageViewCoversIt = Object.values(FEATURE_PAGES).includes(featureFromGa)
      && ['dashboard_viewed', 'analytics_dashboard_viewed'].includes(gaEventName);
    if (!skipBecausePageViewCoversIt) {
      pushUnique(events, MIXPANEL_EVENTS.FEATURE_USED, {
        feature_name: featureFromGa,
        source_event: gaEventName
      });
    }
  }

  return events;
}

export const MIXPANEL_EVENTS_CATALOG = [
  { name: MIXPANEL_EVENTS.PAGE_VIEWED, desc: 'Fired on each React Router path change', params: ['page_name', 'page_path', 'environment', 'timestamp'] },
  { name: MIXPANEL_EVENTS.USER_SIGNED_UP, desc: 'Fired after the shop register API succeeds', params: ['method', 'environment', 'timestamp'] },
  { name: MIXPANEL_EVENTS.USER_LOGGED_IN, desc: 'Fired after the shop login API succeeds', params: ['method', 'environment', 'timestamp'] },
  { name: MIXPANEL_EVENTS.CUSTOMER_ADDED, desc: 'Fired after a customer is created in the backend', params: ['customer_count', 'environment', 'timestamp'] },
  { name: MIXPANEL_EVENTS.CUSTOMER_LIST_VIEWED, desc: 'Fired once after the customer list loads successfully', params: ['customer_count', 'environment', 'timestamp'] },
  { name: MIXPANEL_EVENTS.PAYMENT_REQUEST_CREATED, desc: 'Fired after a UPI payment request is created by the API', params: ['payment_status', 'payment_method', 'amount_range'] },
  { name: MIXPANEL_EVENTS.PAYMENT_REQUEST_VIEWED, desc: 'Fired when the UPI QR payment terminal is opened', params: ['payment_status', 'payment_method', 'amount_range'] },
  { name: MIXPANEL_EVENTS.PAYMENT_COMPLETED, desc: 'Fired only after backend status is Paid/Successful', params: ['payment_status', 'payment_method', 'amount_range'] },
  { name: MIXPANEL_EVENTS.FEATURE_USED, desc: 'Fired for product-feature screens and confirmed feature actions', params: ['feature_name', 'environment', 'timestamp'] }
];
