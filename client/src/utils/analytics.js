/**
 * ANTARYA Google Analytics 4 (GA4) Integration Utility
 * ====================================================
 * Configured via Vite environment variable: `VITE_GA_MEASUREMENT_ID`
 * 
 * Mixpanel is initialized alongside GA4 via `utils/mixpanel.js` and
 * `VITE_MIXPANEL_TOKEN`. GA4 event names are unchanged; Mixpanel receives
 * mapped assignment event names from the same success-path calls.
 *
 * Complies with strict privacy standards:
 * - Never sends passwords, full phone numbers, or private PII
 * - Sends anonymized IDs, business event parameters, and page views
 * - Maintains an in-memory event bus for live UI debugging and MSE presentations
 */

import {
  identifyMixpanelUser,
  initMixpanel,
  resetMixpanelUser,
  trackMixpanelFromGa
} from './mixpanel';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';

// Identical events within this window are dropped (React StrictMode double-mounts, double clicks)
const DEDUPE_WINDOW_MS = 1000;

// In-memory debug log for real-time verification in the UI
const eventDebugLog = [];
const eventListeners = new Set();
const lastSentAt = new Map();

// 'disabled' | 'loading' | 'loaded' | 'blocked'
let scriptStatus = 'disabled';
let currentUserId = null;

function isDebugMode() {
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('ga_debug');
    if (param === '1') sessionStorage.setItem('antarya_ga_debug', '1');
    if (param === '0') sessionStorage.removeItem('antarya_ga_debug');
    return sessionStorage.getItem('antarya_ga_debug') === '1';
  } catch {
    return false;
  }
}

function isDuplicate(eventName, params) {
  const key = `${eventName}:${JSON.stringify(params)}`;
  const now = Date.now();
  const last = lastSentAt.get(key);
  lastSentAt.set(key, now);
  return last !== undefined && now - last < DEDUPE_WINDOW_MS;
}

function isDeliveringToGA() {
  return scriptStatus === 'loaded' || scriptStatus === 'loading';
}

export function subscribeToEvents(callback) {
  eventListeners.add(callback);
  return () => eventListeners.delete(callback);
}

function notifyListeners(eventEntry) {
  eventListeners.forEach(listener => {
    try {
      listener(eventEntry, [...eventDebugLog]);
    } catch (e) {
      console.error('Analytics listener error:', e);
    }
  });
}

/**
 * Initialize GA4 by injecting gtag.js script if a measurement ID is configured.
 */
export function initGA() {
  if (typeof window === 'undefined') return;
  initMixpanel();

  if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID.startsWith('G-')) {
    if (!document.getElementById('ga-gtag-script')) {
      scriptStatus = 'loading';
      const script = document.createElement('script');
      script.id = 'ga-gtag-script';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      script.onload = () => {
        scriptStatus = 'loaded';
        eventDebugLog.forEach(e => { if (e.pending) { e.pending = false; e.isSentToGA = true; } });
        notifyListeners(null);
      };
      script.onerror = () => {
        scriptStatus = 'blocked';
        eventDebugLog.forEach(e => { if (e.pending) { e.pending = false; e.isSentToGA = false; } });
        notifyListeners(null);
        console.warn('📊 [GA4] gtag.js failed to load (ad blocker / offline). Events are NOT reaching Google Analytics.');
      };
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      window.gtag = function() {
        window.dataLayer.push(arguments);
      };
      window.gtag('js', new Date());
      window.gtag('config', GA_MEASUREMENT_ID, {
        send_page_view: false, // We trigger manual page_views on route change
        ...(isDebugMode() ? { debug_mode: true } : {})
      });

      console.log(`📊 [GA4] Initialized with Measurement ID: ${GA_MEASUREMENT_ID}${isDebugMode() ? ' (DebugView enabled)' : ''}`);
    }
  } else {
    // Development / Demo Mode Mock
    if (!window.gtag) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function() {
        window.dataLayer.push(arguments);
      };
      console.log('📊 [GA4 Debug Mode] No VITE_GA_MEASUREMENT_ID set. Events are logged locally for UI verification.');
    }
  }
}

/**
 * Sanitize event parameters to strip sensitive personal data.
 */
