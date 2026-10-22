import { useEffect, useState } from 'react';
import { ShieldCheck, LogOut, RefreshCw, Store, IndianRupee, Clock, CheckCircle2, XCircle, AlertTriangle, Lock } from 'lucide-react';
import { adminApi, ADMIN_TOKEN_KEY } from '../api';

const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const dateLabel = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const monthLabel = (period) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const STATUS_STYLE = {
  paid: { label: 'Paid', color: 'var(--success)', bg: 'var(--success-bg)' },
  pending_verification: { label: 'Needs verification', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  created: { label: 'QR shown, no UTR', color: 'var(--info)', bg: 'var(--info-bg)' },
  unpaid: { label: 'Unpaid', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  rejected: { label: 'Rejected', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  failed: { label: 'Failed', color: 'var(--danger)', bg: 'var(--danger-bg)' }
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || { label: status, color: 'var(--text-secondary)', bg: 'var(--glass)' };
  return <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '10px', fontSize: '0.82rem', borderTop: '1px solid var(--glass-border)', verticalAlign: 'top' };

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.login(username.trim(), password);
      localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
      onLogin();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form className="card" onSubmit={submit} style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '1.2rem', marginBottom: 4 }}>
          <Lock size={20} color="var(--accent)" /> Antarya Platform Admin
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 16 }}>For the platform owner only. Shopkeepers sign in from the main app.</p>
        <div className="input-group">
          <label htmlFor="admin-user">Username</label>
          <input id="admin-user" className="input" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required />
        </div>
        <div className="input-group">
          <label htmlFor="admin-pass">Password</label>
          <input id="admin-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: 12 }}>{error}</div>}
        <button className="btn btn-primary btn-full" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

