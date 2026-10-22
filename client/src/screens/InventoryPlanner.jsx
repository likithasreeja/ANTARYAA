import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, Trash2, Calculator, Download, AlertTriangle, CheckCircle2, Store, PartyPopper, Percent } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import api from '../api';
import { trackEvent } from '../utils/analytics';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ACCEPTED = '.xlsx,.xls,.xlsm,.csv';

const FIELDS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'product', label: 'Product', required: true },
  { key: 'quantity', label: 'Quantity sold', required: true },
  { key: 'category', label: 'Category', required: false },
  { key: 'price', label: 'Selling price', required: false },
  { key: 'stock', label: 'Stock on hand', required: false },
  { key: 'cost', label: 'Cost / purchase price', required: false },
  { key: 'discount', label: 'Discount (% or ₹)', required: false },
  { key: 'festival', label: 'Festival / holiday', required: false },
  { key: 'promotion', label: 'Promotion / offer', required: false },
];

const FEATURE_LABELS = {
  lag_1: 'Yesterday\'s sales', lag_7: 'Sales a week ago', lag_14: 'Sales two weeks ago',
  mean_7: 'Last 7-day average', mean_28: 'Last 28-day average', std_7: 'Recent ups and downs',
  same_weekday_mean_4w: 'Same weekday, last 4 weeks', zero_share_28: 'Days with no sales',
  days_since_first_sale: 'Product age', day_of_week: 'Day of week', day_of_month: 'Day of month',
  month: 'Month', is_weekend: 'Weekend', is_salary_week: 'Salary week', is_month_end: 'Month end',
  price: 'Selling price', price_vs_usual: 'Price vs usual', discount_pct: 'Discount',
  on_promotion: 'Promotion', is_festival: 'Festival day', days_to_festival: 'Days to festival',
  days_after_festival: 'Days after festival', festival_importance: 'Festival size',
  product: 'Product', category: 'Category',
};

const effectText = (e) => (e ? `${e.uplift_pct > 0 ? '+' : ''}${e.uplift_pct}% sales (${e.days} days)` : 'Not enough data yet');

