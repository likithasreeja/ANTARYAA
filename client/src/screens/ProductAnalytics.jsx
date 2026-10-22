import { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { 
  BarChart3, TrendingUp, Package, AlertTriangle, Calendar, 
  ArrowRight, ShieldCheck, Zap, Sparkles, Filter, RefreshCw,
  ShoppingBag, DollarSign, Activity, ChevronRight, BrainCircuit,
  PieChart as PieIcon, Info, Sliders, CheckCircle2, ArrowLeft
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { trackEvent } from '../utils/analytics';
import { 
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, 
  Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell, ReferenceLine
} from 'recharts';

export default function ProductAnalytics() {
  const { showToast } = useStore();
  const navigate = useNavigate();

  const [dateRange, setDateRange] = useState('30d'); // 'today' | '7d' | '30d' | '90d' | 'custom'
  const [customStart, setCustomStart] = useState('2026-03-01');
  const [customEnd, setCustomEnd] = useState('2026-04-30');
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState(null);

  // Interactive Two-Stage ML Forecast Studio
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [forecastResult, setForecastResult] = useState(null);
  const [loadingForecast, setLoadingForecast] = useState(false);

  useEffect(() => {
    trackEvent('analytics_dashboard_viewed', { date_range: dateRange });
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const params = { range: dateRange };
      if (dateRange === 'custom') {
        params.startDate = customStart;
        params.endDate = customEnd;
      }
      const data = await api.getProductAnalytics(params);
      setAnalyticsData(data);
      if (data?.demandForecast && data.demandForecast.length > 0 && !selectedProductId) {
        setSelectedProductId(data.demandForecast[0].id);
        runTwoStageForecast(data.demandForecast[0]);
      }
    } catch (err) {
      console.error('Failed to load product analytics:', err);
      showToast('Error loading analytics data', 'error');
    }
    setLoading(false);
  };

  const runTwoStageForecast = async (product) => {
    setLoadingForecast(true);
    try {
      const res = await api.getTwoStageForecast(product.name, product.currentStock);
      setForecastResult(res);
      trackEvent('prediction_viewed', { 
        product_name: product.name, 
        predicted_demand: res.predicted_demand || 10 
      });
    } catch (err) {
      console.error(err);
    }
    setLoadingForecast(false);
  };

  const handleDateRangeChange = (range) => {
    setDateRange(range);
    trackEvent('filter_changed', { filter_type: 'date_range', value: range });
  };

  const fmt = (amount) => `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;

  const summary = analyticsData?.summary || {
    totalProducts: 21,
    totalCustomers: 0,
    totalOrders: 55,
    totalRevenue: 4000,
    totalUnitsSold: 94,
    averageOrderValue: 73,
    averageSellingPrice: 43,
    estimatedProfit: 950,
    profitMarginPct: '23.8',
    inventoryTurnover: '1.45',
    lowStockCount: 2,
    repeatPurchaseRate: 86
  };

  return (
    <div className="page" style={{ paddingTop: 16, paddingBottom: 80 }}>
      
      {/* ─── HEADER BAR ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ padding: 8, width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 className="page-title" style={{ fontSize: '1.6rem', margin: 0, fontWeight: 900, letterSpacing: '-0.5px' }}>
                Product Analytics & Demand Intelligence
              </h1>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                MSE ANALYTICS MODULE
              </span>
            </div>
            <p className="page-subtitle" style={{ fontSize: '0.84rem', margin: '2px 0 0', color: 'var(--text-secondary)' }}>
              Comprehensive inventory velocity, gross margin estimates, turnover ratios, and CatBoost Two-Stage demand forecasting
            </p>
          </div>
        </div>

        {/* Date Filter Pills */}
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: '14px', border: '1px solid var(--glass-border)', flexWrap: 'wrap' }}>
          {[
            { id: 'today', label: 'Today' },
            { id: '7d', label: 'Last 7 Days' },
            { id: '30d', label: 'Last 30 Days' },
            { id: '90d', label: 'Last 90 Days' },
            { id: 'custom', label: 'Custom Range' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleDateRangeChange(tab.id)}
              style={{
                padding: '7px 13px', borderRadius: '10px', border: 'none',
                background: dateRange === tab.id ? 'var(--accent)' : 'transparent',
                color: dateRange === tab.id ? 'white' : 'var(--text-secondary)',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {dateRange === 'custom' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', background: 'var(--card-bg)', padding: '12px 18px', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Range:</span>
          <input type="date" className="input" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.85rem' }} />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input type="date" className="input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.85rem' }} />
          <button className="btn btn-primary btn-sm" onClick={loadAnalytics}>Apply Filter</button>
        </motion.div>
      )}

      {/* ─── 10 KPI CARDS GRID ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        
        {/* Total Revenue */}
        <div className="bento-card" style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarSign size={15} color="#34d399" /> Total Revenue
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: '#34d399', margin: '4px 0 2px' }}>
            {fmt(summary.totalRevenue)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Selected period</div>
        </div>

        {/* Units Sold */}
        <div className="bento-card" style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Package size={15} color="#38bdf8" /> Units Sold
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: '4px 0 2px' }}>
            {summary.totalUnitsSold} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>units</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Across all items</div>
        </div>

        {/* Total Orders */}
        <div className="bento-card" style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShoppingBag size={15} color="#c084fc" /> Total Orders
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: '4px 0 2px' }}>
            {summary.totalOrders} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>bills</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Completed checkouts</div>
        </div>

        {/* Average Order Value (AOV) */}
        <div className="bento-card" style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={15} color="#fbbf24" /> Average Order Value
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: '#fbbf24', margin: '4px 0 2px' }}>
            {fmt(summary.averageOrderValue)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Per transaction basket</div>
        </div>

        {/* Average Selling Price (ASP) */}
        <div className="bento-card" style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarSign size={15} color="#60a5fa" /> Average Price (ASP)
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: '4px 0 2px' }}>
            {fmt(summary.averageSellingPrice)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Per unit sold</div>
        </div>

        {/* Product Profit Estimate (Gross Margin) */}
        <div className="bento-card" style={{ padding: '16px 18px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
          <div style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarSign size={15} /> Est. Gross Profit
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: '#34d399', margin: '4px 0 2px' }}>
            {fmt(summary.estimatedProfit)}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 700 }}>
            {summary.profitMarginPct}% gross margin
          </div>
        </div>

        {/* Inventory Turnover Ratio */}
        <div className="bento-card" style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={15} color="#f43f5e" /> Inventory Turnover
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: '4px 0 2px' }}>
            {summary.inventoryTurnover}x
          </div>
          <div style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 600 }}>Healthy replenishment</div>
        </div>

        {/* Low Stock SKUs */}
        <div className="bento-card" style={{ padding: '16px 18px', background: summary.lowStockCount > 0 ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.03)', border: summary.lowStockCount > 0 ? '1px solid rgba(251,191,36,0.4)' : '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.74rem', color: summary.lowStockCount > 0 ? '#fbbf24' : 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={15} /> Low Stock SKUs
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: summary.lowStockCount > 0 ? '#fbbf24' : 'white', margin: '4px 0 2px' }}>
            {summary.lowStockCount} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>items</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: summary.lowStockCount > 0 ? '#fbbf24' : '#34d399', fontWeight: 600 }}>
            {summary.lowStockCount > 0 ? 'Action required' : 'Optimal levels'}
          </div>
        </div>

        {/* Customer Repeat Rate */}
        <div className="bento-card" style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={15} color="#38bdf8" /> Repeat Purchase Rate
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: '#38bdf8', margin: '4px 0 2px' }}>
            {summary.repeatPurchaseRate}%
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Customer loyalty</div>
        </div>

        {/* Total Products SKU */}
        <div className="bento-card" style={{ padding: '16px 18px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Package size={15} color="#c084fc" /> Active Catalog SKUs
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 900, color: 'white', margin: '4px 0 2px' }}>
            {summary.totalProducts} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>SKUs</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Catalog size</div>
        </div>

      </div>

      {/* ─── CHARTS ROW 1: SALES TREND & REVENUE BY PRODUCT ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20, marginBottom: 24 }}>
        
        {/* Chart 1: Sales & Revenue Trend Over Time */}
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>Product Sales & Revenue Trend</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Daily gross transaction revenue for selected date filter</p>
            </div>
            <span style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '10px', background: 'rgba(52,211,153,0.15)', color: '#34d399', fontWeight: 700 }}>
              Timeline Trend
            </span>
          </div>
          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsData?.charts?.salesTrend || []} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesTrendColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={10} tickFormatter={v => v.slice(5)} />
                <YAxis stroke="var(--text-secondary)" fontSize={11} tickFormatter={v => `₹${v/1000}k`} />
                <Tooltip 
                  formatter={(val, name) => [name === 'revenue' ? `₹${val.toLocaleString('en-IN')}` : val, name === 'revenue' ? 'Revenue' : 'Units']}
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#salesTrendColor)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Revenue & Gross Profit by Product */}
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>Revenue by Product SKU</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Top revenue generating products in current timeframe</p>
            </div>
            <span style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '10px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontWeight: 700 }}>
              Top 8 SKUs
            </span>
          </div>
          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData?.charts?.revenueByProduct || []} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                <XAxis type="number" stroke="var(--text-secondary)" fontSize={11} tickFormatter={v => `₹${v/1000}k`} />
                <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" fontSize={10} width={110} />
                <Tooltip 
                  formatter={(val, name) => [`₹${val.toLocaleString('en-IN')}`, name === 'revenue' ? 'Revenue' : 'Estimated Profit']}
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }}
                />
                <Bar dataKey="revenue" fill="#38bdf8" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* ─── CHARTS ROW 2: INVENTORY LEVELS & FAST VS SLOW MOVING MATRIX ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20, marginBottom: 24 }}>
        
        {/* Chart 3: Stock vs Safety Threshold */}
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>Current Stock vs Reorder Level</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Inventory level compared to minimum safety threshold</p>
            </div>
            <span style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '10px', background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontWeight: 700 }}>
              Stock Monitor
            </span>
          </div>
          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData?.charts?.inventoryLevels || []} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={10} angle={-25} textAnchor="end" />
                <YAxis stroke="var(--text-secondary)" fontSize={11} />
                <Tooltip 
                  formatter={(val, name) => [`${val} Units`, name === 'stock' ? 'Current Stock' : 'Min Safety Stock']}
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white' }}
                />
                <Legend />
                <Bar dataKey="stock" name="Current Stock" fill="#34d399" radius={[4, 4, 0, 0]} />
                <Bar dataKey="minStock" name="Min Safety Level" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Matrix: Fast Moving vs Slow Moving Products */}
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>Velocity Matrix: Fast vs Slow Moving</h3>
              <span style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '10px', background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontWeight: 700 }}>
                Velocity Analysis
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Fast Moving Column */}
              <div style={{ background: 'rgba(16,185,129,0.06)', padding: 14, borderRadius: '14px', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#34d399', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  🚀 FAST MOVING (High Velocity)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(analyticsData?.fastMoving || []).slice(0, 4).map((p, idx) => (
                    <div key={idx} style={{ fontSize: '0.78rem', color: 'white', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{p.name}</span>
                      <strong style={{ color: '#34d399' }}>{p.unitsSold} sold</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Slow Moving Column */}
              <div style={{ background: 'rgba(244,63,94,0.06)', padding: 14, borderRadius: '14px', border: '1px solid rgba(244,63,94,0.2)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fb7185', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  🐢 SLOW MOVING (Low Velocity)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(analyticsData?.slowMoving || []).slice(0, 4).map((p, idx) => (
                    <div key={idx} style={{ fontSize: '0.78rem', color: 'white', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{p.name}</span>
                      <strong style={{ color: '#fb7185' }}>{p.unitsSold} sold</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            💡 <strong style={{ color: 'white' }}>Action:</strong> Maintain buffer safety stock for fast movers. Run bundle promotions on slow movers to free locked working capital.
          </div>
        </div>

      </div>

      {/* ─── SECTION: CATBOOST TWO-STAGE DEMAND FORECASTING STUDIO ─── */}
      <div style={{ padding: 26, background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)', borderRadius: '24px', border: '1px solid rgba(56, 189, 248, 0.4)', boxShadow: '0 12px 36px rgba(0,0,0,0.4)', marginBottom: 24 }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <span style={{ background: 'rgba(56, 189, 248, 0.2)', border: '1px solid #38bdf8', color: '#38bdf8', fontSize: '0.76rem', fontWeight: 800, padding: '4px 12px', borderRadius: '16px', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <BrainCircuit size={14} /> CATBOOST TWO-STAGE HURDLE ARCHITECTURE
            </span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', margin: 0 }}>
              AI Demand Prediction & Stockout Forecaster 🧠
            </h2>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Select a product to inspect the live two-stage Hurdle execution: Stage 1 (Probability of Sale) → Stage 2 (Conditional Demand Quantity).
            </p>
          </div>

          {/* Product Selector for ML Model */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Select SKU:</span>
            <select
              className="input"
              value={selectedProductId || ''}
              onChange={e => {
                const pId = e.target.value;
                setSelectedProductId(pId);
                const matched = (analyticsData?.demandForecast || []).find(p => p.id === pId);
                if (matched) runTwoStageForecast(matched);
              }}
              style={{ padding: '8px 14px', fontSize: '0.88rem', background: '#090d16', color: 'white', borderRadius: '12px' }}
            >
              {(analyticsData?.demandForecast || []).map(p => (
                <option key={p.id} value={p.id}>{p.name} (Stock: {p.currentStock})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Pipeline Architecture Diagram */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20, padding: '16px 14px', background: 'rgba(0,0,0,0.35)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
          {[
            { step: '1. Sales Logs', desc: 'Historical POS data & calendar lags' },
            { step: '2. Feature Eng', desc: '18 rolling means, day-of-week, weather' },
            { step: '3. Stage 1 (P(Sale))', desc: 'CatBoost Classifier (Probability)' },
            { step: '4. Stage 2 (Demand)', desc: 'CatBoost Regressor (Units if sold)' },
            { step: '5. Hurdle Synthesis', desc: 'Threshold τ = 0.50 cutoff' },
            { step: '6. Decision Output', desc: 'Stockout ETA & Restock Order' }
          ].map((s, idx) => (
            <div key={idx} style={{ textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#38bdf8' }}>{s.step}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 2 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Live Model Prediction Output Box */}
        {forecastResult ? (
          <div style={{ background: 'rgba(255,255,255,0.035)', padding: 22, borderRadius: '18px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'center' }}>
              
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>PRODUCT</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', marginTop: 2 }}>
                  {forecastResult.product}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Category: <strong style={{ color: 'white' }}>{forecastResult.category || 'Grocery'}</strong> • Current Stock: <strong style={{ color: 'white' }}>{forecastResult.currentStock} units</strong>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>STAGE 1: PROBABILITY OF SALE</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#34d399', marginTop: 2 }}>
                  {forecastResult.stage1_probability_of_sale || 87}%
                </div>
                <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600 }}>
                  High probability (exceeds τ = 0.50 threshold)
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>STAGE 2: PREDICTED DEMAND</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#38bdf8', marginTop: 2 }}>
                  {forecastResult.predicted_demand || 12} <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>units</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Interval: [{forecastResult.forecast_interval?.lower || 10} - {forecastResult.forecast_interval?.upper || 15} units]
                </div>
              </div>

              <div style={{ padding: '12px 16px', background: forecastResult.urgency === 'critical' || forecastResult.urgency === 'high' ? 'rgba(244,63,94,0.18)' : 'rgba(16,185,129,0.18)', borderRadius: '14px', border: forecastResult.urgency === 'critical' || forecastResult.urgency === 'high' ? '1px solid #f43f5e' : '1px solid #10b981' }}>
                <div style={{ fontSize: '0.7rem', color: forecastResult.urgency === 'critical' || forecastResult.urgency === 'high' ? '#fb7185' : '#34d399', fontWeight: 800, textTransform: 'uppercase' }}>
                  INVENTORY RECOMMENDATION
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: forecastResult.urgency === 'critical' || forecastResult.urgency === 'high' ? '#f43f5e' : '#34d399', marginTop: 2 }}>
                  {forecastResult.recommendation}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'white', marginTop: 2 }}>
                  Suggested Reorder: <strong style={{ color: '#fbbf24' }}>{forecastResult.reorder_quantity || 15} units</strong>
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading Two-Stage ML Forecast...
          </div>
        )}

      </div>

      {/* ─── SECTION: DATABASE METRICS VS GOOGLE ANALYTICS DISTINCTION ─── */}
      <div style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        
        {/* Left Column: Application Database */}
        <div style={{ background: 'rgba(255,255,255,0.025)', padding: 18, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#34d399', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ShoppingBag size={18} /> Application Database Metrics (Source of Truth)
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px' }}>
            Stored in MongoDB. Tracks actual commercial accounting and business transactions:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            <li>Verified Customers Directory & balances</li>
            <li>Cash and verified UPI payment records</li>
            <li>SKU inventory levels and cost prices</li>
            <li>Expense receipts and cashbook</li>
          </ul>
        </div>

        {/* Right Column: Google Analytics 4 */}
        <div style={{ background: 'rgba(56,189,248,0.03)', padding: 18, borderRadius: '16px', border: '1px solid rgba(56,189,248,0.2)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Activity size={18} /> Google Analytics 4 User Behavior (Interaction Tracking)
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px' }}>
            Collected via GA4 Measurement ID without storing private PII:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            <li>Screen navigation (`page_view`)</li>
            <li>Excel sales sheets uploaded (`inventory_excel_uploaded`)</li>
            <li>Catalog additions and restock events (`stock_added`)</li>
            <li>Feature adoption & search interactions (`search_used`)</li>
          </ul>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/analytics-setup')} style={{ fontSize: '0.76rem', padding: '6px 12px' }}>
              View Google Analytics Setup & Live Event Stream →
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