export default function AdminDashboard() {
  const [loggedIn, setLoggedIn] = useState(() => Boolean(localStorage.getItem(ADMIN_TOKEN_KEY)));
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [utrDrafts, setUtrDrafts] = useState({});

  const logout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setLoggedIn(false);
    setData(null);
  };

  const load = async () => {
    try {
      const [shops, payments] = await Promise.all([adminApi.getShops(), adminApi.getSubscriptionPayments()]);
      setData({ shops, payments: payments.payments, summary: payments.summary });
      setError('');
    } catch (err) {
      if (err.status === 401 || err.status === 403) return logout();
      setError(err.message);
    }
  };

  useEffect(() => {
    document.title = 'Platform Admin – ANTARYA';
    if (loggedIn) load();
  }, [loggedIn]);

  const verify = async (p) => {
    const utr = (utrDrafts[p.id] ?? p.upiTransactionId ?? '').trim();
    if (!utr) return setError(`Enter the UTR from your bank statement for ${p.shopName} before verifying.`);
    if (!window.confirm(`Confirm ${inr(p.amount)} from ${p.shopName} (UTR ${utr}) has reached the platform account?`)) return;
    setBusyId(p.id);
    try {
      await adminApi.verifySubscriptionPayment(p.id, { amountReceived: p.amount, upiTransactionId: utr });
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusyId(null);
  };

  const reject = async (p) => {
    const reason = window.prompt(`Reject the payment from ${p.shopName}? Reason:`, 'Payment not found in bank statement');
    if (reason === null) return;
    setBusyId(p.id);
    try {
      await adminApi.rejectSubscriptionPayment(p.id, reason);
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusyId(null);
  };

  if (!loggedIn) return <AdminLogin onLogin={() => setLoggedIn(true)} />;

  const summary = data?.summary;
  const toVerify = (data?.payments || []).filter(p => p.provider === 'upi_qr' && ['pending_verification', 'created'].includes(p.status));
  const shownPayments = (data?.payments || []).filter(p => !filter || p.status === filter);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={24} color="var(--accent)" /> Platform Admin</h1>
          <p className="page-subtitle">Registered shops and subscription payments received by Antarya.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={14} /> Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LogOut size={14} /> Log out</button>
        </div>
      </div>

      {error && <div className="card" style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}
      {!data && !error && <div className="card">Loading platform data…</div>}

      {summary && (
        <>
          {!summary.platformUpi.configured && (
            <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 8, fontSize: '0.85rem' }}>
              <AlertTriangle size={18} color="var(--warning)" />
              <span>Platform UPI QR is off. Set <code>PLATFORM_UPI_VPA</code> (your UPI ID) and <code>PLATFORM_UPI_NAME</code> in <code>server/.env</code> and restart the server so shopkeepers can pay you by QR.</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { icon: Store, label: 'Registered shops', value: summary.shopCount, sub: `${summary.setupCompleteCount} finished setup` },
              { icon: CheckCircle2, label: `Paid for ${monthLabel(summary.currentPeriod)}`, value: summary.paidShopsThisMonth, sub: `${summary.unpaidShopsThisMonth} unpaid` },
              { icon: IndianRupee, label: 'Total collected', value: inr(summary.totalCollected), sub: `${summary.paidPaymentCount} payments` },
              { icon: IndianRupee, label: 'Collected this month', value: inr(summary.thisMonthCollected), sub: `Plan ${inr(summary.plan.amount)}/month` },
              { icon: Clock, label: 'Awaiting verification', value: summary.pendingVerificationCount, sub: summary.platformUpi.vpa ? `Pays to ${summary.platformUpi.vpa}` : 'UPI QR not set up' }
            ].map(({ icon: Icon, label, value, sub }) => (
              <div key={label} className="card">
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> {label}</div>
                <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>UPI QR payments to verify ({toVerify.length})</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
              Match the reference or UTR against your bank / UPI app statement before verifying. Verifying marks that month paid for the shop.
            </div>
            {toVerify.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nothing to verify.</div>}
            {toVerify.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Shop', 'Month', 'Amount', 'Reference', 'UTR', 'Status', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {toVerify.map(p => (
                      <tr key={p.id}>
                        <td style={td}><div style={{ fontWeight: 600 }}>{p.shopName}</div><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.ownerName} · {p.phone}</div></td>
                        <td style={td}>{monthLabel(p.period)}</td>
                        <td style={td}>{inr(p.amount)}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.75rem' }}>{p.upiReference}</td>
                        <td style={td}>
                          <input className="input" style={{ minWidth: 140, padding: '6px 10px', fontSize: '0.8rem' }} placeholder="UTR from statement"
                            value={utrDrafts[p.id] ?? p.upiTransactionId ?? ''} onChange={e => setUtrDrafts(d => ({ ...d, [p.id]: e.target.value }))} />
                        </td>
                        <td style={td}><StatusPill status={p.status} /></td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <button className="btn btn-success btn-sm" disabled={busyId === p.id} onClick={() => verify(p)} style={{ marginRight: 6 }}><CheckCircle2 size={14} /> Verify</button>
                          <button className="btn btn-ghost btn-sm" disabled={busyId === p.id} onClick={() => reject(p)}><XCircle size={14} /> Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Registered shops ({data.shops.count})</div>
            {data.shops.count === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No shop has registered yet.</div>}
            {data.shops.count > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Shop', 'Owner', 'City', 'Phone', 'Joined', 'Setup', monthLabel(data.shops.currentPeriod), 'Last payment', 'Total paid'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.shops.shops.map(s => (
                      <tr key={s.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{s.name}</td>
                        <td style={td}>{s.ownerName}</td>
                        <td style={td}>{s.city || '—'}</td>
                        <td style={td}>{s.phone}</td>
                        <td style={td}>{dateLabel(s.joinedAt)}</td>
                        <td style={td}>{s.setupComplete ? 'Done' : 'Pending'}</td>
                        <td style={td}><StatusPill status={s.currentMonthStatus} /></td>
                        <td style={td}>{s.lastPayment ? `${inr(s.lastPayment.amount)} for ${monthLabel(s.lastPayment.period)} on ${dateLabel(s.lastPayment.paidAt)}` : '—'}</td>
                        <td style={td}>{inr(s.totalPaid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>All subscription payments ({shownPayments.length})</div>
              <select className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: '0.8rem' }} value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="">All statuses</option>
                {Object.entries(STATUS_STYLE).filter(([k]) => k !== 'unpaid').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {shownPayments.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No payments.</div>}
            {shownPayments.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Shop', 'Month', 'Amount', 'Method', 'Reference / UTR', 'Status', 'Paid on', 'Verified by'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {shownPayments.map(p => (
                      <tr key={p.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{p.shopName}</td>
                        <td style={td}>{monthLabel(p.period)}</td>
                        <td style={td}>{inr(p.amount)}</td>
                        <td style={td}>{p.provider === 'upi_qr' ? 'UPI QR' : `Razorpay${p.mode === 'test' ? ' (test)' : ''}`}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.72rem' }}>{[p.upiReference || p.razorpayPaymentId, p.upiTransactionId].filter(Boolean).join(' · ') || '—'}</td>
                        <td style={td}><StatusPill status={p.status} />{p.failureReason && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{p.failureReason}</div>}</td>
                        <td style={td}>{dateLabel(p.paidAt)}</td>
                        <td style={td}>{p.verifiedBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
