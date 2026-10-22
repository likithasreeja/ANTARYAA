import { useEffect, useState } from 'react';
import { CreditCard, QrCode, CheckCircle2, Circle, RefreshCw, ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import api from '../api';
import { trackEvent } from '../utils/analytics';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const PENDING_ORDER_KEY = 'antarya_pending_subscription_order';

const monthLabel = (period) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};
const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);
    const script = existing || document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check your internet connection.'));
    if (!existing) document.body.appendChild(script);
  });
}

export default function Subscription() {
  const { showToast } = useStore();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(() => localStorage.getItem(PENDING_ORDER_KEY));
  const [upiPay, setUpiPay] = useState(null);
  const [utr, setUtr] = useState('');

  const load = async () => {
    try {
      setStatus(await api.getSubscription());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  const awaitingVerification = status?.openUpiPayment?.status === 'pending_verification';
  useEffect(() => {
    if (!awaitingVerification) return undefined;
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [awaitingVerification]);

  // Close the QR panel once the platform admin has verified or rejected the payment.
  useEffect(() => {
    if (!upiPay || !status) return;
    const periodPaid = (upiPay.period === status.currentPeriod && status.currentPaid) || (upiPay.period === status.nextPeriod && status.nextPaid);
    const entry = status.history.find(h => h.id === upiPay.id);
    if (periodPaid) {
      showToast(`Antarya verified your UPI payment for ${monthLabel(upiPay.period)}. Thank you!`, 'success');
      trackEvent('subscription_payment_verified', { verified_by: 'platform_admin', amount: upiPay.amount });
      setUpiPay(null);
    } else if (entry?.status === 'rejected') {
      showToast(`UPI payment for ${monthLabel(upiPay.period)} could not be verified: ${entry.failureReason || 'rejected'}`, 'error');
      setUpiPay(null);
    }
  }, [status]);

  const startUpi = async (period) => {
    setBusy(true);
    try {
      const res = await api.createSubscriptionUpi(period);
      setUpiPay(res);
      setUtr(res.upiTransactionId || '');
      trackEvent('subscription_upi_qr_shown', { period: res.period, amount: res.amount });
    } catch (err) {
      showToast(err.message, 'error');
    }
    setBusy(false);
  };

  const submitUtr = async () => {
    setBusy(true);
    try {
      const res = await api.submitSubscriptionUtr(upiPay.id, utr);
      setUpiPay(res);
      showToast('Reference sent. The month is marked paid as soon as Antarya verifies it.', 'success');
      await load();
    } catch (err) {
      showToast(err.message, 'error');
    }
    setBusy(false);
  };

  const clearPending = () => {
    localStorage.removeItem(PENDING_ORDER_KEY);
    setPendingOrder(null);
  };

  const checkPending = async (orderId = pendingOrder, quiet = false) => {
    if (!orderId) return;
    setBusy(true);
    try {
      const res = await api.syncSubscriptionOrder(orderId);
      if (res.subscription?.status === 'paid') {
        clearPending();
        showToast(`Payment confirmed for ${monthLabel(res.subscription.period)}`, 'success');
        trackEvent('subscription_payment_verified', { verified_by: 'api_sync', amount: res.subscription.amount });
      } else if (!quiet) {
        showToast(res.failed ? `Payment failed: ${res.subscription?.failureReason || 'declined'}` : 'No completed payment found for this order yet.', res.failed ? 'error' : 'info');
      }
      await load();
    } catch (err) {
      if (!quiet) showToast(err.message, 'error');
    }
    setBusy(false);
  };

  const pay = async (period) => {
    setBusy(true);
    try {
      const [order] = await Promise.all([api.createSubscriptionCheckout(period), loadCheckoutScript()]);
      localStorage.setItem(PENDING_ORDER_KEY, order.orderId);
      setPendingOrder(order.orderId);
      trackEvent('subscription_checkout_started', { period: order.period, amount: order.amount / 100, mode: order.mode });

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        theme: { color: '#10b981' },
        config: {
          display: {
            blocks: { upi: { name: 'Pay with UPI (scan QR or use any UPI app)', instruments: [{ method: 'upi' }] } },
            sequence: ['block.upi'],
            preferences: { show_default_blocks: true }
          }
        },
        handler: async (response) => {
          try {
            const res = await api.verifySubscriptionPayment(response);
            if (res.subscription?.status === 'paid') {
              clearPending();
              showToast(`Payment received for ${monthLabel(res.subscription.period)}. Thank you!`, 'success');
              trackEvent('subscription_payment_verified', { verified_by: 'checkout_signature', amount: res.subscription.amount });
            } else {
              showToast('Payment is processing. We will confirm it shortly.', 'info');
            }
          } catch (err) {
            showToast(err.message, 'error');
          }
          await load();
          setBusy(false);
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            checkPending(order.orderId, true);
          }
        }
      });
      rzp.on('payment.failed', (resp) => {
        trackEvent('subscription_payment_failed', { reason: resp.error?.reason || 'unknown' });
        showToast(`Payment failed: ${resp.error?.description || 'please try again'}`, 'error');
      });
      rzp.open();
    } catch (err) {
      showToast(err.message, 'error');
      setBusy(false);
    }
  };

  if (error) {
    return <div className="page" style={{ paddingTop: 16 }}><div className="card" style={{ color: '#f43f5e' }}>{error}</div></div>;
  }
  if (!status) {
    return <div className="page" style={{ paddingTop: 16 }}><div className="card">Loading subscription…</div></div>;
  }

  const progressPct = Math.round((status.paidMonthsLast12 / 12) * 100);
  const nextToPay = !status.currentPaid ? status.currentPeriod : (!status.nextPaid ? status.nextPeriod : null);

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <h1 className="page-title">Subscription</h1>
      <p className="page-subtitle">{status.plan.name}: {inr(status.plan.amount)} per month, paid to Antarya by UPI.</p>

      {!status.configured && !status.upi?.configured && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(245,158,11,0.4)' }}>
          <div style={{ display: 'flex', gap: 8, fontWeight: 700, marginBottom: 8 }}><AlertTriangle size={18} color="#f59e0b" /> Online payments are not set up yet</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li>Create a free account at <a href="https://dashboard.razorpay.com/signup" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>dashboard.razorpay.com</a>.</li>
            <li>In Test Mode, open Account &amp; Settings → API Keys → Generate Key.</li>
            <li>Put <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> in <code>server/.env</code> and restart the server.</li>
            <li>After Razorpay KYC is approved, generate Live keys to receive real money.</li>
          </ol>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>This month ({monthLabel(status.currentPeriod)})</div>
          <div style={{ fontWeight: 800, fontSize: '1.3rem', color: status.currentPaid ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
            {status.currentPaid ? <><CheckCircle2 size={20} /> Paid</> : <>Due {inr(status.plan.amount)}</>}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Paid in the last 12 months</div>
          <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>{status.paidMonthsLast12} / 12 months</div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 8, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${progressPct}%`, height: '100%', background: '#10b981' }} />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total paid</div>
          <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>{inr(status.totalPaid)}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{status.streakMonths} month streak · gateway: {status.mode}</div>
        </div>
      </div>

      {status.upi?.configured && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><QrCode size={18} color="#10b981" /> Pay via UPI QR to Antarya</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {nextToPay ? `Scan with any UPI app and pay ${inr(status.plan.amount)} to ${status.upi?.payeeName} (${status.upi?.vpa}) for ${monthLabel(status.openUpiPayment?.period || nextToPay)}. The month is marked paid after Antarya verifies the payment.`
                  : 'This month and next month are already paid.'}
              </div>
            </div>
            {nextToPay && !upiPay && (
              <button className="btn btn-primary" onClick={() => startUpi(status.openUpiPayment?.period || nextToPay)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <QrCode size={16} /> {status.openUpiPayment ? 'Show my UPI QR' : 'Pay via UPI QR'}
              </button>
            )}
          </div>

          {!upiPay && awaitingVerification && (
            <div style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
              <RefreshCw size={14} /> Waiting for Antarya to verify UTR {status.openUpiPayment.upiTransactionId} for {monthLabel(status.openUpiPayment.period)}.
            </div>
          )}

          {upiPay && (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14, alignItems: 'flex-start' }}>
              <img src={upiPay.qrDataUrl} alt={`UPI QR to pay ${inr(upiPay.amount)} to ${upiPay.payeeName}`} width={220} height={220}
                style={{ background: '#fff', borderRadius: 12, padding: 8 }} />
              <div style={{ flex: '1 1 240px', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Pay to:</span> <strong>{upiPay.payeeName}</strong> ({upiPay.payeeVpa})</div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Amount:</span> <strong>{inr(upiPay.amount)}</strong> for {monthLabel(upiPay.period)}</div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Reference:</span> <code>{upiPay.upiReference}</code></div>
                <a href={upiPay.upiIntent} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ExternalLink size={14} /> Open UPI app
                </a>
                <div style={{ fontSize: '0.78rem', color: upiPay.status === 'pending_verification' ? '#f59e0b' : 'var(--text-secondary)', marginTop: 4 }}>
                  {upiPay.status === 'pending_verification'
                    ? `Reference ${upiPay.upiTransactionId} received. Waiting for Antarya to verify; this page updates automatically.`
                    : 'After paying, enter the UTR / UPI reference number shown in your UPI app.'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input className="input" style={{ flex: '1 1 160px' }} placeholder="UTR / UPI ref no. (12 digits)" value={utr}
                    onChange={e => setUtr(e.target.value)} maxLength={40} />
                  <button className="btn btn-primary btn-sm" onClick={submitUtr} disabled={busy || !utr.trim()}>
                    {upiPay.status === 'pending_verification' ? 'Update reference' : 'I have paid'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(status.configured || !status.upi?.configured) && (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><CreditCard size={18} color="#10b981" /> Pay online via Razorpay</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {nextToPay ? `Pay ${inr(status.plan.amount)} for ${monthLabel(nextToPay)}. Scan the QR with any UPI app; the month is marked paid only after Razorpay confirms the money.`
                : 'This month and next month are already paid.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {pendingOrder && (
              <button className="btn btn-secondary" onClick={() => checkPending()} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={15} /> I paid, check status
              </button>
            )}
            {nextToPay && (
              <button className="btn btn-primary" onClick={() => pay(nextToPay)} disabled={busy || !status.configured} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CreditCard size={16} /> {busy ? 'Please wait…' : `Pay ${inr(status.plan.amount)}`}
              </button>
            )}
          </div>
        </div>
        {status.mode === 'test' && (
          <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginTop: 10 }}>
            Razorpay Test Mode: no real money moves. Switch to Live keys after KYC to collect real payments.
          </div>
        )}
      </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Monthly payment progress</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
          {status.months.map(m => (
            <div key={m.period} title={m.paidAt ? `Paid ${new Date(m.paidAt).toLocaleString('en-IN')}` : 'Not paid'}
              style={{ padding: '8px 6px', borderRadius: 10, textAlign: 'center', fontSize: '0.75rem',
                background: m.status === 'paid' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${m.period === status.currentPeriod ? 'var(--accent)' : 'rgba(255,255,255,0.06)'}` }}>
              {m.status === 'paid' ? <CheckCircle2 size={16} color="#10b981" /> : <Circle size={16} color="var(--text-muted)" />}
              <div style={{ fontWeight: 700, marginTop: 2 }}>{monthLabel(m.period)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={16} color="#10b981" /> Payment history</div>
        {status.history.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No payments yet.</div>}
        {status.history.map(h => (
          <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.82rem' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{monthLabel(h.period)} · {inr(h.amount)}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {h.provider === 'upi_qr' ? `UPI QR ${h.upiReference}` : h.paymentId ? `Razorpay ${h.paymentId}` : 'Awaiting payment'}{h.upiTransactionId ? ` · UPI ref ${h.upiTransactionId}` : ''}{h.mode === 'test' ? ' · test mode' : ''}
              </div>
            </div>
            <span style={{ fontWeight: 700, color: h.status === 'paid' ? '#10b981' : h.status === 'pending_verification' ? '#f59e0b' : h.failureReason ? '#f43f5e' : 'var(--text-secondary)' }}>
              {h.status === 'paid' ? 'Paid' : h.status === 'pending_verification' ? 'Verifying' : h.status === 'rejected' ? 'Rejected' : h.failureReason ? 'Failed' : 'Not paid'}
            </span>
          </div>
        ))}
        <a href="https://dashboard.razorpay.com/app/payments" target="_blank" rel="noreferrer"
          style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, color: '#38bdf8' }}>
          Open Razorpay dashboard <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
