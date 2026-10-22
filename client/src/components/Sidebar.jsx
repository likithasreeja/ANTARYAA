import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, Package, Wallet, Users, Zap, Brain, 
  MessageSquare, ShoppingCart, Globe, LogOut, Store, Sparkles,
  BarChart3, Activity, QrCode, FileSpreadsheet, CreditCard
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { motion } from 'framer-motion';

const navLinks = [
  { path: '/dashboard', icon: Home, label: 'Store Dashboard', badge: null },
  { path: '/product-analytics', icon: BarChart3, label: 'Product Analytics', badge: 'MSE' },
  { path: '/customers', icon: Users, label: 'Customers CRM', badge: null },
  { path: '/payments', icon: QrCode, label: 'UPI QR & Payments', badge: 'UPI' },
  { path: '/decision-center', icon: Zap, label: 'AI Reorders & Pricing', badge: 'CatBoost' },
  { path: '/stock', icon: Package, label: 'Inventory & Stock', badge: null },
  { path: '/inventory-planner', icon: FileSpreadsheet, label: 'Excel Inventory Planner', badge: 'CatBoost' },
  { path: '/sale', icon: ShoppingCart, label: 'Billing (POS)', badge: 'Fast' },
  { path: '/money', icon: Wallet, label: 'Money & Cashbook', badge: null },
  { path: '/learning-engine', icon: Brain, label: 'Store Intelligence (AI)', badge: 'AI' },
  { path: '/analytics-setup', icon: Activity, label: 'Google Analytics 4', badge: 'GA4' },
  { path: '/subscription', icon: CreditCard, label: 'Subscription & Billing', badge: 'UPI' },
  { path: '/ask', icon: MessageSquare, label: 'Ask AI Assistant', badge: null },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { shop, toggleLanguage, logout } = useStore();

  return (
    <aside className="desktop-sidebar">
      {/* Brand Logo & Header */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
          <div style={{
            width: 44, height: 44, borderRadius: '14px',
            background: 'linear-gradient(135deg, var(--accent) 0%, #C04A18 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(255,107,53,0.35)',
            fontWeight: 900, fontSize: '1.45rem', color: 'white',
            fontFamily: 'var(--font-display)'
          }}>
            A
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.5px', color: 'white' }}>
              ANTARYA
            </div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={11} /> DUKAN KA DIMAAG
            </div>
          </div>
        </div>
      </div>

      {/* Friendly AI Status Badge */}
      <div style={{ padding: '16px 20px 8px' }}>
        <div style={{
          background: 'rgba(16, 185, 129, 0.14)', border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '20px', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8,
          fontSize: '0.75rem', fontWeight: 700, color: '#34d399'
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span>🟢 Two-Stage CatBoost Active</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ flex: 1, padding: '12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '8px 10px 4px' }}>
          Navigation
        </div>
        {navLinks.map(link => {
          const Icon = link.icon;
          const isActive = location.pathname === link.path;
          return (
            <motion.button
              key={link.path}
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(link.path)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '12px 14px', borderRadius: '14px', border: 'none',
                background: isActive ? 'linear-gradient(135deg, rgba(255,107,53,0.22) 0%, rgba(255,107,53,0.08) 100%)' : 'transparent',
                color: isActive ? 'white' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500, fontSize: '0.92rem',
                cursor: 'pointer', transition: 'all 0.2s ease',
                borderLeft: isActive ? '4px solid var(--accent)' : '4px solid transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon size={20} color={isActive ? 'var(--accent)' : 'currentColor'} />
                <span>{link.label}</span>
              </div>
              {link.badge && (
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: '10px',
                  background: link.badge === 'MSE' ? 'rgba(56,189,248,0.25)' : link.badge === 'UPI' ? 'rgba(16,185,129,0.25)' : link.badge === 'CatBoost' ? 'rgba(251,191,36,0.25)' : 'rgba(139,92,246,0.25)',
                  color: link.badge === 'MSE' ? '#38bdf8' : link.badge === 'UPI' ? '#34d399' : link.badge === 'CatBoost' ? '#fbbf24' : '#a78bfa'
                }}>
                  {link.badge}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Store Profile & Actions */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <Store size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {shop?.name || 'My Store'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600 }}>
                Store Owner
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            onClick={toggleLanguage}
            className="btn btn-secondary btn-sm"
            style={{ padding: '9px', fontSize: '0.78rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}
          >
            <Globe size={15} /> English 🇬🇧
          </button>
          <button
            onClick={() => { logout(); navigate('/onboarding'); }}
            className="btn btn-secondary btn-sm"
            style={{ padding: '9px', fontSize: '0.78rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#f43f5e', background: 'rgba(244,63,94,0.12)', fontWeight: 700 }}
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