const STATUS = {
  critical: { label: 'Order now', color: '#f43f5e', bg: 'rgba(244,63,94,0.15)', hint: 'Will run out before a new delivery arrives' },
  reorder: { label: 'Reorder', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', hint: 'Below the recommended stock level' },
  stock_unknown: { label: 'Stock unknown', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)', hint: 'No current stock found; order equals full recommended stock' },
  ok: { label: 'OK', color: '#10b981', bg: 'rgba(16,185,129,0.15)', hint: 'Enough stock for the period' },
  overstock: { label: 'Overstocked', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', hint: 'More than twice the recommended stock' },
  slow_moving: { label: 'Not selling', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', hint: 'No sales in the last 28 days' },
};

const fmt = (n, digits = 1) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: digits }));

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function exportPlanCsv(plan) {
  const header = ['Product', 'Category', 'Avg daily sales (last 28d)', `Forecast next ${plan.settings.forecast_horizon_days} days`,
    'Safety stock', 'Should have in stock', 'Current stock', 'Order quantity', 'Unit price', 'Unit cost', 'Discount %',
    'Margin %', 'Estimated order value', 'Cash needed (at cost)', 'Expected profit', 'Status'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...plan.products.map(p => [
    p.product, p.category, p.avg_daily_sales_last_28d, p.forecast_period_demand, p.safety_stock,
    p.recommended_stock, p.current_stock, p.order_quantity, p.unit_price, p.unit_cost, p.discount_pct, p.margin_pct,
    p.estimated_order_value, p.estimated_order_cost, p.expected_profit, STATUS[p.status].label,
  ])].map(row => row.map(esc).join(','));
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventory-plan-${plan.market.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InventoryPlanner() {
  const { shop, showToast } = useStore();
  const fileInputRef = useRef(null);
  const [markets, setMarkets] = useState([]);
  const [market, setMarket] = useState('');
  const [newMarket, setNewMarket] = useState('');
  const [uploads, setUploads] = useState([]);
  const [pending, setPending] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [settings, setSettings] = useState({ reviewDays: 7, leadTimeDays: 2, serviceLevel: 0.95, plannedDiscountPct: '', localFestivalDates: '' });
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadMarkets = async (preferred) => {
    try {
      const list = await api.getInventoryMarkets();
      setMarkets(list);
      setMarket(current => preferred || current || list[0]?.market || shop?.name || 'My Market');
    } catch (err) {
      showToast(err.message, 'error');
      setMarket(current => current || shop?.name || 'My Market');
    }
  };

  const loadUploads = async (m) => {
    if (!m) return;
    try {
      setUploads(await api.getInventoryUploads(m));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => { loadMarkets(); }, []);
  useEffect(() => { setPlan(null); setPlanError(''); loadUploads(market); }, [market]);

  const updatePending = (id, patch) => setPending(list => list.map(p => (p.id === id ? { ...p, ...patch } : p)));

  const addFiles = async (fileList) => {
    for (const file of Array.from(fileList)) {
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      if (file.size > MAX_FILE_BYTES) {
        showToast(`${file.name} is larger than 15 MB`, 'error');
        continue;
      }
      setPending(list => [...list, { id, fileName: file.name, status: 'reading' }]);
      try {
        const fileBase64 = await readAsBase64(file);
        const preview = await api.previewInventorySheet(file.name, fileBase64);
        updatePending(id, { status: 'ready', fileBase64, preview, mapping: preview.suggested_mapping });
      } catch (err) {
        updatePending(id, { status: 'error', error: err.message });
      }
    }
  };

  const saveFile = async (item) => {
    const missing = FIELDS.filter(f => f.required && !item.mapping?.[f.key]).map(f => f.label);
    if (missing.length) {
      updatePending(item.id, { error: `Select a column for: ${missing.join(', ')}` });
      return;
    }
    updatePending(item.id, { status: 'saving', error: '' });
    try {
      const res = await api.uploadInventorySheet({ market, fileName: item.fileName, fileBase64: item.fileBase64, mapping: item.mapping });
      setPending(list => list.filter(p => p.id !== item.id));
      const skipped = res.stats.skipped_rows ? `, ${res.stats.skipped_rows} rows skipped` : '';
      showToast(`${item.fileName}: ${res.stats.valid_rows} sales rows added${skipped}`);
      trackEvent('inventory_excel_uploaded', { rows: res.stats.valid_rows, products: res.stats.product_count });
      setPlan(null);
      await Promise.all([loadUploads(market), loadMarkets(market)]);
    } catch (err) {
      updatePending(item.id, { status: 'ready', error: err.message });
    }
  };

  const removeUpload = async (upload) => {
    if (!window.confirm(`Remove ${upload.fileName} and its ${upload.rowCount} sales rows from ${upload.market}?`)) return;
    try {
      await api.deleteInventoryUpload(upload.id);
      setPlan(null);
      await Promise.all([loadUploads(market), loadMarkets(market)]);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const calculate = async () => {
    setPlanLoading(true);
    setPlanError('');
    try {
      const result = await api.getInventoryPlan({ market, ...settings });
      setPlan(result);
      trackEvent('inventory_plan_generated', { method: result.method, products: result.data.products });
    } catch (err) {
      setPlanError(err.message);
    }
    setPlanLoading(false);
  };

  const createMarket = () => {
    const name = newMarket.replace(/\s+/g, ' ').trim();
    if (!name) return;
    setMarket(name);
    setNewMarket('');
  };

  const marketOptions = Array.from(new Set([market, ...markets.map(m => m.market)].filter(Boolean)));
  const visibleProducts = plan ? plan.products.filter(p => statusFilter === 'all' || p.status === statusFilter) : [];

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <h1 className="page-title">Inventory Planner</h1>
      <p className="page-subtitle">Upload sales Excel sheets. A CatBoost model learns from all of them (price, discount, promotions, festivals, weekdays, salary days) and tells you what to stock and how much.</p>

      {/* Market */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontWeight: 700 }}>
          <Store size={18} color="var(--accent)" /> Market
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select className="input" value={market} onChange={e => setMarket(e.target.value)} style={{ flex: '1 1 220px' }}>
            {marketOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className="input" placeholder="New market name" value={newMarket} onChange={e => setNewMarket(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createMarket()} style={{ flex: '1 1 200px' }} />
          <button className="btn btn-secondary" onClick={createMarket} disabled={!newMarket.trim()}>Use new market</button>
        </div>
      </div>

      {/* Upload */}
      <div
        className="card"
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        style={{ marginBottom: 16, cursor: 'pointer', textAlign: 'center', padding: 28, border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--glass-border)'}` }}
      >
        <Upload size={32} color="var(--accent)" />
        <h3 style={{ margin: '10px 0 4px' }}>Add sales sheets to "{market}"</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
          Drop or select any number of .xlsx / .xls / .csv files. Each needs a date, product and quantity column.
          New files add to the market's history.
        </p>
        <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {/* Pending files: mapping + preview */}
      {pending.map(item => (
        <div key={item.id} className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, minWidth: 0 }}>
              <FileSpreadsheet size={18} color="#10b981" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.fileName}</span>
              {item.preview && <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.8rem' }}>
                {item.preview.row_count} rows · sheet "{item.preview.sheet_name}"
              </span>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setPending(list => list.filter(p => p.id !== item.id))}>Discard</button>
          </div>

          {item.status === 'reading' && <p style={{ color: 'var(--text-secondary)' }}>Reading file…</p>}
          {item.error && <p style={{ color: '#f43f5e', fontSize: '0.85rem', margin: '0 0 12px' }}>{item.error}</p>}

          {item.preview && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
                {FIELDS.map(f => (
                  <label key={f.key} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {f.label}{f.required ? ' *' : ' (optional)'}
                    <select className="input" value={item.mapping?.[f.key] || ''} style={{ marginTop: 4 }}
                      onChange={e => updatePending(item.id, { mapping: { ...item.mapping, [f.key]: e.target.value || null }, error: '' })}>
                      <option value="">— not in sheet —</option>
                      {item.preview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr>{item.preview.columns.map(c => <th key={c} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {item.preview.preview.slice(0, 5).map((row, i) => (
                      <tr key={i}>{item.preview.columns.map(c => <td key={c} style={{ padding: 6, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>{row[c]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-primary" onClick={() => saveFile(item)} disabled={item.status === 'saving'}>
                {item.status === 'saving' ? 'Saving…' : `Add to ${market}`}
              </button>
            </>
          )}
        </div>
      ))}

      {/* Uploaded files */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Files in "{market}" ({uploads.length})</div>
        {uploads.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>No sheets uploaded for this market yet.</p>}
        {uploads.map(u => (
          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.fileName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {u.rowCount} rows · {u.productCount} products · {u.dateFrom} → {u.dateTo}{u.skippedRows ? ` · ${u.skippedRows} skipped` : ''}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => removeUpload(u)} title="Remove file" style={{ color: '#f43f5e' }}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>

      {/* Settings + calculate */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Restock every (days)
            <input className="input" type="number" min={1} max={60} value={settings.reviewDays} style={{ marginTop: 4 }}
              onChange={e => setSettings(s => ({ ...s, reviewDays: Math.min(60, Math.max(1, Number(e.target.value) || 1)) }))} />
          </label>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Supplier delivery time (days)
            <input className="input" type="number" min={0} max={30} value={settings.leadTimeDays} style={{ marginTop: 4 }}
              onChange={e => setSettings(s => ({ ...s, leadTimeDays: Math.min(30, Math.max(0, Number(e.target.value) || 0)) }))} />
          </label>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Avoid running out
            <select className="input" value={settings.serviceLevel} style={{ marginTop: 4 }}
              onChange={e => setSettings(s => ({ ...s, serviceLevel: Number(e.target.value) }))}>
              <option value={0.9}>90% of the time</option>
              <option value={0.95}>95% of the time</option>
              <option value={0.98}>98% of the time</option>
            </select>
          </label>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }} title="Leave blank to keep each product's latest discount">
            Planned discount next period (%)
            <input className="input" type="number" min={0} max={90} placeholder="Keep current" value={settings.plannedDiscountPct} style={{ marginTop: 4 }}
              onChange={e => setSettings(s => ({ ...s, plannedDiscountPct: e.target.value === '' ? '' : Math.min(90, Math.max(0, Number(e.target.value) || 0)) }))} />
          </label>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', gridColumn: 'span 2' }} title="Major Indian festivals are built in; add local ones here">
            Local festival dates (YYYY-MM-DD, comma separated)
            <input className="input" placeholder="e.g. 2026-10-05, 2026-10-06" value={settings.localFestivalDates} style={{ marginTop: 4 }}
              onChange={e => setSettings(s => ({ ...s, localFestivalDates: e.target.value }))} />
          </label>
        </div>
        <button className="btn btn-primary" onClick={calculate} disabled={planLoading || uploads.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calculator size={18} /> {planLoading ? 'Training CatBoost on your sales…' : 'Calculate inventory'}
        </button>
        {planError && <p style={{ color: '#f43f5e', fontSize: '0.85rem', margin: '10px 0 0' }}>{planError}</p>}
      </div>

      {plan && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="card"><div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Model</div>
              <div style={{ fontWeight: 800 }}>{plan.method === 'catboost' ? 'CatBoost' : 'Moving average'}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{plan.data.history_days} days · {plan.data.uploads} files · {plan.data.rows} rows</div></div>
            <div className="card"><div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Products to order</div>
              <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{plan.summary.products_to_order} / {plan.data.products}</div></div>
            <div className="card"><div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Estimated order value</div>
              <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>₹{fmt(plan.summary.total_order_value, 0)}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>At selling price, products with a price column</div></div>
            {plan.summary.total_order_cost !== null && plan.summary.total_order_cost !== undefined && (
              <div className="card"><div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cash needed for this order</div>
                <div style={{ fontWeight: 800, fontSize: '1.4rem' }}>₹{fmt(plan.summary.total_order_cost, 0)}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Expected profit in period: ₹{fmt(plan.summary.expected_profit, 0)}</div></div>
            )}
            {plan.validation && (
              <div className="card"><div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Accuracy check (last {plan.validation.holdout_days} days)</div>
                <div style={{ fontWeight: 800 }}>{fmt(plan.validation.catboost_wmape)}% error</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Moving average: {fmt(plan.validation.baseline_wmape)}%</div></div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><PartyPopper size={16} color="#f59e0b" /> Upcoming festivals</div>
              {plan.upcoming_festivals.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>None in the next 30 days.</div>}
              {plan.upcoming_festivals.slice(0, 5).map(f => {
                const inPlan = f.date <= plan.forecast_dates[plan.forecast_dates.length - 1];
                return (
                  <div key={f.date + f.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '3px 0' }}>
                    <span>{f.name}</span>
                    <span style={{ color: inPlan ? '#f59e0b' : 'var(--text-muted)' }}>{f.date}{inPlan ? ' · in this plan' : ''}</span>
                  </div>
                );
              })}
            </div>
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Percent size={16} color="#38bdf8" /> What changes your sales</div>
              <div style={{ fontSize: '0.8rem', display: 'grid', gap: 4 }}>
                <div>Festival days: <strong>{effectText(plan.attribute_effects.festival)}</strong></div>
                <div>Discount days: <strong>{plan.attributes_used.discount ? effectText(plan.attribute_effects.discount) : 'No discount column mapped'}</strong></div>
                <div>Promotion days: <strong>{plan.attributes_used.promotion ? effectText(plan.attribute_effects.promotion) : 'No promotion column mapped'}</strong></div>
              </div>
              {plan.feature_importance.length > 0 && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  CatBoost relies most on: {plan.feature_importance.slice(0, 5).map(f => FEATURE_LABELS[f.feature] || f.feature).join(', ')}
                </div>
              )}
            </div>
          </div>

          {plan.notes.length > 0 && (
            <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(245,158,11,0.35)' }}>
              {plan.notes.map((n, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: i < plan.notes.length - 1 ? 8 : 0 }}>
                  <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} /> {n}
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>
                What to stock for the next {plan.settings.forecast_horizon_days} days
                <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.78rem' }}> ({plan.forecast_dates[0]} → {plan.forecast_dates[plan.forecast_dates.length - 1]})</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 10px' }}>
                  <option value="all">All products</option>
                  {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label} ({plan.summary.status_counts[k]})</option>)}
                </select>
                <button className="btn btn-secondary btn-sm" onClick={() => exportPlanCsv(plan)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Download size={15} /> Export for Excel
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: 8 }}>Product</th>
                    <th style={{ padding: 8 }} title="Average units sold per day over the last 28 days">Avg/day</th>
                    <th style={{ padding: 8 }} title="CatBoost forecast of units sold in the planning period">Forecast</th>
                    <th style={{ padding: 8 }} title="Extra buffer for unexpected demand">Safety</th>
                    <th style={{ padding: 8 }} title="Stock level to hold = forecast + safety stock">Should have</th>
                    <th style={{ padding: 8 }}>In stock</th>
                    <th style={{ padding: 8 }}>Order</th>
                    <th style={{ padding: 8 }}>Cover (days)</th>
                    <th style={{ padding: 8 }} title="Profit per unit after discount, as % of selling price (needs a cost column)">Margin</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map(p => {
                    const s = STATUS[p.status];
                    return (
                      <tr key={p.product} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: 8 }}>
                          <div style={{ fontWeight: 600 }}>{p.product}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.category}</div>
                        </td>
                        <td style={{ padding: 8 }}>{fmt(p.avg_daily_sales_last_28d)}</td>
                        <td style={{ padding: 8 }}>{fmt(p.forecast_period_demand)}</td>
                        <td style={{ padding: 8 }}>{fmt(p.safety_stock)}</td>
                        <td style={{ padding: 8, fontWeight: 700 }}>{fmt(p.recommended_stock)}</td>
                        <td style={{ padding: 8 }} title={p.stock_source === 'uploaded_sheet' ? `From uploaded sheet (${p.stock_as_of})` : p.stock_source === 'shop_inventory' ? 'From your shop inventory' : ''}>
                          {fmt(p.current_stock)}{p.stock_source === 'uploaded_sheet' ? '*' : ''}
                        </td>
                        <td style={{ padding: 8, fontWeight: 800, color: p.order_quantity > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{fmt(p.order_quantity)}</td>
                        <td style={{ padding: 8 }}>{fmt(p.days_of_cover)}</td>
                        <td style={{ padding: 8, color: p.margin_pct !== null && p.margin_pct < 0 ? '#f43f5e' : undefined }}
                          title={p.discount_pct ? `${p.discount_pct}% discount applied` : ''}>
                          {p.margin_pct === null ? '—' : `${fmt(p.margin_pct)}%`}
                        </td>
                        <td style={{ textAlign: 'left', padding: 8 }}>
                          <span title={s.hint} style={{ background: s.bg, color: s.color, padding: '3px 8px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '10px 0 0', display: 'flex', gap: 6, alignItems: 'center' }}>
              <CheckCircle2 size={13} /> "Should have" = forecast demand until the next restock (including delivery time) + safety stock.
              "Order" = should have − in stock. * stock taken from the latest uploaded sheet.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
