import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Package, Wallet, Menu, ShoppingCart, Globe, X } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../context/StoreContext';

const mainTabs = [
  { path: '/dashboard', icon: Home, label: 'Home' },
  { path: '/stock', icon: Package, label: 'Stock' },
  { path: '/sale', icon: null, label: 'Sale' },
  { path: '/money', icon: Wallet, label: 'Money' },
  { path: '/more', icon: Menu, label: 'More' },
];

const moreItems = [
  { path: '/product-analytics', emoji: '📊', label: 'Product Analytics (MSE)' },
  { path: '/customers', emoji: '👥', label: 'Customers CRM' },
  { path: '/decision-center', emoji: '⚡', label: "AI Reorders & Pricing" },
  { path: '/learning-engine', emoji: '🧠', label: 'Store Intelligence (CatBoost)' },
  { path: '/analytics-setup', emoji: '📈', label: 'Google Analytics 4' },
  { path: '/inventory-planner', emoji: '📑', label: 'Excel Inventory Planner (CatBoost)' },
  { path: '/payments', emoji: '📱', label: 'UPI QR & Payments' },
  { path: '/subscription', emoji: '💳', label: 'Subscription & Monthly Payments' },
  { path: '/add-stock', emoji: '📦', label: 'Add Inbound Stock' },
  { path: '/ask', emoji: '💬', label: 'Ask AI Assistant' },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const { language, toggleLanguage, logout } = useStore();

  const handleNav = (path) => {
    if (path === '/more') {
      setShowMore(!showMore);
      return;
    }
    setShowMore(false);
    navigate(path);
  };

  return (
    <>
      {/* More Menu Overlay */}
      {showMore && (
        <div className="modal-overlay" onClick={() => setShowMore(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle"></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>More Options</h3>
              <button
                onClick={toggleLanguage}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: '2rem', padding: '6px 14px' }}
              >
                <Globe size={15} /> English 🇬🇧
              </button>
            </div>

            {moreItems.map(item => (
              <div
                key={item.path}
                className="list-item"
                onClick={() => { navigate(item.path); setShowMore(false); }}
              >
                <div className="list-item-icon">{item.emoji}</div>
                <div className="list-item-content">
                  <div className="list-item-title">{item.label}</div>
                </div>
              </div>
            ))}

            <div
              className="list-item"
              onClick={() => {
                logout();
                setShowMore(false);
                navigate('/onboarding');
              }}
              style={{ background: 'rgba(244, 63, 94, 0.1)', marginTop: 12 }}
            >
              <div className="list-item-icon">🚪</div>
              <div className="list-item-content">
                <div className="list-item-title" style={{ color: '#f43f5e' }}>
                  Logout from Shop
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        {mainTabs.map(tab => {
          if (tab.path === '/sale') {
            return (
              <button
                key={tab.path}
                className="nav-sale-btn"
                onClick={() => handleNav(tab.path)}
                id="nav-sale"
              >
              <ShoppingCart />
              </button>
            );
          }

          const Icon = tab.icon;
          const isActive = tab.path === '/more'
            ? showMore
            : location.pathname === tab.path;

          return (
            <button
              key={tab.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => handleNav(tab.path)}
              id={`nav-${tab.label.toLowerCase()}`}
            >
              <Icon />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