function sanitizeParams(params = {}) {
  const sanitized = { ...params };

  // Strip phone numbers, passwords, personal secrets
  ['password', 'phone', 'fullPhone', 'userPassword', 'secret', 'email', 'ownerName', 'token'].forEach(key => {
    if (sanitized[key]) {
      delete sanitized[key];
    }
  });

  // Ensure numeric values are properly formatted
  if (sanitized.amount !== undefined) sanitized.amount = Number(sanitized.amount);
  if (sanitized.quantity !== undefined) sanitized.quantity = Number(sanitized.quantity);

  return sanitized;
}

/**
 * Track page views
 */
export function trackPageView(pageName, pagePath) {
  const path = pagePath || (typeof window !== 'undefined' ? window.location.pathname : '/');
  const title = pageName || document.title || path;
  const params = {
    page_title: title,
    page_location: typeof window !== 'undefined' ? window.location.href : '',
    page_path: path
  };

  if (isDuplicate('page_view', params)) return;

  const eventEntry = {
    id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    eventName: 'page_view',
    params,
    timestamp: new Date().toISOString(),
    isSentToGA: scriptStatus === 'loaded',
    pending: scriptStatus === 'loading'
  };

  const mixpanelResult = trackMixpanelFromGa('page_view', {
    page_name: title,
    page_title: title,
    page_path: path
  });
  eventEntry.mixpanelEvents = mixpanelResult.mapped.map(event => event.name);
  eventEntry.isSentToMixpanel = mixpanelResult.sent.length > 0;

  eventDebugLog.unshift(eventEntry);
  if (eventDebugLog.length > 100) eventDebugLog.pop();
  notifyListeners(eventEntry);

  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'page_view', eventEntry.params);
  }
}

/**
 * Track custom user behavior events.
 */
export function trackEvent(eventName, params = {}) {
  const cleanParams = sanitizeParams(params);

  if (isDuplicate(eventName, cleanParams)) return;

  const eventEntry = {
    id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    eventName,
    params: cleanParams,
    timestamp: new Date().toISOString(),
    isSentToGA: scriptStatus === 'loaded',
    pending: scriptStatus === 'loading'
  };

  const mixpanelResult = trackMixpanelFromGa(eventName, cleanParams);
  eventEntry.mixpanelEvents = mixpanelResult.mapped.map(event => event.name);
  eventEntry.isSentToMixpanel = mixpanelResult.sent.length > 0;

  eventDebugLog.unshift(eventEntry);
  if (eventDebugLog.length > 100) eventDebugLog.pop();
  notifyListeners(eventEntry);

  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, cleanParams);
  }

  // Also log to console in dev mode
  if (import.meta.env.DEV) {
    console.log(`📊 [GA4 Event] ${eventName}`, cleanParams);
  }
}

/**
 * Associate subsequent hits with the logged-in shop so each client store's
 * behaviour can be separated in GA4 (User-ID + user properties).
 * Only the internal shop ID and city are sent — never names or phone numbers.
 */
export function setAnalyticsUser(shop) {
  if (typeof window === 'undefined' || !shop?.id) return;
  identifyMixpanelUser(shop);
  if (!window.gtag) return;
  if (currentUserId === shop.id) return;
  currentUserId = shop.id;

  window.gtag('set', { user_id: shop.id });
  window.gtag('set', 'user_properties', {
    shop_id: shop.id,
    shop_city: shop.city || 'unknown'
  });
}

export function clearAnalyticsUser() {
  resetMixpanelUser();
  if (typeof window === 'undefined' || !window.gtag || !currentUserId) return;
  currentUserId = null;
  window.gtag('set', { user_id: null });
  window.gtag('set', 'user_properties', { shop_id: null, shop_city: null });
}

/**
 * Get current Google Analytics status information.
 */
export function getGAStatus() {
  const isConfigured = Boolean(GA_MEASUREMENT_ID && GA_MEASUREMENT_ID.startsWith('G-'));
  const maskedId = isConfigured
    ? `${GA_MEASUREMENT_ID.substring(0, 4)}••••${GA_MEASUREMENT_ID.substring(GA_MEASUREMENT_ID.length - 2)}`
    : 'Not Configured';

  return {
    isConfigured,
    scriptStatus,
    isDeliveringToGA: isDeliveringToGA(),
    debugMode: isDebugMode(),
    userId: currentUserId,
    measurementId: GA_MEASUREMENT_ID,
    maskedId,
    eventCount: eventDebugLog.length,
    recentEvents: [...eventDebugLog]
  };
}

/**
 * Standard Events Catalog supported by ANTARYA
 */
