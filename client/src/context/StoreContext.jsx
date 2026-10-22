import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';
import { setAnalyticsUser, clearAnalyticsUser } from '../utils/analytics';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('antarya_token'));
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [language, setLanguage] = useState('en'); // English-only UI

  // Centralized Data Caching for 0ms tab switching
  const [cache, setCache] = useState({
    products: null,
    customers: null,
    dashboard: null,
    lastUpdated: null
  });

  const isAuthenticated = !!token && !!shop;

  const toggleLanguage = () => {
    // This English-only build keeps the interface in English.
    localStorage.setItem('antarya_lang', 'en');
    setLanguage('en');
    showToast('English is enabled for this version. 🇬🇧');
  };

  // Load shop data on mount
  useEffect(() => {
    if (token) {
      api.getMe()
        .then(data => {
          setAnalyticsUser(data);
          setShop(data);
          setLoading(false);
          // Pre-warm cache in background
          refreshAll();
        })
        .catch(() => {
          clearAnalyticsUser();
          localStorage.removeItem('antarya_token');
          setToken(null);
          setShop(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  const refreshAll = async () => {
    if (!token) return;
    try {
      const [products, customers, dashboard] = await Promise.all([
        api.getProducts().catch(() => cache.products || []),
        api.getCustomers().catch(() => cache.customers || []),
        api.getDashboard().catch(() => cache.dashboard || null)
      ]);
      setCache({ products, customers, dashboard, lastUpdated: Date.now() });
    } catch (err) {
      console.error('Cache refresh failed:', err);
    }
  };

  const getCachedProducts = async (force = false) => {
    if (!force && cache.products) return cache.products;
    const data = await api.getProducts();
    setCache(prev => ({ ...prev, products: data, lastUpdated: Date.now() }));
    return data;
  };

  const getCachedCustomers = async (force = false) => {
    if (!force && cache.customers) return cache.customers;
    const data = await api.getCustomers();
    setCache(prev => ({ ...prev, customers: data, lastUpdated: Date.now() }));
    return data;
  };

  const login = (newToken, shopData) => {
    setAnalyticsUser(shopData);
    localStorage.setItem('antarya_token', newToken);
    setToken(newToken);
    setShop(shopData);
    refreshAll();
  };

  const logout = () => {
    clearAnalyticsUser();
    localStorage.removeItem('antarya_token');
    setToken(null);
    setShop(null);
    setCache({ products: null, customers: null, dashboard: null, lastUpdated: null });
  };

  const updateShop = (updates) => {
    setShop(prev => ({ ...prev, ...updates }));
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <StoreContext.Provider value={{
      token,
      shop,
      isAuthenticated,
      loading,
      language,
      toggleLanguage,
      cache,
      refreshAll,
      getCachedProducts,
      getCachedCustomers,
      login,
      logout,
      updateShop,
      showToast
    }}>
      {children}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
