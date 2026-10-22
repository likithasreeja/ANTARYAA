import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { 
  TrendingUp, Package, AlertTriangle,
  Brain, ChevronRight, Zap, ShoppingBag, Wallet, BarChart3,
  Users, ShieldCheck, Sparkles, Send, CheckCircle2,
  Clock, Plus, MessageSquare, PhoneCall, RefreshCw, Trash2,
  DollarSign, Activity, HelpCircle, Eye, QrCode, FileSpreadsheet, CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';
import api from '../api';
import { trackEvent } from '../utils/analytics';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import PaymentQRModal from '../components/PaymentQRModal';

export default function Dashboard() {
  const { shop, showToast, refreshAll } = useStore();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [salesSummary, setSalesSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSeed, setLoadingSeed] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [overview, setOverview] = useState(null);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    trackEvent('dashboard_viewed', { time_of_day: new Date().getHours() });
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [dashboard, summary] = await Promise.all([
        api.getDashboard(),
        api.getSalesSummary()
      ]);
      setData(dashboard);
      setSalesSummary(summary);

      api.getInventoryOverview().catch(() => null).then(setOverview);
      api.getSubscription().catch(() => null).then(setSubscription);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleLoadDemoBusinessData = async () => {
    setLoadingSeed(true);
    try {
      const res = await api.seedDemoBusiness();
      trackEvent('demo_data_loaded', {
        customers: res.customersCount,
        products: res.productsCount,
        sales: res.salesCount
      });
      showToast(res.message || 'Store business records loaded successfully. 🎉', 'success');
      await loadDashboardData();
      if (refreshAll) refreshAll();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to load store business records', 'error');
    }
    setLoadingSeed(false);
  };

  const handleClearDemoData = async () => {
    try {
      await api.clearDemoData(false);
      showToast('Store business records cleared successfully.', 'success');
      setShowClearModal(false);
      await loadDashboardData();
      if (refreshAll) refreshAll();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to clear store records', 'error');
    }
  };

  const fmt = (amount) => `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  if (loading || !data) {
    return (
      <div className="page" style={{ paddingTop: 20 }}>
        <div className="bento-grid">
          <div className="col-span-12 bento-card" style={{ height: 180 }}><Skeleton height="100%" baseColor="#131030" highlightColor="#1e1848" borderRadius={20} /></div>
          <div className="col-span-6 bento-card" style={{ height: 300 }}><Skeleton height="100%" baseColor="#131030" highlightColor="#1e1848" borderRadius={20} /></div>
          <div className="col-span-6 bento-card" style={{ height: 300 }}><Skeleton height="100%" baseColor="#131030" highlightColor="#1e1848" borderRadius={20} /></div>
        </div>
      </div>
    );
  }

  const totalProducts = typeof data.totalProducts === 'number' ? data.totalProducts : 0;
  const lowStockCount = data.lowStockItems?.length || 0;
  const totalCustomers = data.totalCustomers || 0;
  const totalLifetimeRevenue = data.totalRevenue || 0;
  const healthScore = totalProducts === 0 ? 100 : (lowStockCount === 0 ? 100 : lowStockCount <= 2 ? 96 : 84);

  const plan = overview?.plan || null;
  const lowStockItem = data.lowStockItems?.[0] || null;
  const pct = (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—');

  const posDays = salesSummary?.dailyBreakdown || [];
  const hasPosSales = posDays.some(d => (d.total || 0) > 0);
  const datasetTrend = overview?.hasData ? overview.dailyTrend || [] : [];
  const datasetHasRevenue = datasetTrend.some(d => d.revenue > 0);

  // POS bills take priority; otherwise chart the uploaded sheet; never invent numbers
  const chartSource = hasPosSales ? 'pos' : datasetTrend.length > 0 ? 'dataset' : 'none';
  const chartKey = chartSource === 'dataset' && !datasetHasRevenue ? 'units' : 'revenue';
  const chartData = chartSource === 'pos'
    ? posDays.map((d, i) => ({ name: d.day, revenue: d.total || 0, isToday: i === posDays.length - 1 }))
    : chartSource === 'dataset'
      ? datasetTrend.map((d, i) => ({ name: d.date.slice(5), revenue: d.revenue, units: d.units, isToday: i === datasetTrend.length - 1 }))
      : [];

  const monthLabel = (period) => new Date(`${period}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });

  return (
    <div className="page" style={{ paddingTop: 16, paddingBottom: 80 }}>
      
      {/* ─── TOP STORE CONTROLS BANNER ─── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))',
        border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '18px', padding: '14px 20px',
        marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
            STORE DIRECTORY READY
          </span>
          <span style={{ fontSize: '0.86rem', color: 'white', fontWeight: 700 }}>
            {data.hasDemoData ? '⚡ Sample Customer Records & Sales Synced' : '⚡ Load Sample Customer Records & Sales Data'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn"
            onClick={handleLoadDemoBusinessData}
            disabled={loadingSeed}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: 'white', fontWeight: 700, padding: '8px 14px', borderRadius: '10px',
              fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, border: 'none'
            }}
          >
            <RefreshCw size={14} className={loadingSeed ? 'animate-spin' : ''} />
            {loadingSeed ? 'Syncing...' : 'Reload Sample Records'}
          </button>

          {data.hasDemoData && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowClearModal(true)}
              style={{ color: '#fb7185', background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', fontSize: '0.82rem' }}
            >
              <Trash2 size={14} /> Reset Store Records
            </button>
          )}
        </div>
      </div>

      {/* ─── HERO COMMAND CENTER BANNER ─── */}
      <div className="bento-grid" style={{ marginBottom: 24 }}>
        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="col-span-12 bento-card kirana-hero"
          style={{ padding: '26px 32px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={15} /> {greeting}
              </span>
              <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
                {data.ownerName || data.shopName || 'Kirana Command Center'}
              </h1>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowQRModal(true)}
                className="btn"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white', fontWeight: 800, padding: '8px 16px', borderRadius: '30px',
                  fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: 7, border: 'none',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)', cursor: 'pointer'
                }}
              >
                <QrCode size={17} /> Pay via UPI QR
              </button>
              <div style={{ background: 'rgba(16, 185, 129, 0.18)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '30px', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} color="#34d399" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399' }}>Store Health: {healthScore}/100 • Secure</span>
              </div>
            </div>
          </div>

          {/* Symmetrical 5-Column Overview Inside Hero Banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, paddingTop: 18, borderTop: '1px solid rgba(255, 255, 255, 0.15)' }}>
            
            {/* Box 1: Total Revenue */}
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 18px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={15} color="#34d399" /> Sales Revenue
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: '#34d399', margin: '4px 0 0' }}>
                {fmt(totalLifetimeRevenue)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 600, marginTop: 2 }}>
                Collected: {fmt(data.totalMoneyCollected)}
              </div>
            </div>

            {/* Box 2: Total Customers */}
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 18px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} color="#38bdf8" /> Customers
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: '4px 0 0' }}>
                {totalCustomers || 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>active</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {data.repeatCustomers || 0} repeat buyers
              </div>
            </div>

            {/* Box 3: Total Orders */}
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 18px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShoppingBag size={15} color="#c084fc" /> Total Orders
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: '4px 0 0' }}>
                {data.totalOrders || 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>bills</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#fb7185', fontWeight: 600, marginTop: 2 }}>
                Balance: {fmt(data.totalCreditOutstanding)}
              </div>
            </div>

            {/* Box 4: Average Order Value */}
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 18px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DollarSign size={15} color="#fbbf24" /> Avg Order Value
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: '#fbbf24', margin: '4px 0 0' }}>
                {fmt(data.averageOrderValue)}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Per basket size
              </div>
            </div>

            {/* Box 5: Inventory Valuation */}
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 18px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Package size={15} color="#34d399" /> Inventory Value
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: '4px 0 0' }}>
                {fmt(data.inventoryValue)}
              </div>
              <div style={{ fontSize: '0.7rem', color: lowStockCount > 0 ? '#fbbf24' : '#34d399', fontWeight: 600, marginTop: 2 }}>
                {totalProducts} SKUs • {lowStockCount} low
              </div>
            </div>

          </div>
        </motion.div>
      </div>

      {/* ─── ROW 2: CATBOOST TWO-STAGE PREDICTION SPOTLIGHT + SALES CHART ─── */}
      <div className="bento-grid" style={{ marginBottom: 24 }}>
        
        {/* Left Col 6: CatBoost Two-Stage Hurdle Spotlight Card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}
          className="col-span-6 bento-card kirana-yellow"
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 300 }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ background: 'rgba(244,63,94,0.2)', border: '1px solid #fb7185', color: '#fb7185', fontSize: '0.76rem', fontWeight: 800, padding: '5px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚡ INVENTORY PLAN FROM YOUR SHEETS
              </span>
              {plan && (
                <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700 }}>
                  {plan.market} • {plan.method === 'catboost' ? 'CatBoost' : 'Moving average'}
                </span>
              )}
            </div>

            {plan ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700 }}>PRODUCTS TO ORDER</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#34d399' }}>{plan.summary?.products_to_order ?? 0}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      {plan.summary?.total_order_cost != null ? `Cash needed ${fmt(plan.summary.total_order_cost)}` : `Order value ${fmt(plan.summary?.total_order_value)}`}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700 }}>FORECAST ERROR (WMAPE)</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#38bdf8' }}>{pct(plan.validation?.catboost_wmape)}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      {plan.validation ? `vs ${pct(plan.validation.baseline_wmape)} moving average` : 'Not enough history to test'}
                    </div>
                  </div>
                </div>

                {(plan.topProducts || []).slice(0, 3).map(p => (
                  <div key={p.product} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '4px 0' }}>
                    <span style={{ color: 'white', fontWeight: 700 }}>{p.product}</span>
                    <span>Order <strong style={{ color: '#fb7185' }}>{p.order_quantity}</strong> • hold {p.recommended_stock}</span>
                  </div>
                ))}
                {plan.upcomingFestivals?.length > 0 && (
                  <p style={{ fontSize: '0.78rem', color: '#fbbf24', margin: '10px 0 0' }}>
                    🎉 In plan window: {plan.upcomingFestivals.slice(0, 3).map(f => `${f.name} (${f.date.slice(5)})`).join(', ')}
                  </p>
                )}
              </>
            ) : lowStockItem ? (
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                <strong style={{ color: '#fbbf24' }}>{lowStockItem.name}</strong> is low: {lowStockItem.quantity} left (minimum {lowStockItem.minStock}).
                Upload your sales Excel in the Inventory Planner to get a forecast-based order quantity.
              </p>
            ) : (
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                No plan yet. Upload a sales Excel/CSV (date, product, quantity — plus price, cost, discount or festival columns if you have them)
                and Antarya will calculate how much of each product to stock.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => navigate('/inventory-planner')}
              className="btn btn-primary"
              style={{ flex: 1, padding: '12px 16px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {plan ? 'Open full inventory plan →' : 'Upload sales Excel →'}
            </button>
            <button
              onClick={() => navigate('/product-analytics')}
              className="btn btn-secondary"
              style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 700 }}
            >
              Product Analytics
            </button>
          </div>
        </motion.div>

        {/* Right Col 6: 7-Day Revenue Chart */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }}
          className="col-span-6 bento-card kirana-green"
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 300 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={20} color="#34d399" />
                {chartSource === 'dataset' ? `Uploaded sheet: last ${chartData.length} days` : '7-Day Revenue'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                {chartSource === 'pos' && 'Bills recorded in Antarya POS'}
                {chartSource === 'dataset' && `${overview.market} • ${chartKey === 'units' ? 'units sold (no price column)' : 'revenue from quantity × price'}`}
                {chartSource === 'none' && 'No sales recorded yet'}
              </p>
            </div>
            <span style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '10px', background: 'rgba(16,185,129,0.2)', color: '#34d399', fontWeight: 700 }}>
              {chartSource === 'dataset' ? 'Excel data' : chartSource === 'pos' ? 'POS data' : 'Empty'}
            </span>
          </div>

          {chartSource === 'none' ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.86rem', padding: 20 }}>
              Create a bill or upload a sales sheet in the Inventory Planner to see your sales trend here.
            </div>
          ) : (
          <div style={{ height: 180, width: '100%', marginTop: 'auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} fontWeight={600} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={v => (chartKey === 'units' ? v : v >= 1000 ? `₹${+(v / 1000).toFixed(1)}k` : `₹${v}`)} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                  contentStyle={{ background: '#0c0a1e', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'white', fontSize: '0.85rem', fontWeight: 700 }}
                  formatter={(val) => (chartKey === 'units' ? [val.toLocaleString('en-IN'), 'Units'] : [`₹${val.toLocaleString('en-IN')}`, 'Revenue'])}
                />
                <Bar dataKey={chartKey} radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.isToday ? '#34d399' : 'rgba(255, 255, 255, 0.25)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </motion.div>

      </div>

      {/* ─── ROW: UPLOADED DATASET + MONTHLY SUBSCRIPTION PROGRESS ─── */}
      <div className="bento-grid" style={{ marginBottom: 24 }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.18 }}
          className="col-span-6 bento-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileSpreadsheet size={20} color="#38bdf8" /> Your Uploaded Sales Data
            </h3>
            {overview?.hasData && (
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {overview.totals.dateFrom} → {overview.totals.dateTo}
              </span>
            )}
          </div>

          {overview?.hasData ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                {[
                  { label: 'Units sold', value: overview.totals.units.toLocaleString('en-IN') },
                  { label: 'Revenue', value: overview.totals.revenue != null ? fmt(overview.totals.revenue) : 'No price column' },
                  { label: 'Gross profit', value: overview.totals.grossProfit != null ? fmt(overview.totals.grossProfit) : 'No cost column' },
                  { label: 'Products', value: overview.totals.products },
                ].map(k => (
                  <div key={k.label} style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: 12 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{k.label}</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'white' }}>{k.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {overview.market} • {overview.totals.files} file{overview.totals.files === 1 ? '' : 's'} • {overview.totals.rows.toLocaleString('en-IN')} rows
                {overview.markets.length > 1 && ` • ${overview.markets.length} markets uploaded`}
              </div>
              <div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>Best sellers</div>
                {overview.topProducts.slice(0, 5).map(p => (
                  <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', padding: '3px 0' }}>
                    <span style={{ color: 'white' }}>{p.name}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{p.units.toLocaleString('en-IN')} units{p.revenue > 0 ? ` • ${fmt(p.revenue)}` : ''}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>
              No sales sheets uploaded yet. Your dashboard will show totals, best sellers and the daily trend from your Excel once you upload it.
              <div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/inventory-planner')}>
                  Upload Excel / CSV
                </button>
              </div>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}
          className="col-span-6 bento-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={20} color="#34d399" /> Monthly Subscription
            </h3>
            {subscription?.mode === 'test' && (
              <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: 8, background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }}>TEST MODE</span>
            )}
          </div>

          {subscription ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 900, color: subscription.currentPaid ? '#34d399' : '#fbbf24' }}>
                  {subscription.currentPaid ? `${monthLabel(subscription.currentPeriod)} paid ✓` : `${monthLabel(subscription.currentPeriod)} due`}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {fmt(subscription.plan.amount)}/month • {subscription.paidMonthsLast12}/12 months paid • {fmt(subscription.totalPaid)} total
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ width: `${(subscription.paidMonthsLast12 / 12) * 100}%`, height: '100%', background: '#34d399' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
                {subscription.months.map(m => (
                  <div key={m.period} title={`${m.period}: ${m.status}`} style={{
                    textAlign: 'center', fontSize: '0.62rem', fontWeight: 700, padding: '6px 0', borderRadius: 6,
                    background: m.status === 'paid' ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.05)',
                    color: m.status === 'paid' ? '#34d399' : 'var(--text-secondary)',
                    border: m.period === subscription.currentPeriod ? '1px solid #fbbf24' : '1px solid transparent'
                  }}>
                    {monthLabel(m.period)}
                  </div>
                ))}
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/subscription')} style={{ alignSelf: 'flex-start' }}>
                {!subscription.configured ? 'Set up Razorpay payments →' : subscription.currentPaid ? 'View payment history →' : 'Pay by UPI QR →'}
              </button>
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Subscription status unavailable.</div>
          )}
        </motion.div>
      </div>

      {/* ─── ROW 3: QUICK HUBS (CUSTOMERS, ANALYTICS, BILLING, MONEY) ─── */}
      <div className="bento-grid" style={{ marginBottom: 24 }}>
        
        {/* Left Col 6: Quick Action Buttons Hub */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}
          className="col-span-6 bento-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'white' }}>🛠️ Store Management Hub</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Instant 1-click access</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Customers CRM', sub: 'Directory & Outstanding Khata', icon: <Users size={22} />, color: '#ec4899', bg: 'rgba(236,72,153,0.18)', path: '/customers' },
              { label: 'UPI QR & Payments', sub: 'Verified Ledger & Scanner', icon: <QrCode size={22} />, color: '#10b981', bg: 'rgba(16,185,129,0.18)', path: '/payments' },
              { label: 'Product Analytics', sub: 'Turnover & Demand KPIs', icon: <BarChart3 size={22} />, color: '#38bdf8', bg: 'rgba(56,189,248,0.18)', path: '/product-analytics' },
              { label: 'Create Bill', sub: 'POS Checkout', icon: <ShoppingBag size={22} />, color: '#fbbf24', bg: 'rgba(251,191,36,0.18)', path: '/sale' },
            ].map((act, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(act.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px', borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
                  cursor: 'pointer', color: 'white', textAlign: 'left'
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: '12px', background: act.bg, color: act.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {act.icon}
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'white' }}>{act.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{act.sub}</div>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Right Col 6: Recent Transactions Feed */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.25 }}
          className="col-span-6 bento-card" style={{ display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={20} color="var(--accent)" /> Recent Customer Bills
            </h3>
            <span 
              onClick={() => navigate('/money')}
              style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              View Cashbook <ChevronRight size={15} />
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 220 }}>
            {(salesSummary?.recentSales && salesSummary.recentSales.length > 0) ? (
              salesSummary.recentSales.slice(0, 4).map((sale, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.035)',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(16,185,129,0.15)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ShoppingBag size={17} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'white' }}>
                        {sale.items?.map(it => it.name).join(', ') || 'Customer Store Sale'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {new Date(sale.timestamp || sale.createdAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} • 
                        <span style={{ textTransform: 'uppercase', color: sale.method === 'udhaar' ? '#f43f5e' : '#34d399', fontWeight: 700, marginLeft: 4 }}>
                          {sale.method}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 900, color: '#34d399' }}>
                      {fmt(sale.amount || sale.total)}
                    </div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#34d399' }}>
                      Completed ✓
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                No bills recorded today. Click 'Create Bill' or 'Reload Sample Records'.
              </div>
            )}
          </div>
        </motion.div>

      </div>

      {/* ─── MODAL: RESET STORE DATA CONFIRMATION ─── */}
      <AnimatePresence>
        {showClearModal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
            zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
          }}>
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              style={{
                background: '#0f172a', width: '100%', maxWidth: 440, borderRadius: '24px',
                padding: 24, border: '1px solid rgba(244,63,94,0.3)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(244,63,94,0.2)', color: '#fb7185', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>Reset Store Business Records?</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Confirmation required</p>
                </div>
              </div>

              <p style={{ fontSize: '0.86rem', color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 20px' }}>
                This will reset all customer records, sales transactions, and payment history back to the initial verified state. Are you sure?
              </p>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowClearModal(false)}>
                  Cancel
                </button>
                <button className="btn" style={{ flex: 1, background: '#f43f5e', color: 'white', fontWeight: 800, border: 'none', borderRadius: '12px' }} onClick={handleClearDemoData}>
                  Yes, Reset Store Records
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PaymentQRModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        suggestedAmount={0}
        customerName=""
        note="Store counter payment"
        onPaymentSuccess={() => {
          loadDashboardData();
          if (refreshAll) refreshAll();
        }}
      />

    </div>
  );
}
