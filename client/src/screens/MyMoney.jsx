import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { Plus, Trash2, ArrowLeft, TrendingUp, TrendingDown, Wallet, Calendar, PieChart, QrCode } from 'lucide-react';
import api from '../api';
import ConfirmModal from '../components/ConfirmModal';
import { SkeletonCard, SkeletonList } from '../components/Skeleton';

const CATEGORIES = [
  { value: 'Rent', emoji: '🏠', label: 'Shop Rent' },
  { value: 'Electricity', emoji: '💡', label: 'Electricity Bill' },
  { value: 'Water', emoji: '💧', label: 'Water Bill' },
  { value: 'Stock Purchase', emoji: '📦', label: 'Stock Purchase' },
  { value: 'Salary', emoji: '👤', label: 'Salary / Labour' },
  { value: 'Transport', emoji: '🚛', label: 'Transport / Delivery' },
  { value: 'Phone/Internet', emoji: '📱', label: 'Phone / Internet' },
  { value: 'Maintenance', emoji: '🔧', label: 'Maintenance / Repair' },
  { value: 'Tax', emoji: '📋', label: 'Tax / GST' },
  { value: 'General', emoji: '💸', label: 'Other / General' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Quick expense presets for common monthly bills
const QUICK_PRESETS = [
  { label: '🏠 Monthly Rent', category: 'Rent', placeholder: '5000' },
  { label: '💡 Electricity', category: 'Electricity', placeholder: '1200' },
  { label: '👤 Labour Salary', category: 'Salary', placeholder: '8000' },
  { label: '📱 Phone/WiFi', category: 'Phone/Internet', placeholder: '500' },
];

export default function MyMoney() {
  const { showToast } = useStore();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [expenseData, setExpenseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState(null);

  // Expense form
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('General');
  const [expenseDate, setExpenseDate] = useState('');

  useEffect(() => {
    const now = new Date();
    setExpenseDate(now.toISOString().split('T')[0]);
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dash, exp] = await Promise.all([
        api.getDashboard(),
        api.getExpenses()
      ]);
      setDashboard(dash);
      setExpenseData(exp);
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  };

  const handleAddExpense = async () => {
    if (!expenseDesc || !expenseAmount) {
      showToast('Enter description and amount', 'error');
      return;
    }
    try {
      const d = new Date(expenseDate);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      await api.addExpense({
        description: expenseDesc,
        amount: Number(expenseAmount),
        category: expenseCategory,
        month: monthStr,
        date: expenseDate
      });
      showToast(`₹${expenseAmount} expense saved!`);
      setShowExpenseForm(false);
      setExpenseDesc('');
      setExpenseAmount('');
      setExpenseCategory('General');
      loadData();
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
  };

  const handleQuickPreset = (preset) => {
    setExpenseDesc(preset.label.replace(/^[^\s]+\s/, ''));
    setExpenseCategory(preset.category);
    setExpenseAmount('');
    setShowExpenseForm(true);
    setActiveTab('expenses');
  };

  const handleDeleteExpense = (id) => {
    setConfirmDeleteExpenseId(id);
  };

  const executeDeleteExpense = async () => {
    if (!confirmDeleteExpenseId) return;
    try {
      await api.deleteExpense(confirmDeleteExpenseId);
      showToast('Expense deleted');
      setConfirmDeleteExpenseId(null);
      loadData();
    } catch (err) {
      showToast('Could not delete', 'error');
    }
  };

  const formatMoney = (amount) => `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;
  const getEmoji = (cat) => CATEGORIES.find(c => c.value === cat)?.emoji || '💸';

  // Safely access expense data - backend returns "byMonth" not "monthlyBreakdown"
  const monthlyGroups = expenseData?.byMonth || [];
  const categoryTotals = expenseData?.categoryTotals || {};
  const currentMonthTotal = expenseData?.currentMonthTotal || 0;

  if (loading || !dashboard) {
    return (
      <div className="page" style={{ paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)' }} />
            <div>
              <h1 className="page-title" style={{ fontSize: '1.4rem', marginBottom: 2 }}>Cash Flow</h1>
              <p className="page-subtitle" style={{ fontSize: '0.8rem' }}>Loading finances...</p>
            </div>
          </div>
        </div>
        <SkeletonList count={4} />
      </div>
    );
  }

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ padding: 8, width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title" style={{ fontSize: '1.4rem', marginBottom: 2 }}>Cashbook</h1>
            <p className="page-subtitle" style={{ fontSize: '0.8rem' }}>Track income & expenses</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/payments')} style={{ padding: '8px 16px', borderRadius: '2rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <QrCode size={16} /> UPI Payments
          </button>
          <button className="btn btn-primary" onClick={() => { setActiveTab('expenses'); setShowExpenseForm(true); }} style={{ padding: '8px 16px', borderRadius: '2rem', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
            <Plus size={16} style={{marginRight: 4}}/> Expense
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--glass)', borderRadius: '1rem', padding: 4, marginBottom: 24, border: '1px solid var(--glass-border)' }}>
        {['overview', 'expenses'].map(tab => (
          <button key={tab}
            onClick={() => setActiveTab(tab)} 
            style={{ flex: 1, padding: '10px', borderRadius: '0.8rem', border: 'none', background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent', color: activeTab === tab ? 'white' : 'var(--text-secondary)', fontWeight: 600, transition: 'all 0.2s', cursor: 'pointer', textTransform: 'capitalize' }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ============ OVERVIEW TAB ============ */}
      {activeTab === 'overview' && (
        <div className="animate-in">
          {/* Cash In Hand Hero */}
          <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.05) 100%)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '1.5rem', padding: '1.5rem', textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Wallet size={16} /> Cash In Hand
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 900, color: dashboard.cashInHand < 0 ? '#f43f5e' : 'white', letterSpacing: '-1px' }}>
              {formatMoney(dashboard.cashInHand)}
            </div>
          </div>

          {/* Income vs Expense Cards */}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', padding: 20, borderRadius: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', marginBottom: 8 }}>
                <TrendingUp size={20} /> <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Income</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{formatMoney(dashboard.monthSales)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>This Month Sales</div>
            </div>
            
            <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.15)', padding: 20, borderRadius: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f43f5e', marginBottom: 8 }}>
                <TrendingDown size={20} /> <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Expenses</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f43f5e' }}>
                {formatMoney(currentMonthTotal)}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>This Month Out</div>
            </div>
          </div>

          {/* Profit Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '1.2rem', padding: 20, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Monthly Profit</span>
              <span style={{ fontSize: '1.6rem', fontWeight: 900, color: (dashboard.monthSales - currentMonthTotal) >= 0 ? '#10b981' : '#f43f5e' }}>
                {formatMoney(dashboard.monthSales - currentMonthTotal)}
              </span>
            </div>
          </div>

          {/* Category Breakdown (Pie chart summary) */}
          {Object.keys(categoryTotals).length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '1.2rem', padding: 20, marginBottom: 24 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <PieChart size={18} color="var(--primary)" /> Where Money Goes
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(categoryTotals).sort((a,b) => b[1] - a[1]).map(([cat, total]) => {
                  const pct = currentMonthTotal > 0 ? Math.round((total / currentMonthTotal) * 100) : 0;
                  return (
                    <div key={cat}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{getEmoji(cat)} {cat}</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f43f5e' }}>{formatMoney(total)} ({pct}%)</span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#f43f5e', borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Add Expense Presets */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Quick Expenses</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {QUICK_PRESETS.map((preset, i) => (
                <button key={i} onClick={() => handleQuickPreset(preset)} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '1rem', padding: '16px', textAlign: 'left', cursor: 'pointer', color: 'white', fontSize: '0.9rem', fontWeight: 600 }}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ EXPENSES TAB ============ */}
      {activeTab === 'expenses' && (
        <div className="animate-in">
          
          {/* Add Expense Form Card */}
          {showExpenseForm && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '1.2rem', padding: 20, marginBottom: 24, position: 'relative' }}>
              <button 
                onClick={() => setShowExpenseForm(false)} 
                style={{ position: 'absolute', top: 16, right: 16, background: 'var(--glass)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
              <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#f43f5e' }}>Record Expense</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>What was this for?</label>
                  <input className="input" placeholder="e.g. Paid electricity bill" value={expenseDesc} onChange={e=>setExpenseDesc(e.target.value)} style={{ padding: '14px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Amount (₹)</label>
                  <input className="input" type="number" placeholder="500" value={expenseAmount} onChange={e=>setExpenseAmount(e.target.value)} style={{ padding: '14px', fontSize: '1.1rem' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Category</label>
                    <select className="input" value={expenseCategory} onChange={e=>setExpenseCategory(e.target.value)} style={{ padding: '14px' }}>
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Date</label>
                    <input className="input" type="date" value={expenseDate} onChange={e=>setExpenseDate(e.target.value)} style={{ padding: '14px' }} />
                  </div>
                </div>
              </div>
              <button className="btn" style={{ background: '#f43f5e', color: 'white', width: '100%', marginTop: 20, padding: 16, fontSize: '1rem', fontWeight: 700, borderRadius: '1rem' }} onClick={handleAddExpense}>
                 Save Expense
              </button>
            </div>
          )}

          {/* This Month Summary at Top */}
          {!showExpenseForm && (
            <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.15)', borderRadius: '1.2rem', padding: 20, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>This Month Expenses</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f43f5e' }}>{formatMoney(currentMonthTotal)}</div>
              </div>
              <button className="btn btn-primary" onClick={() => setShowExpenseForm(true)} style={{ borderRadius: '2rem' }}>
                <Plus size={16} style={{marginRight: 4}} /> Add
              </button>
            </div>
          )}

          {/* Expense List grouped by month */}
          {monthlyGroups.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
              <span style={{ fontSize: '3rem', display: 'block', marginBottom: 16 }}>📝</span>
              <h3>No Expenses Yet</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Start tracking your shop expenses like rent, electricity, salaries and more.</p>
              <button className="btn btn-primary" onClick={() => setShowExpenseForm(true)}>Record First Expense</button>
            </div>
          ) : (
            monthlyGroups.map((monthGroup, idx) => {
              const [year, monthNum] = (monthGroup.month || '').split('-');
              const monthLabel = monthNum ? `${MONTH_NAMES[parseInt(monthNum)-1]} ${year}` : 'Unknown';
              
              return (
                <div key={idx} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--glass-border)', paddingBottom: 8 }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'white', fontWeight: 700 }}>
                       <Calendar size={18} color="#f43f5e" />
                       {monthLabel}
                     </div>
                     <div style={{ fontSize: '0.9rem', color: '#f43f5e', fontWeight: 800 }}>
                       -{formatMoney(monthGroup.total)}
                     </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {monthGroup.expenses.map(expense => (
                      <div key={expense.id} style={{ 
                        background: 'var(--bg-card)', padding: 16, borderRadius: '1rem', border: '1px solid var(--glass-border)',
                        display: 'flex', alignItems: 'center', gap: 16
                      }}>
                        <div style={{ 
                          width: 48, height: 48, borderRadius: '12px', background: 'rgba(255,255,255,0.05)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
                          flexShrink: 0
                        }}>
                          {getEmoji(expense.category)}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'white', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{expense.description}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                            {expense.date ? new Date(expense.date).toLocaleDateString('en-IN') : ''} • {expense.category}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f43f5e' }}>
                            -{formatMoney(expense.amount)}
                          </div>
                          <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 4, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => handleDeleteExpense(expense.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDeleteExpenseId}
        title="Delete Expense"
        message="Are you sure you want to delete this expense record from your cash flow history?"
        confirmText="Yes, Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={executeDeleteExpense}
        onCancel={() => setConfirmDeleteExpenseId(null)}
      />

      <div style={{ height: 40 }}></div>
    </div>
  );
}