export const TRACKED_EVENTS_CATALOG = [
  { name: 'page_view', desc: 'Triggered automatically when the user navigates to any screen', params: ['page_title', 'page_path'] },
  { name: 'onboarding_started', desc: 'Fired when a new shop owner begins the registration walkthrough', params: ['source'] },
  { name: 'shop_registered', desc: 'Fired when the store profile is successfully created', params: ['shop_id', 'city'] },
  { name: 'login_completed', desc: 'Fired upon successful authentication', params: ['method'] },
  { name: 'customer_added', desc: 'Fired when a single new customer is added manually', params: ['customer_id', 'city', 'customer_count'] },
  { name: 'customer_list_viewed', desc: 'Fired once after the customer list loads successfully', params: ['customer_count'] },
  { name: 'customer_viewed', desc: 'Fired when customer details profile modal is opened', params: ['customer_id', 'segment'] },
  { name: 'customer_segment_viewed', desc: 'Fired when filtering customers by segment', params: ['segment'] },
  { name: 'product_added', desc: 'Fired when an inventory item SKU is registered', params: ['product_id', 'category', 'price'] },
  { name: 'stock_added', desc: 'Fired when stock quantity is replenished', params: ['product_id', 'quantity', 'cost'] },
  { name: 'sale_created', desc: 'Fired when a customer bill is finalized (Cash / UPI / Udhaar)', params: ['sale_id', 'amount', 'payment_method', 'item_count'] },
  { name: 'inventory_excel_uploaded', desc: 'Fired when a sales Excel/CSV sheet is added to a market in the Inventory Planner', params: ['rows', 'products'] },
  { name: 'inventory_plan_generated', desc: 'Fired when the CatBoost inventory plan is calculated for a market', params: ['method', 'products'] },
  { name: 'ga_test_event', desc: 'Manual connectivity check fired from the GA Setup page', params: ['source'] },
  { name: 'mixpanel_test_event', desc: 'Manual Mixpanel connectivity check fired from the analytics setup page', params: ['source'] },
  { name: 'demo_data_loaded', desc: 'Fired when sample business records are loaded into the store (kept separate from real usage)', params: ['customers', 'products', 'sales'] },
  { name: 'subscription_checkout_started', desc: 'Fired when the shop owner opens Razorpay Checkout for the monthly subscription', params: ['period', 'amount', 'mode'] },
  { name: 'subscription_payment_verified', desc: 'Fired when Razorpay confirms the monthly subscription payment', params: ['verified_by', 'amount'] },
  { name: 'subscription_payment_failed', desc: 'Fired when a subscription payment attempt fails in Razorpay Checkout', params: ['reason'] },
  { name: 'dashboard_viewed', desc: 'Fired when viewing the main store dashboard', params: ['time_of_day'] },
  { name: 'analytics_dashboard_viewed', desc: 'Fired when opening the Product Analytics KPI center', params: ['date_range'] },
  { name: 'filter_changed', desc: 'Fired when toggling date range or category filters', params: ['filter_type', 'value'] },
  { name: 'search_used', desc: 'Fired when using customer or product search bars', params: ['search_scope', 'query_length'] },
  { name: 'payment_qr_viewed', desc: 'Fired when UPI QR payment terminal or modal is opened', params: ['amount_range', 'payment_method'] },
  { name: 'payment_initiated', desc: 'Fired when a customer UPI QR payment session is created', params: ['payment_method', 'amount_range'] },
  { name: 'payment_confirmed', desc: 'Fired when shopkeeper verifies payment receipt', params: ['payment_method', 'amount_range'] },
  { name: 'payment_failed', desc: 'Fired when a payment attempt fails or is marked as unreceived', params: ['payment_method', 'reason'] },
  { name: 'invoice_created', desc: 'Fired when a printable GST/Kirana invoice or receipt is generated', params: ['payment_method', 'item_count'] },
  { name: 'checkout_started', desc: 'Fired when checkout order screen or cart is reviewed', params: ['item_count', 'amount_range'] },
  { name: 'prediction_viewed', desc: 'Fired when reviewing the Two-Stage CatBoost demand prediction', params: ['product_name', 'predicted_demand'] },
  { name: 'recommendation_viewed', desc: 'Fired when opening the AI Reorder & Smart Suggestion card', params: ['recommendation_type'] }
];

export default {
  initGA,
  trackPageView,
  trackEvent,
  getGAStatus,
  setAnalyticsUser,
  clearAnalyticsUser,
  subscribeToEvents,
  TRACKED_EVENTS_CATALOG
};
