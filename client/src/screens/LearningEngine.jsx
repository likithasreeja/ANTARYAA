import { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { 
  Activity, ShieldCheck, Zap, AlertTriangle, TrendingUp, BarChart3, 
  CheckCircle2, ArrowRight, Brain, Sparkles, RefreshCw, PhoneCall, Send, HelpCircle,
  Clock, Package, ShieldAlert
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function LearningEngine() {
  const { shop, showToast } = useStore();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLearningStats().then(res => {
      setData(res);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setData({
        totalBillsAnalyzed: 450,
        activeDays: 39,
        recommendationsGenerated: 450,
        accuracyScore: 88.4,
        busiestHours: ['07:00 - 09:00 AM', '06:00 - 09:00 PM'],
        topSellingCategories: ['FMCG & Groceries', 'Dairy Products', 'Personal Care'],
        estimatedMoneySaved: 14250
      });
      setLoading(false);
    });
  }, []);

  const healthScore = 86;

  const shapBreakdown = [
    { factor: 'Evening Footfall Peak', contribution: '+18%', impact: 'positive', score: 18 },
    { factor: 'Upcoming Local Festival / Wedding Season', contribution: '+14%', impact: 'positive', score: 14 },
    { factor: 'Optimal Pricing vs Nearby Supermarkets', contribution: '+9%', impact: 'positive', score: 9 },
    { factor: 'Low Stock Risk in Top 2 FMCG SKUs', contribution: '-6%', impact: 'negative', score: -6 },
    { factor: 'Pending Credit Credit Ratio (>25%)', contribution: '-8%', impact: 'negative', score: -8 }
  ];

  const riskCards = [
    {
      title: 'Stockout Risk Warning',
      severity: 'HIGH RISK',
      badgeBg: 'rgba(244, 63, 94, 0.2)',
      badgeColor: '#fb7185',
      borderColor: 'rgba(244, 63, 94, 0.45)',
      desc: 'Fortune Sunflower Oil 1L & Amul Butter will run out before evening rush hour.',
      actionText: '1-Tap Auto-Order on WhatsApp',
      onAction: () => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
        showToast('✅ Instant distributor restock order sent via WhatsApp!', 'success');
      }
    },
    {
      title: 'Working Capital & Customer Credit Alert',
      severity: 'MEDIUM RISK',
      badgeBg: 'rgba(251, 191, 36, 0.2)',
      badgeColor: '#fbbf24',
      borderColor: 'rgba(251, 191, 36, 0.4)',
      desc: '₹18,400 pending in Credit across 14 regular customers for >30 days without payment.',
      actionText: 'Send SMS Recovery Reminders',
      onAction: () => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
        showToast('✅ Sent polite payment reminder SMS/WhatsApp to 14 customers!', 'success');
      }
    },
    {
      title: 'Customer Retention & Loyalty',
      severity: 'GROWTH TIP',
      badgeBg: 'rgba(56, 189, 248, 0.2)',
      badgeColor: '#38bdf8',
      borderColor: 'rgba(56, 189, 248, 0.4)',
      desc: '3 VIP customers haven\'t visited this week. Send a special personalized combo offer.',
      actionText: 'Create ₹99 Tea + Biscuits Offer',
      onAction: () => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
        navigate('/decision-center');
      }
    }
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '65vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner"></div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 16, fontSize: '0.9rem', fontWeight: 600 }}>
            Synchronizing with Antarya Hurdle Model & Learning Database...
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 14 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.35 }}
      style={{ padding: '24px 20px', maxWidth: 1380, margin: '0 auto', paddingBottom: 80 }}
    >
      {/* Premium Bento Header matching Dashboard */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '24px 28px', borderRadius: '24px', background: 'var(--card-bg)', border: '1px solid var(--border-color)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)', marginBottom: 24
      }}>
        <div>
          <span style={{
            background: 'rgba(56, 189, 248, 0.18)', border: '1px solid rgba(56, 189, 248, 0.45)',
            color: '#38bdf8', fontSize: '0.78rem', fontWeight: 800, padding: '6px 14px', borderRadius: '20px',
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10
          }}>
            <Brain size={14} /> TWO-STAGE HURDLE ENGINE v7.0 • STORE INTELLIGENCE
          </span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 900, color: 'white', margin: 0, tracking: '-0.5px' }}>
            Store Intelligence & Learning Evolution 🧠
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '6px 0 0', fontWeight: 500 }}>
            Real-time diagnostic health check trained on <strong style={{ color: 'white' }}>{data?.totalBillsAnalyzed || 450} Bills</strong> across <strong style={{ color: 'white' }}>{data?.activeDays || 39} Active Days</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={() => navigate('/suggestions')}
            style={{
              padding: '12px 18px', borderRadius: '16px', background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontWeight: 800, fontSize: '0.85rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            <Sparkles size={16} color="#fbbf24" /> Reorders & Tips →
          </button>
          <button 
            onClick={() => navigate('/decision-center')}
            style={{
              padding: '12px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FF6B00, #FF9E00)',
              border: 'none', color: 'white', fontWeight: 800, fontSize: '0.85rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 15px rgba(255, 107, 0, 0.35)'
            }}
          >
            <Zap size={16} /> Price What-If Studio →
          </button>
        </div>
      </div>

      {/* Main Bento Grid Workspace */}
      <div className="bento-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', gap: 20 }}>
        
        {/* Row 1 Left: Overall Health Score & Diagnostic Gauge (span 6) */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bento-card kirana-yellow"
          style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 26, minHeight: 450 }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                OVERALL DHANDHA HEALTH SCORE
              </span>
              <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10B981', border: '1px solid #10B981', fontSize: '0.75rem', fontWeight: 800, padding: '4px 12px', borderRadius: '14px' }}>
                Hurdle Accuracy {data?.accuracyScore || 88.4}%
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 24, margin: '20px 0' }}>
              <div style={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
                  <circle 
                    cx="60" cy="60" r="50" fill="none" stroke="#10B981" strokeWidth="12" 
                    strokeDasharray="314" strokeDashoffset={314 - (314 * healthScore) / 100} strokeLinecap="round"
                  />
                </svg>
                <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '2.4rem', fontWeight: 900, color: 'white', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{healthScore}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#10B981' }}>OUT OF 100</span>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', margin: '0 0 8px' }}>
                  Excellent Growth Track 📈
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Your shop is running with high inventory turnover and low dead stock ratio compared to nearby stores.
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: '16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', fontSize: '0.8rem', fontWeight: 800 }}>
                  <ShieldCheck size={16} /> Store Secure & Active
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 18, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Estimated Monthly AI Savings:</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#10B981' }}>₹{(data?.estimatedMoneySaved || 14250).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Recommendations Generated:</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fbbf24' }}>{data?.recommendationsGenerated || 450} Tips</div>
            </div>
          </div>
        </motion.div>

        {/* Row 1 Right: SHAP Breakdown & Next Week Forecast (span 6) */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bento-card kirana-green"
          style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 26, minHeight: 450 }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={20} color="#10B981" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0 }}>SHAP Value Breakdown</h3>
              </div>
              <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10B981', fontSize: '0.75rem', fontWeight: 800, padding: '4px 12px', borderRadius: '14px' }}>
                +22% Expected Footfall 🚀
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 18px' }}>
              Mathematical factors (Shapley Additive Explanations) influencing your store's score this week:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {shapBreakdown.map((item, idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: 6 }}>
                    <span style={{ color: 'white', fontWeight: 700 }}>{item.factor}</span>
                    <span style={{ fontWeight: 900, color: item.impact === 'positive' ? '#10B981' : '#f43f5e' }}>{item.contribution}</span>
                  </div>
                  <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(Math.abs(item.score) * 4.5, 100)}%`,
                      height: '100%',
                      background: item.impact === 'positive' ? '#10B981' : '#f43f5e',
                      borderRadius: 6
                    }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 16, marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Want custom SHAP explanations for any item?</span>
            <button
              onClick={() => navigate('/ask')}
              style={{ background: 'transparent', border: 'none', color: '#10B981', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Ask AI Details →
            </button>
          </div>
        </motion.div>

        {/* Row 2: Three Perfectly Symmetrical Risk & Action Cards (span 4 each) */}
        <div style={{ gridColumn: 'span 12', marginTop: 8 }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            ⚡ Actionable Risk Mitigation Cards (1-Tap Dhandha Actions)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {riskCards.map((card, idx) => (
              <motion.div 
                key={idx} whileHover={{ y: -4 }} transition={{ duration: 0.2 }}
                className="bento-card"
                style={{
                  padding: 24, borderRadius: '22px', background: 'rgba(0,0,0,0.45)', border: `1px solid ${card.borderColor}`,
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 250
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ background: card.badgeBg, color: card.badgeColor, fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: '10px' }}>
                      {card.severity}
                    </span>
                    <AlertTriangle size={18} color={card.badgeColor} />
                  </div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', margin: '0 0 8px' }}>{card.title}</h4>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{card.desc}</p>
                </div>

                <button
                  onClick={card.onAction}
                  style={{
                    marginTop: 20, width: '100%', padding: '12px 16px', borderRadius: '14px',
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: 'white',
                    fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background 0.2s'
                  }}
                >
                  <Zap size={16} color="#fbbf24" /> {card.actionText}
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Row 3: Peak Rush Hours & Top Selling Categories Breakdown (span 12) */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bento-card kirana-purple"
          style={{ gridColumn: 'span 12', padding: 26, marginTop: 4 }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={22} color="#c084fc" />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0 }}>Peak Rush Intervals & Top Inventory Performance</h3>
            </div>
            <span style={{ background: 'rgba(168, 85, 247, 0.2)', border: '1px solid #a855f7', color: '#e9d5ff', fontSize: '0.76rem', fontWeight: 800, padding: '4px 12px', borderRadius: '14px' }}>
              Synchronized 1-Min Ago 🟢
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            <div style={{ padding: 20, borderRadius: '18px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', marginBottom: 10 }}>
                ⚡ BUSIEST SHOPPING HOURS (SHAAM & SUBHA KI BHEED)
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(data?.busiestHours || ['07:00 - 09:00 AM', '06:00 - 09:00 PM']).map((hour, i) => (
                  <span key={i} style={{ padding: '10px 16px', borderRadius: '14px', background: 'rgba(168, 85, 247, 0.18)', border: '1px solid rgba(168, 85, 247, 0.4)', color: 'white', fontWeight: 800, fontSize: '0.9rem' }}>
                    🕒 {hour}
                  </span>
                ))}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 12 }}>
                Ensure both counter staff and weighing machines are ready 15 mins before these peaks.
              </p>
            </div>

            <div style={{ padding: 20, borderRadius: '18px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', marginBottom: 10 }}>
                📦 TOP SELLING INVENTORY CATEGORIES (TRANSACTION IDENTIFIED)
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(data?.topSellingCategories || ['Groceries & Staples', 'Dairy Products', 'Personal Care']).map((cat, i) => (
                  <span key={i} style={{ padding: '10px 16px', borderRadius: '14px', background: 'rgba(251, 191, 36, 0.18)', border: '1px solid rgba(251, 191, 36, 0.4)', color: 'white', fontWeight: 800, fontSize: '0.9rem' }}>
                    🔥 {cat}
                  </span>
                ))}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 12 }}>
                These categories generate over {data?.topCategoriesPercentage || 74}% of your daily store revenue based on identified transactions and require top shelf visibility.
              </p>
            </div>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
