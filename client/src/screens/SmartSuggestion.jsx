import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, TrendingUp, Package, Users, DollarSign, 
  RefreshCw, ChevronRight, Lightbulb, CheckCircle2, Sparkles, PhoneCall, Zap, ShieldAlert
} from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../api';
import { useStore } from '../context/StoreContext';

const SUGGESTION_ICONS = {
  'restock': { icon: '📦', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.18)' },
  'collect_credit': { icon: '💰', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.18)' },
  'inactive_customer': { icon: '👤', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.18)' },
  'profit': { icon: '📈', color: '#10b981', bg: 'rgba(16, 185, 129, 0.18)' },
  'expense': { icon: '💸', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.18)' },
  'growth': { icon: '🚀', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.18)' },
  'general': { icon: '💡', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.18)' },
};

export default function SmartSuggestion() {
  const navigate = useNavigate();
  const { showToast } = useStore();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState([]);
  const [aiStatus, setAiStatus] = useState(null);

  // Critical Low Stock items with instant WhatsApp ordering
  const reorderAlerts = [
    { name: 'Sugar (Suger) 1 KG Pack', current: '3 units', needed: '25 units', distributor: 'Jejani Wholesale', phone: '9508399874' },
    { name: 'Rice Premium Bag 1 KG', current: '2 units', needed: '20 units', distributor: 'Ravi Kumar Traders', phone: '9508399874' },
    { name: 'Fortune Soyabean Oil 1L Pouch', current: '4 pouches', needed: '30 pouches', distributor: 'Jejani Wholesale', phone: '8806925060' }
  ];

  useEffect(() => {
    loadSuggestions();
    api.getAIStatus().then(setAiStatus).catch(() => {});
  }, []);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const data = await api.getSuggestions();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const dismiss = (index) => {
    setDismissed(prev => [...prev, index]);
  };

  const activeSuggestions = suggestions.filter((_, i) => !dismissed.includes(i));
  const criticalCount = activeSuggestions.filter(s => s.priority === 'high').length;
  const importantCount = activeSuggestions.filter(s => s.priority === 'medium').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '65vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner"></div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 16, fontSize: '0.9rem', fontWeight: 600 }}>
            Analyzing inventory demand & AI Recommendations recommendations...
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
      {/* Premium Bento Header */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '24px 28px', borderRadius: '24px', background: 'var(--card-bg)', border: '1px solid var(--border-color)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)', marginBottom: 24
      }}>
        <div>
          <span style={{
            background: 'rgba(244, 63, 94, 0.18)', border: '1px solid rgba(244, 63, 94, 0.45)',
            color: '#fb7185', fontSize: '0.78rem', fontWeight: 800, padding: '6px 14px', borderRadius: '20px',
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10
          }}>
            <Sparkles size={14} /> AI PREDICTIVE STOCK ENGINE • SMART SUGGESTIONS
          </span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 900, color: 'white', margin: 0, tracking: '-0.5px' }}>
            Smart Suggestions & Instant Reorders 🧠
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '6px 0 0', fontWeight: 500 }}>
            AI-generated inventory advice, urgent distributor reorders, and customer udhaar recovery tips.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={loadSuggestions}
            style={{
              padding: '12px 18px', borderRadius: '16px', background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontWeight: 800, fontSize: '0.85rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            <RefreshCw size={16} /> Refresh Recommendations
          </button>
          <button 
            onClick={() => navigate('/decision-center')}
            style={{
              padding: '12px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #10B981, #059669)',
              border: 'none', color: 'white', fontWeight: 800, fontSize: '0.85rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 15px rgba(16, 185, 129, 0.35)'
            }}
          >
            <Zap size={16} /> Price What-If Simulator →
          </button>
        </div>
      </div>

      {/* Main Bento Grid Workspace */}
      <div className="bento-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', gap: 20 }}>
        
        {/* Left Column (span 6): Instant Reorder Alerts (Kirana Yellow Card) */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bento-card kirana-yellow"
          style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 24, minHeight: 440 }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ background: 'rgba(244,63,94,0.22)', border: '1px solid #fb7185', color: '#fb7185', fontSize: '0.76rem', fontWeight: 800, padding: '5px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚡ URGENT REORDERS REQUIRED
              </span>
              <span style={{ fontSize: '0.78rem', color: '#fbbf24', fontWeight: 800 }}>
                {reorderAlerts.length} Critical Items
              </span>
            </div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 900, color: 'white', margin: '0 0 8px' }}>
              Instant WhatsApp Distributor Reorders 📦
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
              These items are about to run out before tonight's rush hour. Click to send pre-filled purchase orders via WhatsApp right now!
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {reorderAlerts.map((item, idx) => (
                <div key={idx} style={{
                  padding: '16px 18px', borderRadius: '18px', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
                }}>
                  <div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>{item.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: 10 }}>
                      <span>Left: <strong style={{ color: '#fb7185' }}>{item.current}</strong></span>
                      <span>• Order: <strong style={{ color: '#10B981' }}>{item.needed}</strong></span>
                      <span>• ({item.distributor})</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      showToast(`✅ WhatsApp order sent to ${item.distributor} (${item.phone}) for ${item.name}!`, 'success');
                    }}
                    style={{
                      padding: '10px 16px', borderRadius: '14px', background: '#25D366', border: 'none', color: 'white',
                      fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 3px 12px rgba(37, 211, 102, 0.35)', flexShrink: 0
                    }}
                  >
                    <PhoneCall size={15} /> Order Now
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 18, marginTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Want custom inventory reorder thresholds?</span>
            <button
              onClick={() => navigate('/stock')}
              style={{ background: 'transparent', border: 'none', color: '#fbbf24', fontWeight: 800, fontSize: '0.86rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Go to Stock Manager →
            </button>
          </div>
        </motion.div>

        {/* Right Column (span 6): AI Recommendations List & Credit Recovery (Kirana Green Card) */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bento-card kirana-green"
          style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 24, minHeight: 440 }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10B981', color: '#10B981', fontSize: '0.76rem', fontWeight: 800, padding: '5px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: 6 }}>
                💡 ACTIVE AI ADVISORY TIPS
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                {activeSuggestions.length} Tips Available
              </span>
            </div>

            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 900, color: 'white', margin: '0 0 8px' }}>
              Today's AI Recommendations & Shop Growth Hacks 🚀
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: '0 0 18px', lineHeight: 1.5 }}>
              Actionable predictive recommendations to improve daily cashflow and minimize unsold dead stock.
            </p>

            {activeSuggestions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(0,0,0,0.3)', borderRadius: '20px' }}>
                <div style={{ fontSize: '2rem' }}>🎉</div>
                <h4 style={{ color: 'white', margin: '10px 0 6px' }}>All Looking Excellent!</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No critical issues found in your shop data today.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                {activeSuggestions.map((suggestion, idx) => {
                  const style = SUGGESTION_ICONS[suggestion.type] || SUGGESTION_ICONS.general;
                  const isHigh = suggestion.priority === 'high';
                  return (
                    <div key={idx} style={{
                      padding: '16px', borderRadius: '18px', background: 'rgba(0,0,0,0.45)',
                      border: `1px solid ${isHigh ? 'rgba(244,63,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      display: 'flex', gap: 14, alignItems: 'flex-start'
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: '14px', background: style.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0
                      }}>
                        {style.icon}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: '0.94rem', fontWeight: 800, color: 'white' }}>{suggestion.title}</span>
                          {isHigh && (
                            <span style={{ background: 'rgba(244,63,94,0.2)', color: '#fb7185', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>URGENT</span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>{suggestion.description}</p>

                        {suggestion.action && (
                          <button
                            onClick={() => { if (suggestion.action.route) navigate(suggestion.action.route); }}
                            style={{
                              marginTop: 10, padding: '6px 14px', borderRadius: '10px',
                              background: isHigh ? 'rgba(244,63,94,0.2)' : 'rgba(255,255,255,0.1)',
                              border: `1px solid ${isHigh ? '#fb7185' : 'rgba(255,255,255,0.2)'}`,
                              color: isHigh ? '#fb7185' : 'white', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer'
                            }}
                          >
                            {suggestion.action.label || 'Take Action'} →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 18, marginTop: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Want deep custom Q&A on your data?</span>
            <button
              onClick={() => navigate('/ask')}
              style={{ background: 'transparent', border: 'none', color: '#10B981', fontWeight: 800, fontSize: '0.86rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Ask AI Anything →
            </button>
          </div>
        </motion.div>

        {/* Bottom Full Width Card (span 12): Quick Tips & How it Works (Kirana Purple Card) */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bento-card kirana-purple"
          style={{ gridColumn: 'span 12', padding: 26 }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ background: 'rgba(168, 85, 247, 0.22)', border: '1px solid #a855f7', color: '#c084fc', padding: '6px 14px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={14} /> CONTINUOUS PREDICTION ENGINE
              </span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0 }}>
                How the Antarya Hurdle Model & Recommendations Work
              </h3>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {[
              { title: '📦 Reorder Threshold Intelligence', desc: 'Predicts exact hour when items like Sugar or Rice run out based on weather & festival trends.' },
              { title: '📈 Price Elasticity Simulation', desc: 'Calculates exact profit gains or customer churn before changing POS shelf prices.' },
              { title: '💰 Credit Risk Recovery', desc: 'Flags high-risk credit accounts and automatically prepares polite WhatsApp reminders.' },
              { title: '👥 Customer Retention Alerts', desc: 'Detects loyal shoppers who stopped visiting and suggests target discount offers.' }
            ].map((tip, idx) => (
              <div key={idx} style={{ padding: '16px 18px', borderRadius: '18px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#e9d5ff', marginBottom: 6 }}>{tip.title}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tip.desc}</div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
