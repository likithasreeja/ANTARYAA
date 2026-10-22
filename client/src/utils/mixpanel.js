/**
 * ANTARYA Mixpanel browser SDK wrapper
 * ====================================
 * Official package: mixpanel-browser
 * Docs: https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript
 *
 * Token is read from VITE_MIXPANEL_TOKEN. Init is a no-op when the token is
 * missing so local/dev builds never crash. Identify uses the internal shop id
 * only — never phone numbers, names, or payment credentials.
 */

import mixpanel from 'mixpanel-browser';
import {
  getAnalyticsEnvironment,
  isMixpanelTokenConfigured,
  mapGaEventToMixpanel,
  maskMixpanelToken,
  sanitizeMixpanelProperties
} from './mixpanelConfig';

const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN || '';
const MIXPANEL_API_HOST = (import.meta.env.VITE_MIXPANEL_API_HOST || '').trim();

let initAttempted = false;
let enabled = false;
let identifiedShopId = null;

function environment() {
  return getAnalyticsEnvironment(import.meta.env.MODE);
}

function commonProperties() {
  return {
    environment: environment(),
    timestamp: new Date().toISOString(),
    app_name: 'ANTARYA'
  };
}

export function isMixpanelEnabled() {
  return enabled;
}

export function getMixpanelStatus() {
  return {
    isConfigured: isMixpanelTokenConfigured(MIXPANEL_TOKEN),
    isInitialized: enabled,
    maskedToken: maskMixpanelToken(MIXPANEL_TOKEN),
    environment: environment(),
    identifiedShopId,
    apiHost: MIXPANEL_API_HOST || 'default (api.mixpanel.com)'
  };
}

/**
 * Initialize Mixpanel exactly once. Safe to call from main.jsx and App.jsx.
 */
export function initMixpanel() {
  if (typeof window === 'undefined') return false;
  if (initAttempted) return enabled;
  initAttempted = true;

  if (!isMixpanelTokenConfigured(MIXPANEL_TOKEN)) {
    if (import.meta.env.DEV) {
      console.info('📊 [Mixpanel] Tracking disabled: VITE_MIXPANEL_TOKEN is not configured.');
    }
    return false;
  }

  try {
    const config = {
      // SPA page views are emitted from React Router as "Page Viewed".
      track_pageview: false,
      persistence: 'localStorage',
      ignore_dnt: false,
      ip: false,
      debug: Boolean(import.meta.env.DEV),
      // Limit autocapture so customer/payment form fields are not ingested.
      autocapture: {
        pageview: false,
        click: true,
        input: false,
        scroll: true,
        submit: false,
        capture_text_content: false,
        rage_click: true,
        dead_click: true
      }
    };

    if (MIXPANEL_API_HOST) {
      config.api_host = MIXPANEL_API_HOST;
    }

    mixpanel.init(MIXPANEL_TOKEN.trim(), config);
    mixpanel.register({
      environment: environment(),
      app_name: 'ANTARYA'
    });
    enabled = true;

    if (import.meta.env.DEV) {
      console.info(`📊 [Mixpanel] Initialized (${maskMixpanelToken(MIXPANEL_TOKEN)})`);
    }
  } catch (err) {
    enabled = false;
    console.warn('📊 [Mixpanel] Initialization failed. Tracking is disabled.', err);
  }

  return enabled;
}

export function trackMixpanelEvent(eventName, properties = {}) {
  if (!enabled || !eventName) return false;

  const clean = sanitizeMixpanelProperties({
    ...commonProperties(),
    ...properties
  });

  try {
    mixpanel.track(eventName, clean);
    return true;
  } catch (err) {
    console.warn('📊 [Mixpanel] Failed to track event', eventName, err);
    return false;
  }
}

/**
 * Fan-out a GA/internal event to one or more Mixpanel assignment events.
 * Returns the mapped Mixpanel event names (useful for the live debugger).
 */
export function trackMixpanelFromGa(gaEventName, params = {}) {
  const mapped = mapGaEventToMixpanel(gaEventName, params);
  const sent = [];

  mapped.forEach(({ name, properties }) => {
    if (trackMixpanelEvent(name, properties)) {
      sent.push(name);
    }
  });

  return { mapped, sent };
}

/**
 * Identify the authenticated shop with its internal id only.
 */
export function identifyMixpanelUser(shop) {
  if (!enabled || !shop?.id) return;
  if (identifiedShopId === shop.id) return;

  try {
    mixpanel.identify(String(shop.id));
    mixpanel.register({
      shop_id: String(shop.id),
      shop_city: shop.city || 'unknown',
      environment: environment()
    });
    mixpanel.people.set({
      shop_id: String(shop.id),
      shop_city: shop.city || 'unknown',
      environment: environment()
    });
    identifiedShopId = shop.id;
  } catch (err) {
    console.warn('📊 [Mixpanel] identify failed', err);
  }
}

export function resetMixpanelUser() {
  if (!enabled) {
    identifiedShopId = null;
    return;
  }

  try {
    mixpanel.reset();
    mixpanel.register({
      environment: environment(),
      app_name: 'ANTARYA'
    });
  } catch (err) {
    console.warn('📊 [Mixpanel] reset failed', err);
  }

  identifiedShopId = null;
}
