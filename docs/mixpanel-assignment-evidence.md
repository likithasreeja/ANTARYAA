# Mixpanel Integration Evidence — ANTARYA Assignment 2, Question 10

This document describes the Mixpanel integration added to the existing ANTARYA React + Vite frontend. It does **not** invent dashboard metrics, conversion rates, retention numbers, or screenshots. Capture those from your Mixpanel, Amplitude, and PostHog accounts.

Google Analytics 4 remains in place. Amplitude and PostHog are **not** installed in ANTARYA. The comparison section is for the written assignment only.

---

## 1. Summary of the integration

ANTARYA already tracked shopkeeper activity through `client/src/utils/analytics.js` (GA4). Mixpanel now receives the **same success-path user actions**, mapped to assignment-friendly event names.

- Package: official `mixpanel-browser` (v2.84.x) in `client/`
- Token: `VITE_MIXPANEL_TOKEN` only. The token is never hardcoded.
- Init: exactly once. If the token is missing or is the placeholder `YOUR_MIXPANEL_TOKEN`, Mixpanel is a no-op and the app still runs.
- SPA page views: custom `Page Viewed` events from React Router. Mixpanel automatic `$mp_web_page_view` is off to avoid duplicates.
- Identity: Mixpanel `identify(shop.id)` using the internal shop id already used by GA4. Logout calls `reset()`.
- Privacy: customer names, phones, emails, UPI IDs, passwords, tokens, and nested customer/payment objects are stripped before Mixpanel ingest.

Official SDK references used while implementing:

