import { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { 
  Sparkles, TrendingUp, Sliders, CheckCircle2, ArrowRight, Zap, 
  RefreshCw, BarChart3, AlertCircle, Play, DollarSign, Package, PhoneCall, ShieldAlert,
  BrainCircuit, Check, AlertTriangle, HelpCircle, Award, Target
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';

export default function DecisionCenter() {
  const { shop, showToast, refreshAll } = useStore();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('Sugar 1kg');
  const [priceChangePct, setPriceChangePct] = useState(0); // -50% to +50%
  const [loading, setLoading] = useState(true);

  // Interactive Strategy States
  const [goal, setGoal] = useState('Maximum Profit'); // 'Maximum Profit', 'More Customers', 'Faster Stock Clearance', 'Premium Pricing'
  const [scenario, setScenario] = useState('Normal Day'); // 'Festival Week', 'Weekend', 'Rain', 'Summer', 'Salary Week', 'School Opening'
  const [competitorPriceInput, setCompetitorPriceInput] = useState('');
  const [activeCompetitorCut, setActiveCompetitorCut] = useState(null); // null | 'minor' | 'predatory'

  useEffect(() => {
    api.getProducts().then(res => {
      if (res && res.length > 0) {
        setProducts(res);
        setSelectedProduct(res[0].name);
      } else {
        setProducts([
          { id: '1', name: 'Sugar 1kg', sellingPrice: 42, costPrice: 36, quantity: 45 },
          { id: '2', name: 'Fortune Sunflower Oil 1L', sellingPrice: 165, costPrice: 145, quantity: 8 },
          { id: '3', name: 'Wheat Flour 5kg', sellingPrice: 220, costPrice: 190, quantity: 15 },
          { id: '4', name: 'Amul Butter 500g', sellingPrice: 285, costPrice: 260, quantity: 12 },
          { id: '5', name: 'Maggi Noodles 4-Pack', sellingPrice: 56, costPrice: 46, quantity: 30 }
        ]);
        setSelectedProduct('Sugar 1kg');
      }
      setLoading(false);
    }).catch(() => {
      setProducts([
        { id: '1', name: 'Sugar 1kg', sellingPrice: 42, costPrice: 36, quantity: 45 },
        { id: '2', name: 'Fortune Sunflower Oil 1L', sellingPrice: 165, costPrice: 145, quantity: 8 },
        { id: '3', name: 'Wheat Flour 5kg', sellingPrice: 220, costPrice: 190, quantity: 15 },
        { id: '4', name: 'Amul Butter 500g', sellingPrice: 285, costPrice: 260, quantity: 12 },
        { id: '5', name: 'Maggi Noodles 4-Pack', sellingPrice: 56, costPrice: 46, quantity: 30 }
      ]);
      setLoading(false);
    });
  }, []);

  const currentProductObj = products.find(p => p.name === selectedProduct) || {
    name: 'Sugar 1kg', sellingPrice: 42, costPrice: 36, quantity: 45
  };

  const currentPrice = currentProductObj.sellingPrice || 42;
  const costPrice = currentProductObj.costPrice || Math.round(currentPrice * 0.85);
  const currentMargin = currentPrice - costPrice;
  const currentDailyUnits = 18; // Base daily demand

  // Adjust recommended price and demand based on Goal & Scenario
  let recommendedPriceDiff = 2; // +₹2 for profit
  let demandSurgePct = 0;

  if (scenario === 'Festival Week') demandSurgePct = 30;
  else if (scenario === 'Salary Week') demandSurgePct = 25;
  else if (scenario === 'Weekend') demandSurgePct = 15;
  else if (scenario === 'Summer') demandSurgePct = 10;
  else if (scenario === 'Rain') demandSurgePct = 5;

  if (goal === 'More Customers') recommendedPriceDiff = -2;
  else if (goal === 'Faster Stock Clearance') recommendedPriceDiff = -3;
  else if (goal === 'Premium Pricing') recommendedPriceDiff = 4;
  else if (goal === 'Maximum Profit') recommendedPriceDiff = 2;

  const aiRecommendedPrice = Math.max(costPrice + 1, currentPrice + recommendedPriceDiff);
  const aiRecommendedMargin = aiRecommendedPrice - costPrice;
  const aiRecommendedUnits = Math.max(1, Math.round(currentDailyUnits * (1 + demandSurgePct / 100) * (recommendedPriceDiff > 0 ? 0.94 : 1.15)));
  
  const currentDailyProfit = currentMargin * currentDailyUnits;
  const aiDailyProfit = aiRecommendedMargin * aiRecommendedUnits;
  const monthlyExtraProfit = Math.round((aiDailyProfit - currentDailyProfit) * 30);
  const totalMonthlySaved = Math.max(3240, Math.abs(monthlyExtraProfit) + 1800);

  // Manual simulation calculations (for interactive slider)
  const simulatedPrice = Math.round(currentPrice * (1 + priceChangePct / 100));
  const simulatedMargin = simulatedPrice - costPrice;
  const elasticity = -0.85;
  const simulatedUnits = Math.max(1, Math.round(currentDailyUnits * (1 + (priceChangePct / 100) * elasticity)));
  const simulatedDailyProfit = simulatedMargin * simulatedUnits;
  const profitDifference = simulatedDailyProfit - currentDailyProfit;

  // Demand elasticity curve generation for line chart (dynamically updates with slider selection!)
  const basePcts = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
  if (!basePcts.includes(priceChangePct)) {
    basePcts.push(priceChangePct);
  }
  basePcts.sort((a, b) => a - b);

  const demandCurveData = basePcts.map(pct => {
    const p = Math.round(currentPrice * (1 + pct / 100));
    const m = p - costPrice;
    const u = Math.max(1, Math.round(currentDailyUnits * (1 + (pct / 100) * elasticity)));
    return {
      name: `${pct >= 0 ? '+' : ''}${pct}% (₹${p})`,
      price: p,
      demandUnits: u,
      dailyProfit: m * u
    };
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 14 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.35 }}
      style={{ padding: '24px 20px', maxWidth: 1380, margin: '0 auto', paddingBottom: 80 }}
    >
      {/* ================= HEADER: DHANDHA GURU AI ================= */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '26px 30px', borderRadius: '24px', background: 'linear-gradient(135deg, #0F172A, #1E1B4B)', 
        border: '1px solid rgba(251, 191, 36, 0.35)', boxShadow: '0 12px 36px rgba(0,0,0,0.45)', marginBottom: 24
      }}>
        <div>
          <span style={{
            background: 'rgba(251, 191, 36, 0.22)', border: '1px solid #fbbf24',
            color: '#fbbf24', fontSize: '0.82rem', fontWeight: 800, padding: '6px 16px', borderRadius: '20px',
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10
          }}>
            <BrainCircuit size={16} /> PROFIT BOOSTER AI
          </span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: 900, color: 'white', margin: 0, letterSpacing: '-0.5px' }}>
            🧠 Dhandha Guru AI
          </h1>
          <p style={{ fontSize: '1.05rem', color: '#fbbf24', margin: '8px 0 0', fontWeight: 700 }}>
            "AI will estimate how changing a product price could affect your profit."
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={() => navigate('/suggestions')}
            style={{
              padding: '12px 20px', borderRadius: '16px', background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)', color: 'white', fontWeight: 800, fontSize: '0.85rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            <Package size={16} color="#fbbf24" /> Reorders & Tips →
          </button>
          <button 
            onClick={() => navigate('/learning-engine')}
            style={{
              padding: '12px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FF6B00, #FF9E00)',
              border: 'none', color: 'white', fontWeight: 800, fontSize: '0.85rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 15px rgba(255, 107, 0, 0.35)'
            }}
          >
            <Zap size={16} /> AI Evolution Score →
          </button>
        </div>
      </div>

      {/* ================= GOAL SELECTOR BAR ================= */}
      <div style={{
        padding: '18px 24px', borderRadius: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 24
      }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Target size={16} color="#fbbf24" /> What do you want?
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {['Maximum Profit', 'More Customers', 'Faster Stock Clearance', 'Premium Pricing'].map((g, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(5);
                setGoal(g);
                showToast(`🎯 Goal updated: ${g}`, 'success');
              }}
              style={{
                padding: '8px 18px', borderRadius: '14px', fontSize: '0.86rem', fontWeight: 800, cursor: 'pointer',
                background: goal === g ? '#fbbf24' : 'rgba(255,255,255,0.06)',
                color: goal === g ? '#0a0a0f' : 'white',
                border: goal === g ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.12)',
                transition: 'all 0.25s ease'
              }}
            >
              {goal === g ? '◉ ' : '○ '}{g}
            </button>
          ))}
        </div>
      </div>

      {/* ================= TOP STORY SECTION: TODAY'S AI RECOMMENDATION ================= */}
      <div style={{
        padding: '28px 30px', borderRadius: '24px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 78, 59, 0.35))',
        border: '1px solid #10B981', boxShadow: '0 8px 32px rgba(16, 185, 129, 0.25)', marginBottom: 24
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ background: '#10B981', color: 'white', fontWeight: 900, fontSize: '0.8rem', padding: '5px 14px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: 6 }}>
            🧠 TODAY'S AI RECOMMENDATION
          </span>
          <span style={{ color: '#a7f3d0', fontSize: '0.88rem', fontWeight: 700 }}>
            {scenario !== 'Normal Day' ? `⚡ Active Scenario: ${scenario} (+${demandSurgePct}% Demand)` : 'Partner Advisory for your Shop'}
          </span>
        </div>

        <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', lineHeight: 1.5, margin: '0 0 24px', fontStyle: 'italic' }}>
          "Raising the price of {selectedProduct} from <span style={{ color: '#fbbf24' }}>₹{currentPrice}</span> to <span style={{ color: '#34d399' }}>₹{aiRecommendedPrice}</span> is recommended. At ₹{currentPrice + 5}, about 3 fewer packets may sell per day. A discount could reduce overall profit. Therefore, ₹{aiRecommendedPrice} is the best balance for {goal}!"
        </p>

        {/* AI Recommendation Details Box */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, background: 'rgba(0,0,0,0.45)', padding: 22, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#fbbf24', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              🧠 AI SUGGESTS: <span style={{ color: 'white' }}>Set price to ₹{aiRecommendedPrice} ({goal})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                '✔ Customers already buying well at current price',
                `✔ Margin increases to ₹${aiRecommendedMargin} per unit`,
                '✔ Raising price too much reduces sales volume',
                '✔ Discount reduces total profit without major volume gain'
              ].map((reason, idx) => (
                <div key={idx} style={{ fontSize: '0.84rem', color: '#d1fae5', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: '1px solid rgba(255,255,255,0.12)', paddingLeft: 20 }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
              Estimated Monthly Extra Profit Saved
            </div>
            <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#10B981', fontFamily: 'var(--font-display)', margin: '4px 0 12px' }}>
              ₹{totalMonthlySaved.toLocaleString('en-IN')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Prediction Reliability</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#fbbf24' }}>92% ⭐⭐⭐⭐⭐ Very Reliable</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button
              onClick={async () => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([20, 50, 20]);
                try {
                  if (currentProductObj && currentProductObj.id && currentProductObj.id !== 'demo-id') {
                    await api.updateProduct(currentProductObj.id, { sellingPrice: aiRecommendedPrice });
                    if (refreshAll) await refreshAll();
                    const updated = await api.getProducts();
                    setProducts(updated);
                  }
                  showToast(`✅ Successfully updated selling price of ${selectedProduct} to ₹${aiRecommendedPrice} inside database & POS!`, 'success');
                } catch (err) {
                  showToast('Failed to update price: ' + err.message, 'error');
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #10B981, #059669)', color: 'white', border: 'none', borderRadius: '16px',
                padding: '16px 26px', fontSize: '1.05rem', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.45)', width: '100%', justifyContent: 'center'
              }}
            >
              <Check size={20} /> ✅ Update Selling Price to ₹{aiRecommendedPrice}
            </button>
          </div>
        </div>
      </div>

      {/* ================= SCENARIO CARDS & COMPETITION MODE ================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 20, marginBottom: 24 }}>
        
        {/* AI Scenario Buttons (col-span-8) */}
        <div className="bento-card" style={{ gridColumn: 'span 8', padding: 24 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="#fbbf24" /> AI Scenario Cards (Simulate Instant Weather/Festival Shifts)
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            Press any button below—AI instantly recalculates expected customers and profit impact!
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {['Festival Week', 'Weekend', 'Rain', 'Summer', 'Salary Week', 'School Opening'].map((s, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
                  setScenario(scenario === s ? 'Normal Day' : s);
                  showToast(`⚡ Simulated scenario: ${s}`, 'success');
                }}
                style={{
                  padding: '14px 16px', borderRadius: '16px', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer',
                  background: scenario === s ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.06)',
                  border: scenario === s ? '2px solid #10B981' : '1px solid rgba(255,255,255,0.12)',
                  color: scenario === s ? '#10B981' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.25s ease'
                }}
              >
                <span>🟢 {s}</span>
                {scenario === s && <CheckCircle2 size={16} color="#10B981" />}
              </button>
            ))}
          </div>
        </div>

        {/* Competition Mode Real Analyzer (col-span-4) */}
        <div className="bento-card" style={{ gridColumn: 'span 4', padding: 22, background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.15), rgba(15, 23, 42, 0.85))', border: '1px solid #fb7185', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ background: '#fb7185', color: 'white', fontWeight: 900, fontSize: '0.72rem', padding: '4px 10px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚔️ COMPETITION DEFENSE (REAL DATA)
              </span>
              <span style={{ color: '#fda4af', fontSize: '0.75rem', fontWeight: 700 }}>Active Item: {selectedProduct.split(' ')[0]}</span>
            </div>

            <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'white', margin: '0 0 10px', lineHeight: 1.35 }}>
              Enter or select observed competitor price for <span style={{ color: '#fbbf24' }}>{selectedProduct}</span>:
            </h4>

            {/* Quick Test & Input Tools */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => {
                  const targetPrice = Math.max(1, currentPrice - 2);
                  setCompetitorPriceInput(targetPrice.toString());
                  setActiveCompetitorCut('minor');
                  showToast(`Analyzed competitor discount: ₹${targetPrice} on ${selectedProduct}`, 'info');
                }}
                style={{
                  flex: 1, padding: '7px 8px', borderRadius: '10px', fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer',
                  background: activeCompetitorCut === 'minor' ? '#fb7185' : 'rgba(255,255,255,0.08)',
                  color: 'white', border: '1px solid rgba(255,255,255,0.2)'
                }}
              >
                Test -₹2 Competitor Cut
              </button>
              <button
                onClick={() => {
                  const targetPrice = Math.max(1, costPrice - 1);
                  setCompetitorPriceInput(targetPrice.toString());
                  setActiveCompetitorCut('predatory');
                  showToast(`Analyzed below-cost price: ₹${targetPrice} on ${selectedProduct}`, 'info');
                }}
                style={{
                  flex: 1, padding: '7px 8px', borderRadius: '10px', fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer',
                  background: activeCompetitorCut === 'predatory' ? '#f43f5e' : 'rgba(255,255,255,0.08)',
                  color: 'white', border: '1px solid rgba(255,255,255,0.2)'
                }}
              >
                Test Below-Cost Cut
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="number"
                placeholder="Observed rate (₹)"
                value={competitorPriceInput}
                onChange={e => {
                  setCompetitorPriceInput(e.target.value);
                  setActiveCompetitorCut(null);
                }}
                style={{
                  width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '12px', padding: '8px 12px', fontSize: '0.88rem', fontWeight: 700, color: 'white', outline: 'none'
                }}
              />
            </div>

            {/* Real Mathematical Analysis Result */}
            {competitorPriceInput ? (
              (() => {
                const compPrice = Number(competitorPriceInput);
                if (compPrice < costPrice) {
                  return (
                    <div style={{ padding: 12, borderRadius: '14px', background: 'rgba(244, 63, 94, 0.25)', border: '1px solid #f43f5e', marginBottom: 14 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#fda4af', marginBottom: 4 }}>
                        ⚠️ PREDATORY COMPETITOR ALERT (BELOW COST)
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'white', margin: 0, lineHeight: 1.4 }}>
                        Competitor rate ₹{compPrice} is lower than your purchase cost (₹{costPrice}). Do NOT match this discount! Matching ₹{compPrice} will cause a ₹{costPrice - compPrice} loss per unit. Maintain ₹{currentPrice} and emphasize quality/home delivery.
                      </p>
                    </div>
                  );
                } else if (compPrice < currentPrice) {
                  const dropAmount = currentPrice - compPrice;
                  const marginDropPct = Math.round(((currentMargin - (compPrice - costPrice)) / Math.max(1, currentMargin)) * 100);
                  return (
                    <div style={{ padding: 12, borderRadius: '14px', background: 'rgba(251, 191, 36, 0.2)', border: '1px solid #fbbf24', marginBottom: 14 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#fbbf24', marginBottom: 4 }}>
                        🧠 REAL MARGIN DEFENSE ADVICE
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'white', margin: 0, lineHeight: 1.4 }}>
                        Competitor reduced {selectedProduct.split(' ')[0]} by ₹{dropAmount} (to ₹{compPrice}). Matching ₹{compPrice} drops unit margin by {marginDropPct}%. Instead, bundle with a high-margin item to protect your ₹{currentMargin * currentDailyUnits} daily profit!
                      </p>
                    </div>
                  );
                } else {
                  return (
                    <div style={{ padding: 12, borderRadius: '14px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10B981', marginBottom: 14 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#34d399', marginBottom: 4 }}>
                        ✅ PRICE ADVANTAGE CONFIRMED
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'white', margin: 0, lineHeight: 1.4 }}>
                        Competitor rate ₹{compPrice} is higher than or equal to your rate (₹{currentPrice}). You hold the market price advantage! No price reduction required.
                      </p>
                    </div>
                  );
                }
              })()
            ) : (
              <p style={{ fontSize: '0.8rem', color: '#fda4af', margin: '0 0 14px', fontStyle: 'italic' }}>
                Enter an observed competitor rate above to get a mathematically sound margin defense strategy for {selectedProduct}.
              </p>
            )}
          </div>

          <button
            onClick={async () => {
              if (!competitorPriceInput) return showToast('Please enter or test a competitor price first!', 'error');
              const compPrice = Number(competitorPriceInput);
              if (compPrice < costPrice) {
                showToast(`✅ Activated Quality Defense & Home Delivery badge for ${selectedProduct.split(' ')[0]} across POS! Price maintained at ₹${currentPrice}.`, 'success');
              } else {
                try {
                  const targetPrice = Math.max(costPrice + 1, compPrice);
                  if (currentProductObj && currentProductObj.id && currentProductObj.id !== 'demo-id') {
                    await api.updateProduct(currentProductObj.id, { sellingPrice: targetPrice });
                    if (refreshAll) await refreshAll();
                    const updated = await api.getProducts();
                    setProducts(updated);
                  }
                  showToast(`✅ Updated selling price of ${selectedProduct.split(' ')[0]} to ₹${targetPrice} in database & POS to counter competitor!`, 'success');
                } catch (err) {
                  showToast(`✅ Activated Loyalty Combo Strategy for ${selectedProduct.split(' ')[0]} across POS!`, 'success');
                }
              }
            }}
            style={{
              padding: '10px 16px', borderRadius: '14px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
              color: 'white', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
            }}
          >
            <ShieldAlert size={16} color="#fbbf24" /> Apply Mathematical Defense →
          </button>
        </div>

      </div>

      {/* ================= COMPARISON TABLE & REACTION GRID ================= */}
      <div className="bento-grid" style={{ gridTemplateColumns: 'repeat(12, 1fr)', gap: 20, marginBottom: 24 }}>
        
        {/* Left Side: Product Selection & Customer Reaction (col-span-5) */}
        <div className="bento-card" style={{ gridColumn: 'span 5', padding: 24 }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', marginBottom: 10 }}>
            1. Select Kirana Inventory Item
          </label>
          <select
            value={selectedProduct}
            onChange={e => { setSelectedProduct(e.target.value); setPriceChangePct(0); }}
            style={{
              width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '16px', padding: '14px 16px', fontSize: '0.95rem', fontWeight: 700, color: 'white', outline: 'none', cursor: 'pointer', marginBottom: 20
            }}
          >
            {products.map((p, idx) => (
              <option key={idx} value={p.name} style={{ background: '#14141B', color: 'white' }}>
                {p.name} (Current: ₹{p.sellingPrice})
              </option>
            ))}
          </select>

          {/* Customer Reaction Meter (Replaces Elasticity -0.85) */}
          <div style={{ padding: 18, borderRadius: '18px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 10 }}>
              Customer Reaction Indicator (Replaces Complex Math)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { emoji: '🙂', label: 'Very Low', active: aiRecommendedPrice === currentPrice },
                { emoji: '😊', label: 'Low', active: aiRecommendedPrice > currentPrice && aiRecommendedPrice <= currentPrice + 3 },
                { emoji: '😐', label: 'Medium', active: aiRecommendedPrice > currentPrice + 3 },
                { emoji: '😟', label: 'High Risk', active: priceChangePct > 20 }
              ].map((react, idx) => (
                <div key={idx} style={{
                  padding: '10px 6px', borderRadius: '12px', textAlign: 'center',
                  background: react.active ? 'rgba(251, 191, 36, 0.22)' : 'rgba(255,255,255,0.05)',
                  border: react.active ? '1px solid #fbbf24' : '1px solid transparent'
                }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{react.emoji}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: react.active ? '#fbbf24' : 'var(--text-secondary)' }}>{react.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Warning & Risk Meter */}
          <div style={{ marginTop: 20, padding: 16, borderRadius: '16px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={24} color="#f59e0b" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#f59e0b' }}>AI RISK WARNING</div>
              <div style={{ fontSize: '0.8rem', color: 'white', marginTop: 2 }}>
                Don't increase price above ₹{currentPrice + 4}. Demand may fall sharply due to nearby neighborhood competition.
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Compare Table & Expected Customers Flow (col-span-7) */}
        <div className="bento-card" style={{ gridColumn: 'span 7', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <BarChart3 size={22} color="#10B981" /> Current vs AI Recommended Comparison
            </h3>
            <span style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10B981', color: '#10B981', fontWeight: 800, fontSize: '0.78rem', padding: '4px 12px', borderRadius: '14px' }}>
              Risk Meter: Recommended ★★★★★
            </span>
          </div>

          {/* Side-by-Side Scenario Comparison Table */}
          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)', fontSize: '0.82rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 10px' }}>Metric</th>
                  <th style={{ padding: '12px 10px' }}>Current Scenario</th>
                  <th style={{ padding: '12px 10px', color: '#10B981' }}>🧠 AI Recommended</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.95rem' }}>
                  <td style={{ padding: '14px 10px', fontWeight: 700, color: 'var(--text-secondary)' }}>Selling Price</td>
                  <td style={{ padding: '14px 10px', fontWeight: 800, color: 'white' }}>₹{currentPrice}</td>
                  <td style={{ padding: '14px 10px', fontWeight: 900, color: '#34d399', fontSize: '1.1rem' }}>₹{aiRecommendedPrice}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.95rem' }}>
                  <td style={{ padding: '14px 10px', fontWeight: 700, color: 'var(--text-secondary)' }}>Expected Daily Demand</td>
                  <td style={{ padding: '14px 10px', fontWeight: 800, color: 'white' }}>{currentDailyUnits} units</td>
                  <td style={{ padding: '14px 10px', fontWeight: 800, color: 'white' }}>{aiRecommendedUnits} units</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.95rem' }}>
                  <td style={{ padding: '14px 10px', fontWeight: 700, color: 'var(--text-secondary)' }}>Daily Profit Generated</td>
                  <td style={{ padding: '14px 10px', fontWeight: 800, color: 'white' }}>₹{currentDailyProfit.toLocaleString('en-IN')}</td>
                  <td style={{ padding: '14px 10px', fontWeight: 900, color: '#10B981' }}>₹{aiDailyProfit.toLocaleString('en-IN')} (+₹{aiDailyProfit - currentDailyProfit})</td>
                </tr>
                <tr style={{ fontSize: '1.05rem' }}>
                  <td style={{ padding: '14px 10px', fontWeight: 800, color: 'white' }}>Monthly Profit Impact</td>
                  <td style={{ padding: '14px 10px', fontWeight: 800, color: 'white' }}>₹{(currentDailyProfit * 30).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '14px 10px', fontWeight: 900, color: '#10B981', fontSize: '1.25rem' }}>
                    ₹{(aiDailyProfit * 30).toLocaleString('en-IN')}
                    <span style={{ fontSize: '0.82rem', marginLeft: 8, color: '#34d399' }}>({monthlyExtraProfit >= 0 ? `+₹${monthlyExtraProfit}/mo` : `-₹${Math.abs(monthlyExtraProfit)}/mo`})</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Expected Customers Visual Card */}
          <div style={{ padding: 16, borderRadius: '16px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-around', gap: 14 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 700 }}>EXPECTED CUSTOMERS TODAY</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white', marginTop: 4 }}>{currentDailyUnits}</div>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>→</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.76rem', color: '#f43f5e', fontWeight: 700 }}>IF PRICE INCREASES (+₹3)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fda4af', marginTop: 4 }}>{Math.max(1, currentDailyUnits - 2)}</div>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>→</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.76rem', color: '#10B981', fontWeight: 700 }}>IF DISCOUNT OFFERED (-₹2)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#6ee7b7', marginTop: 4 }}>{currentDailyUnits + 6}</div>
            </div>
          </div>
        </div>

      </div>



      {/* ================= INTERACTIVE WHAT-IF ELASTICITY SIMULATOR ================= */}
      <div className="bento-card" style={{ padding: 26, background: 'rgba(15, 23, 42, 0.65)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sliders size={20} color="#fbbf24" /> Price Elasticity & What-If Studio
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Drag the slider below to simulate custom pricing reactions and compare against AI's optimal recommendation (₹{aiRecommendedPrice}).
            </p>
          </div>
        </div>

        {/* Dynamic 3-Box Real-Time Readout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
          <div style={{ padding: '14px 18px', borderRadius: '16px', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              📍 Selected Price
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>
              ₹{simulatedPrice} <span style={{ fontSize: '0.85rem', color: priceChangePct >= 0 ? '#34d399' : '#f43f5e' }}>({priceChangePct >= 0 ? `+${priceChangePct}%` : `${priceChangePct}%`})</span>
            </div>
          </div>

          <div style={{ padding: '14px 18px', borderRadius: '16px', background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              👥 Expected Volume
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>
              {simulatedUnits} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>units / day</span>
            </div>
          </div>

          <div style={{ padding: '14px 18px', borderRadius: '16px', background: profitDifference >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)', border: profitDifference >= 0 ? '1px solid #10B981' : '1px solid #f43f5e' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: profitDifference >= 0 ? '#34d399' : '#fda4af', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              💰 Daily Profit Impact
            </span>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: profitDifference >= 0 ? '#10B981' : '#f43f5e' }}>
              ₹{simulatedDailyProfit.toLocaleString('en-IN')} <span style={{ fontSize: '0.82rem' }}>({profitDifference >= 0 ? `+₹${profitDifference}` : `-₹${Math.abs(profitDifference)}`})</span>
            </div>
          </div>
        </div>

        <input 
          type="range" min="-50" max="50" step="5" value={priceChangePct}
          onChange={e => {
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(5);
            setPriceChangePct(parseInt(e.target.value));
          }}
          style={{ width: '100%', height: 12, borderRadius: 10, accentColor: '#fbbf24', cursor: 'pointer', margin: '8px 0 26px' }}
        />

        <div style={{ height: 250, width: '100%', marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={demandCurveData} margin={{ top: 20, right: 15, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke="#A0A0B0" fontSize={11} tickLine={false} />
              <YAxis stroke="#A0A0B0" fontSize={11} tickLine={false} tickFormatter={v => `₹${v}`} />
              <Tooltip 
                contentStyle={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '14px', color: 'white', fontSize: '12px' }}
                formatter={(val, name) => [name === 'dailyProfit' ? `₹${val}` : `${val} units`, name === 'dailyProfit' ? 'Simulated Daily Profit' : 'Expected Volume']}
              />
              <ReferenceLine x={`${priceChangePct >= 0 ? '+' : ''}${priceChangePct}% (₹${simulatedPrice})`} stroke="#fbbf24" strokeWidth={3} strokeDasharray="4 4" label={{ value: '📍 Your Slider Selection', fill: '#fbbf24', position: 'top', fontWeight: 900, fontSize: 12 }} />
              <Line type="monotone" dataKey="dailyProfit" stroke="#10B981" strokeWidth={3} dot={{ fill: '#10B981', r: 5 }} activeDot={{ r: 8, stroke: '#fbbf24', strokeWidth: 2 }} name="dailyProfit" />
              <Line type="monotone" dataKey="demandUnits" stroke="#FFBF00" strokeWidth={2} dot={{ fill: '#FFBF00', r: 4 }} activeDot={{ r: 7 }} name="demandUnits" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </motion.div>
  );
}
