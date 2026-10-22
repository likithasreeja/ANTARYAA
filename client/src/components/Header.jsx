import { useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Plus, Sparkles, Bell, Calendar } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useState, useEffect } from 'react';

export default function Header() {
  const navigate = useNavigate();
  const { shop } = useStore();
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(now.toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short'
      }) + ' • ' + now.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit'
      }));
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="desktop-header">
      {/* Left: Store Title & Live Clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'white', fontFamily: 'var(--font-display)' }}>
            {shop?.name || 'Kirana Command Center'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            <Calendar size={12} color="var(--text-muted)" />
            <span>{timeStr}</span>
          </div>
        </div>
      </div>

      {/* Middle: AI Search / Ask Input Trigger */}
      <div 
        onClick={() => navigate('/ask')}
        style={{
          flex: 1, maxWidth: 460, margin: '0 24px',
          background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '1.2rem', padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', transition: 'all 0.2s ease', color: 'var(--text-secondary)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
        }}
        onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(255,107,53,0.4)'}
        onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
      >
        <Sparkles size={16} color="var(--accent)" />
        <span style={{ fontSize: '0.85rem', flex: 1 }}>Ask AI anything or search shop inventory...</span>
        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontWeight: 600 }}>
          Ask AI
        </span>
      </div>

      {/* Right: Quick Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate('/add-stock')}
          className="btn btn-secondary btn-sm"
          style={{ padding: '9px 14px', borderRadius: '12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} /> Add Stock
        </button>

        <button
          onClick={() => navigate('/sale')}
          className="btn btn-primary btn-sm"
          style={{ padding: '9px 18px', borderRadius: '12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 15px rgba(255,107,53,0.35)' }}
        >
          <ShoppingCart size={16} /> New Sale
        </button>
      </div>
    </header>
  );
}