- [Mixpanel JavaScript SDK](https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript)
- [Identifying users (Simplified ID Merge)](https://docs.mixpanel.com/docs/tracking-methods/id-management/identifying-users)
- [Autocapture](https://docs.mixpanel.com/docs/quickstart/capture-events/autocapture)
- [Boards](https://docs.mixpanel.com/docs/boards)
- [Session Replay](https://docs.mixpanel.com/docs/session-replay)
- [Mixpanel pricing](https://mixpanel.com/pricing)

---

## 2. Files created or modified

### Created

| File | Purpose |
| --- | --- |
| `client/src/utils/mixpanel.js` | Mixpanel SDK init, track, identify, reset |
| `client/src/utils/mixpanelConfig.js` | Token checks, PII sanitization, GA → Mixpanel mapping (no SDK import) |
| `client/src/utils/mixpanelConfig.test.js` | Unit tests for token handling, sanitization, and event mapping |
| `docs/mixpanel-assignment-evidence.md` | This evidence document |

### Modified

| File | Change |
| --- | --- |
| `client/package.json` / `client/package-lock.json` | Added `mixpanel-browser` |
| `client/.env.example` | Added `VITE_MIXPANEL_TOKEN` placeholder and optional residency host |
| `client/src/utils/analytics.js` | Initializes Mixpanel with GA4; fans out mapped events; identifies/resets Mixpanel users |
| `client/src/screens/Onboarding.jsx` | Identify the shop **before** signup/login Mixpanel events |
| `client/src/screens/MyCustomers.jsx` | `Customer List Viewed` after a successful list load; `customer_count` on add |
| `client/src/screens/PaymentManager.jsx` | `Customer Added` after the payments quick-add succeeds |
| `client/src/screens/AnalyticsSetup.jsx` | Mixpanel status, setup steps, test button, and event catalog |
| `.gitignore` | Also ignore Vite `.env.local` files |

GA4 files, routes, and payment/customer business logic were not replaced.

---

## 3. Installation and environment configuration

### Local

From the frontend directory:

```bash
cd ANTARYA-English-Version/ANTARYA-English-Version/antarya1-main/client
npm install --save mixpanel-browser
```

Copy `client/.env.example` values into `client/.env` (never commit `.env`):

```
VITE_MIXPANEL_TOKEN=YOUR_MIXPANEL_TOKEN
```

Replace the placeholder with your real **Project Token**.

**Where to get the token (you must do this in the Mixpanel UI):**

1. Open [mixpanel.com](https://mixpanel.com) and select your existing ANTARYA project.
2. Open **Settings → Project Settings**.
3. Copy **Project Token**.
4. Do **not** use API Secret, Service Account secret, or personal access tokens in the browser.

If the Mixpanel project uses **India** data residency, also set:

```
VITE_MIXPANEL_API_HOST=https://api-in.mixpanel.com
```

For **EU** residency:

```
VITE_MIXPANEL_API_HOST=https://api-eu.mixpanel.com
```

Vite only reads `VITE_*` variables at **dev-server start** and **build** time. After changing `.env`, restart `npm run dev`.

### Vercel (production / preview)

The frontend is a Vite app, so `VITE_MIXPANEL_TOKEN` is inlined into the JavaScript bundle during `vite build`. Setting the variable in Vercel does nothing until a new deployment runs that build.

1. Vercel dashboard → your ANTARYA frontend project → **Settings → Environment Variables**.
2. Add `VITE_MIXPANEL_TOKEN` (and `VITE_MIXPANEL_API_HOST` if needed).
3. Apply it to Production, Preview, and/or Development as required.
4. **Redeploy** the frontend (Deployments → … → Redeploy, or push a new commit). A running deployment will not pick up a newly added Vite variable.

This work does **not** change Vercel production config or trigger a deploy.

---

## 4. Events implemented and trigger locations

Mixpanel event names are Title Case. GA4 keeps its existing snake_case names.

| Mixpanel event | Trigger | Source location | Properties sent |
| --- | --- | --- | --- |
| `Page Viewed` | React Router path change after auth loading finishes | `App.jsx` → `trackPageView` | `page_name`, `page_path`, `environment`, `timestamp` |
| `User Signed Up` | Shop register API succeeds | `Onboarding.jsx` `handleRegister` | `method`, `environment`, `timestamp` |
| `User Logged In` | Shop login API succeeds | `Onboarding.jsx` `handleLogin` | `method`, `environment`, `timestamp` |
| `Customer Added` | `api.addCustomer` succeeds | `MyCustomers.jsx`, `PaymentManager.jsx` | `customer_count`, `environment`, `timestamp` |
| `Customer List Viewed` | Customer list API succeeds (once per visit) | `MyCustomers.jsx` `loadAllCustomerData` | `customer_count`, `environment`, `timestamp` |
| `Payment Request Created` | `api.createPayment` succeeds | `PaymentQRModal.jsx` `createPaymentSession` | `payment_status=Pending`, `payment_method`, `amount_range` |
| `Payment Request Viewed` | UPI QR terminal/modal opens | `PaymentQRModal.jsx` open effect | `payment_status`, `payment_method`, `amount_range` |
| `Payment Completed` | Backend status is `Paid` or `Successful` (SSE/poll **or** shopkeeper manual verify API) | `PaymentQRModal.jsx` `handleLiveUpdate` / `handleConfirmPaidManual` | `payment_status=Successful`, `payment_method`, `amount_range` |
| `Feature Used` | Visiting a product feature route, or completing a known feature action (sale, stock add, inventory plan, etc.) | `trackPageView` + mapped GA events | `feature_name`, optional `source_event` |

`Payment Completed` is **not** fired when the QR is only shown, when the request is still pending, or when the update API fails.

Duplicate protection:

- Mixpanel `init()` runs once (`initAttempted` flag).
- Analytics already drops identical events inside a 1 second window (React StrictMode / double clicks).
- Customer list view is tracked once per screen visit (`useRef`).
- Dashboard `Feature Used` is emitted from the page view, not again from `dashboard_viewed`.

---

## 5. Privacy precautions

Sent:

- Internal shop id (Mixpanel distinct id)
- Optional `shop_city` as a Mixpanel super property (same privacy-safe field already used by GA4)
- Counts, amount **ranges**, payment status, feature names, page paths, `environment`

Never sent to Mixpanel:

- Customer names, phone numbers, emails
- Shop owner name
- Passwords, JWTs, API secrets
- UPI IDs, VPA, UTR / UPI transaction refs
- Full customer records or payment payloads
- Nested objects/arrays (dropped entirely)

Additional controls:

- Autocapture **inputs** and **form submits** are off (those screens include phone, password, customer, and UPI fields).
- Autocapture **text content** is off.
- Mixpanel Session Replay sampling is **not** enabled. Payment QR, customer, and checkout screens can show personal data on screen. Mixpanel’s own Session Replay docs warn that checkout/payment/profile screens are sensitive.
- Mixpanel `ip` is set to `false`.

---

## 6. Validation commands and actual results

Run from `antarya1-main/client`.

### Unit tests

```bash
npm test
```

**Actual result (21 Oct 2026):** 20 passed, 0 failed, including the new Mixpanel mapping/privacy tests.

```
# tests 20
# pass 20
# fail 0
# duration_ms 2685.5867
```

Mixpanel-specific tests covered:

- Missing / placeholder tokens are rejected
- PII keys are stripped; `page_name` and `feature_name` are kept
- Assignment events map from real GA events
- `payment_failed` does not become `Payment Completed`
- Unknown events are not invented

### Production build

```bash
npm run build
```

**Actual result:** Vite 5.4.21 succeeded (`✓ 2767 modules transformed`, `✓ built in 1m 21s`).

The existing “chunks are larger than 500 kB” warning is from the current app bundle (xlsx/jspdf/app code). It is not a Mixpanel compile error. No ESLint config or `lint` script exists in `client/package.json`, so linting was not run.

### What was **not** verified

Events were **not** confirmed in the Mixpanel UI from this environment, because no real Mixpanel project token is stored in the repo and none was provided. Do not treat local unit tests as proof that Mixpanel Live View is populated.

---

## 7. Manual Mixpanel verification instructions

1. Put the real token in `client/.env` as `VITE_MIXPANEL_TOKEN=...`.
2. Restart `npm run dev`.
3. Sign in (or register) and use the app. On **Google Analytics 4** (`/analytics-setup`) you should see Mixpanel status **Initialized** and mapped Mixpanel names on the live debugger.
4. Click **Trigger Mixpanel Test Event**. That maps to Mixpanel `Feature Used` with `feature_name=Analytics Setup`.
5. In Mixpanel: open the project → **Events** (Live View / incoming events, depending on UI version).
6. Confirm events such as `Page Viewed`, `User Logged In`, `Feature Used`.
7. Open a user profile and confirm the distinct id is the internal shop id, not a phone number.
8. Open an event and confirm properties include `environment` (`development` locally, `production` on the Vercel build) and do **not** include names, phones, or UPI IDs.

If Live View is empty:

- Token is still the placeholder, or Vite was not restarted
- Vercel was not **redeployed** after adding the env var
- Ad blockers can block `api.mixpanel.com` / `mxpnl.com`
- India/EU residency projects need `VITE_MIXPANEL_API_HOST` or Mixpanel will drop the data

### Legitimate test activity vs production

Use a **test shop account**, not real customer data.

Suggested walkthrough (each step is a real backend-confirmed action where required):

1. Open landing → `Page Viewed`
2. Register a test shop → `User Signed Up`
3. Log out and log in → `User Logged In`
4. Open Customers → `Customer List Viewed` + `Feature Used`
5. Add a test customer with a fake name/phone → `Customer Added`
6. Open Payments, create a UPI request → `Payment Request Viewed` then `Payment Request Created`
7. Mark received **only if** the app confirms Paid/Successful → `Payment Completed`

Filter Mixpanel reports by `environment = development` for local tests and `environment = production` for Vercel. That is how you separate assignment test traffic from live shopkeepers.

---

## 8. Dashboard report setup (`Product Engagement & Feature Usage`)

Mixpanel boards do **not** fill themselves. Open your existing board **Product Engagement & Feature Usage**, then add reports. Set the **board date range** (for example Last 7 days or Last 30 days). If you just started sending events, use **Today** or **Last 24 hours**.

### A. Event trends and active users

1. Board → **Add** → **Insights**.
2. Event: `Page Viewed` (or `Feature Used`).
3. Measurement: **Unique Users** for active users; **Total Events** for volume.
4. Optional breakdown: `environment` or `page_name`.
5. Chart: line. Save onto the board.

Requires: `Page Viewed` and/or `Feature Used`.

### B. Customer-management funnel

1. Board → **Add** → **Funnel**.
2. Steps, in this order:
   1. `User Logged In` (or `Page Viewed` filtered to `page_path = /customers`)
   2. `Customer List Viewed`
   3. `Customer Added`
3. Conversion window: 1 day is enough for a live demo; 7 days is more realistic.
4. Save onto the board.

Requires those three events from real use of Customers. Conversion will be 0% until you complete the walkthrough above.

### C. Payment-request funnel

1. Board → **Add** → **Funnel**.
2. Steps:
   1. `Payment Request Viewed`
   2. `Payment Request Created`
   3. `Payment Completed`
3. Optional filter: `payment_method = upi`.
4. Save onto the board.

`Payment Completed` only appears after backend confirmation. Opening the QR without a paid status is **not** a conversion.

### D. Retention

1. Board → **Add** → **Retention**.
2. First event / returning event: `User Logged In` or `Page Viewed`.
3. Interval: Daily (N-day) if you can generate activity on more than one day; otherwise the chart will look empty, which is expected for a same-day assignment demo.
4. Save onto the board.

Retention needs the same identified users returning on later days. One afternoon of test clicks is not enough for a meaningful retention curve.

### E. Feature-usage breakdown

1. Board → **Add** → **Insights**.
2. Event: `Feature Used`.
3. Breakdown by `feature_name`.
4. Chart: bar. Save onto the board.

Expected `feature_name` values include Dashboard, Customer Management, Payment Requests, Quick Sale, Product Analytics, Inventory Planner, Stock Management, Subscription, Analytics Setup.

---

## 9. Screenshot checklist for Assignment 2, Question 10

Capture these yourself from the browser. Do not paste fabricated charts.

### Mixpanel (from this ANTARYA integration)

- [ ] Mixpanel Project Settings showing **Project Token** (blur the token in the screenshot if you will share it)
- [ ] ANTARYA `/analytics-setup` Mixpanel status = Initialized
- [ ] Mixpanel Events / Live View with real events (`Page Viewed`, `User Logged In`, etc.)
- [ ] Insights: event trend / unique users
- [ ] Funnel: customer management
- [ ] Funnel: payment request
- [ ] Retention (even if sparse — label it as limited history)
- [ ] Insights: `Feature Used` broken down by `feature_name`
- [ ] Board **Product Engagement & Feature Usage** with the reports above

### Amplitude (not integrated into ANTARYA)

- [ ] Amplitude Analytics UI: a funnel and a retention chart from Amplitude’s own project/demo
- [ ] Optional: Amplitude Session Replay or Experiment page, labeled as Amplitude product UI — not ANTARYA data

### PostHog (not integrated into ANTARYA)

- [ ] PostHog product analytics: trends/funnel/retention
- [ ] PostHog session replay and feature flags pages, labeled as PostHog product UI — not ANTARYA data

When you write the assignment, state clearly that only Mixpanel (plus existing GA4) is wired into ANTARYA. Amplitude and PostHog screenshots are tool-capability evidence for the comparison, not ANTARYA telemetry.

---

## 10. Comparison: Mixpanel, Amplitude, and PostHog

Claims below are from current official docs/pricing pages (retrieved 21 Oct 2026). Plan names and included volumes change; re-check the vendor pricing page before you submit.

| Area | Mixpanel | Amplitude | PostHog |
| --- | --- | --- | --- |
| Core purpose | Event-based product analytics for funnels, retention, and feature usage | Behavioral analytics platform (cohorts, journeys, plus adjacent products) | All-in-one product OS: analytics, replay, flags, experiments, surveys, error tracking, warehouse |
| Funnels and retention | Built-in Insights, Funnels, Retention; included on Free | Built-in Funnel Analysis and retention; some advanced funnel views are paid | Built-in trends, funnels, retention, paths, stickiness, lifecycle |
| User journeys and cohorts | Flows reports and cohorts; saved cohorts unlimited on Growth+ | Strong behavioral cohorts; user journeys / paths | Paths, cohorts, persons, group analytics |
| Session replay | Built into current Free/Growth/Enterprise plans, with monthly replay caps (Free: 10k/month per Mixpanel’s pricing page). UI sampling controls are a paid Session Replay add-on. Default replay retention 30 days. | Amplitude Session Replay exists as a product (web/mobile). Treat it as a platform capability with its own limits, not as “just Analytics”. | Built-in session replay; separate usage allowance (PostHog documents a free monthly recording allowance). Self-host option. |
| Feature flags and experimentation | Mixpanel currently includes Experiments and Feature Flags on Free/Growth with caps (Free: up to 1k monthly experiment users and 10 active flags per mixpanel.com/pricing). This is **not** the same as unlimited LaunchDarkly-style flagging. | Amplitude Experiment / feature experimentation is a distinct Amplitude product, bundled on some current Amplitude plans. Confirm on Amplitude pricing. | Feature flags and experiments are first-class PostHog products, including on the free cloud tier, and in self-hosted setups. |
| Integration | `mixpanel-browser` in the Vite app; token in `VITE_MIXPANEL_TOKEN`; SPA page views need explicit config. Cloud only (no self-host). | `@amplitude/analytics-browser` (or Segment). Cloud only. | `posthog-js`; EU/US cloud or self-host. Autocapture is a major default. |
| Strengths for ANTARYA | Fast funnels/retention for shopkeeper workflows; generous free analytics; board already named for this assignment | Deep cohorts if ANTARYA later has many shops and needs behavioral prediction/governance | One tool if ANTARYA later wants flags, replay, and analytics with data residency/self-host |
| Limitations for ANTARYA | Replay on payment/customer screens is a privacy risk (left **off**). Event-volume pricing at scale. No self-host. | Heavier platform than needed for a course integration; Experiment/Replay are easy to over-claim as “included analytics”. | Autocapture can scoop form fields unless configured carefully — a problem for UPI/customer PII. UI is broader and easier to over-instrument. |

**Implemented in ANTARYA today:** Mixpanel + existing Google Analytics 4.  
**Not implemented:** Amplitude SDK, PostHog SDK, Mixpanel Session Replay recording, Mixpanel feature flags.

Sources:

- Mixpanel JS SDK, Boards, Session Replay, and [pricing](https://mixpanel.com/pricing)
- [Amplitude funnel analysis](https://amplitude.com/docs/analytics/charts/funnel-analysis) and Amplitude’s public product/pricing comparison pages
- [PostHog product analytics](https://posthog.com/docs/product-analytics) and [PostHog vs Mixpanel](https://posthog.com/blog/posthog-vs-mixpanel)

---

## 11. Limitations / outstanding manual steps

You still need to:

1. Create or open your Mixpanel project and copy the **Project Token**.
2. Put it in `client/.env` for local work.
3. Put it in **Vercel environment variables** and **redeploy** for production/preview.
4. Generate real test activity (section 7).
5. Build the five reports on board **Product Engagement & Feature Usage** (section 8).
6. Take screenshots (section 9).
7. Use Amplitude and PostHog accounts separately for comparison screenshots.

Until the token is set and the app is used, Mixpanel charts will be empty. That is expected.
