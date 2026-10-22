import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { Check, FileSpreadsheet, BrainCircuit, BookOpen, ScanLine, Sparkles, TrendingUp } from 'lucide-react';
import api from '../api';
import { trackEvent } from '../utils/analytics';
import { parseStockSheet, stockSheetTemplateCsv, STOCK_SHEET_ACCEPT } from '../utils/stockSheet';

const defaultProducts = [
  { name: 'Rice', nameHindi: 'चावल', emoji: '🍚', sellingPrice: 60, costPrice: 45, unit: 'kg', category: 'Grains', minStock: 10 },
  { name: 'Wheat Flour', nameHindi: 'आटा', emoji: '🌾', sellingPrice: 45, costPrice: 34, unit: 'kg', category: 'Grains', minStock: 10 },
  { name: 'Cooking Oil', nameHindi: 'तेल', emoji: '🛢️', sellingPrice: 95, costPrice: 80, unit: 'L', category: 'Oil', minStock: 5 },
  { name: 'Sugar', nameHindi: 'चीनी', emoji: '🧂', sellingPrice: 42, costPrice: 36, unit: 'kg', category: 'Essentials', minStock: 10 },
  { name: 'Maggi Noodles', nameHindi: 'मैगी', emoji: '🍜', sellingPrice: 14, costPrice: 11, unit: 'pc', category: 'Packaged', minStock: 20 },
  { name: 'Milk', nameHindi: 'दूध', emoji: '🥛', sellingPrice: 28, costPrice: 24, unit: 'L', category: 'Dairy', minStock: 5 },
  { name: 'Tea', nameHindi: 'चाय पत्ती', emoji: '🍵', sellingPrice: 240, costPrice: 200, unit: 'kg', category: 'Beverages', minStock: 2 },
  { name: 'Soap', nameHindi: 'साबुन', emoji: '🧼', sellingPrice: 38, costPrice: 30, unit: 'pc', category: 'Personal Care', minStock: 10 },
  { name: 'Surf Excel', nameHindi: 'सर्फ', emoji: '🧹', sellingPrice: 130, costPrice: 105, unit: 'kg', category: 'Cleaning', minStock: 5 },
  { name: 'Parle-G Biscuit', nameHindi: 'बिस्कुट', emoji: '🍪', sellingPrice: 10, costPrice: 8, unit: 'pc', category: 'Snacks', minStock: 30 },
  { name: 'Cold Drink', nameHindi: 'ठंडा', emoji: '🥤', sellingPrice: 40, costPrice: 33, unit: 'bottle', category: 'Beverages', minStock: 12 },
  { name: 'Bread', nameHindi: 'ब्रेड', emoji: '🍞', sellingPrice: 40, costPrice: 32, unit: 'pc', category: 'Bakery', minStock: 5 },
  { name: 'Eggs', nameHindi: 'अंडा', emoji: '🥚', sellingPrice: 7, costPrice: 5.5, unit: 'pc', category: 'Dairy', minStock: 30 },
  { name: 'Salt', nameHindi: 'नमक', emoji: '🧊', sellingPrice: 22, costPrice: 17, unit: 'kg', category: 'Essentials', minStock: 5 },
  { name: 'Toor Dal', nameHindi: 'तूर दाल', emoji: '🫘', sellingPrice: 140, costPrice: 115, unit: 'kg', category: 'Grains', minStock: 5 },
  { name: 'Chips (Lays)', nameHindi: 'चिप्स', emoji: '🥔', sellingPrice: 20, costPrice: 16, unit: 'pc', category: 'Snacks', minStock: 20 },
  { name: 'Ghee', nameHindi: 'घी', emoji: '🧈', sellingPrice: 560, costPrice: 490, unit: 'kg', category: 'Dairy', minStock: 2 },
  { name: 'Turmeric', nameHindi: 'हल्दी', emoji: '🟡', sellingPrice: 180, costPrice: 140, unit: 'kg', category: 'Spices', minStock: 2 },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { login, showToast } = useStore();

  const [step, setStep] = useState(1);
  const [isLogin, setIsLogin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    trackEvent('onboarding_started', { source: 'landing' });
  }, []);

  // Step 1: Shop details
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Step 2: Product selection
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [customItem, setCustomItem] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customItems, setCustomItems] = useState([]);
  const [isUploadingBill, setIsUploadingBill] = useState(false);
  const [isReadingSheet, setIsReadingSheet] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!shopName || !ownerName || !phone || !password) {
      showToast('Please fill all fields', 'error');
      return;
    }
    setLoading(true);
    try {
      const { token, shop } = await api.register({
        name: shopName,
        ownerName,
        city,
        phone,
        password
      });
      login(token, shop);
      trackEvent('shop_registered', { shop_id: shop.id, city: shop.city || city });
      setStep(2);
    } catch (err) {
      showToast(err.message || 'Registration failed', 'error');
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!phone || !password) {
      showToast('Enter phone and password', 'error');
      return;
    }
    setLoading(true);
    try {
      const { token, shop } = await api.login({ phone, password });
      login(token, shop);
      trackEvent('login_completed', { method: 'phone_password' });
      if (shop.setupComplete) {
        navigate('/');
      } else {
        setStep(2);
      }
    } catch (err) {
      showToast(err.message || 'Login failed', 'error');
    }
    setLoading(false);
  };

  const toggleProduct = (index) => {
    const newSet = new Set(selectedProducts);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setSelectedProducts(newSet);
  };

  const addCustomItem = () => {
    if (!customItem || !customPrice) return;
    setCustomItems([...customItems, {
      name: customItem,
      nameHindi: '',
      emoji: '📦',
      sellingPrice: Number(customPrice),
      costPrice: Math.round(Number(customPrice) * 0.75),
      unit: 'pc',
      category: 'Custom',
      minStock: 5,
      quantity: 10
    }]);
    setCustomItem('');
    setCustomPrice('');
  };

  const handleBillUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingBill(true);
    showToast('Reading bill... please wait ⏳');

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = reader.result;
          const { items } = await api.extractBill(base64);
          
          if (items && items.length > 0) {
            const mappedItems = items.map(item => ({
              name: item.name,
              nameHindi: '',
              emoji: '📦',
              sellingPrice: item.price,
              costPrice: Math.round(item.price * 0.75),
              unit: 'pc',
              category: item.category || 'Custom',
              minStock: 5,
              quantity: item.quantity || 10
            }));
            
            setCustomItems(prev => [...prev, ...mappedItems]);
            showToast(`Added ${items.length} items from bill! 🎉`);
          } else {
            showToast('Could not read items from bill', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Failed to extract items from bill', 'error');
        }
        setIsUploadingBill(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      showToast('Error reading file', 'error');
      setIsUploadingBill(false);
    }
  };

  const handleSheetUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setIsReadingSheet(true);
    try {
      const { products, skipped } = await parseStockSheet(file);
      if (products.length === 0) {
        showToast('No valid items found. Each row needs an item name and a selling price.', 'error');
      } else {
        const existing = new Set(customItems.map(item => item.name.toLowerCase()));
        const fresh = products.filter(p => !existing.has(p.name.toLowerCase()));
        setCustomItems(prev => [...prev, ...fresh]);
        trackEvent('stock_sheet_imported', { count: fresh.length, skipped: skipped.length });
        const skippedCount = skipped.length + (products.length - fresh.length);
        showToast(`Added ${fresh.length} items from ${file.name}${skippedCount ? ` (${skippedCount} rows skipped)` : ''} 🎉`);
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not read this file', 'error');
    }
    setIsReadingSheet(false);
  };

  const downloadSheetTemplate = () => {
    const url = URL.createObjectURL(new Blob([stockSheetTemplateCsv()], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'antarya-items-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFinishSetup = async () => {
    const products = [];

    // Add selected default products with initial stock
    selectedProducts.forEach(index => {
      const p = defaultProducts[index];
      products.push({
        ...p,
        quantity: Math.round(p.minStock * 3 + Math.random() * p.minStock * 2)
      });
    });

    // Add custom items
    customItems.forEach(p => {
      products.push(p);
    });

    if (products.length === 0) {
      showToast('Select at least 1 item to start your shop', 'error');
      return;
    }

    setLoading(true);
    try {
      await api.addProductsBulk(products);
      trackEvent('product_added', { count: products.length });
      await api.completeSetup();
      showToast(`${products.length} items added! Shop is ready! 🎉`, 'success');
      // Force reload to refresh shop data
      window.location.href = '/';
    } catch (err) {
      showToast(err.message || 'Setup failed', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="split-onboarding-container">
      
      {/* LEFT PANEL: Marketing & Value Props */}
      {step === 1 && (
        <div className="split-onboarding-promo">
        <div className="promo-content">
          <div className="promo-badge">⚡ Autonomous Kirana Operating System</div>
          <h1 className="promo-title">Store Intelligence</h1>
          <p className="promo-subtitle">
            ANTARYA is a self-learning, predictive AI that actively multiplies your profit and prevents stockouts before evening rush hours (`Evening Demand Surge`).
          </p>

          <div className="promo-features">
            <div className="promo-feature">
              <div className="promo-feature-icon" style={{ color: 'var(--purple-light)' }}><BrainCircuit size={24} /></div>
              <div>
                <h4>Self-Learning AI Engine</h4>
                <p>Continuously learns from every customer bill and uploaded sales sheet, automatically improving prediction accuracy with each transaction.</p>
              </div>
            </div>

            <div className="promo-feature">
              <div className="promo-feature-icon" style={{ color: '#fbbf24' }}><Sparkles size={24} /></div>
              <div>
                <h4>Predictive Two-Stage Hurdle Model</h4>
                <p>Accurately forecasts customer footfall (`Probability of Sale`) and demand surges (`Evening Demand Surge`) hours before stock runs out.</p>
              </div>
            </div>

            <div className="promo-feature">
              <div className="promo-feature-icon" style={{ color: 'var(--accent)' }}><FileSpreadsheet size={24} /></div>
              <div>
                <h4>Excel Inventory Planner & Bill OCR</h4>
                <p>Upload sales Excel sheets per market to get a CatBoost stock plan, or scan supplier bills (`extractBill`) to restock instantly.</p>
              </div>
            </div>

            <div className="promo-feature">
              <div className="promo-feature-icon" style={{ color: 'var(--success)' }}><TrendingUp size={24} /></div>
              <div>
                <h4>Price Elasticity & What-If Studio</h4>
                <p>Simulate exact profit changes ("If I drop Atta by ₹3, sales jump +18%") verified by real-time SHAP factor breakdown.</p>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* RIGHT PANEL: Form Wizard */}
      <div className="split-onboarding-form" style={step === 2 ? { maxWidth: '100%' } : {}}>
        <div className="setup-wizard-content" style={step === 2 ? { maxWidth: '800px', display: 'block' } : {}}>
          
          {/* Mobile Header (Hidden on Desktop) */}
          <div className="mobile-setup-header">
            <h1>🏪 ANTARYA</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Store Intelligence</p>
          </div>

          <div className="setup-progress">
            <div className={`setup-progress-bar ${step >= 1 ? 'active' : ''}`}></div>
            <div className={`setup-progress-bar ${step === 2 ? 'active' : ''}`}></div>
          </div>

          {step === 1 && (
            <div style={{ animation: 'pageIn 0.4s ease' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>
                {isLogin ? 'Welcome back' : "Let's set up your shop"}
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: '0.95rem' }}>
                {isLogin ? 'Enter your details to access your dashboard.' : 'Enter a few details to get your smart store running.'}
              </p>

              <form onSubmit={isLogin ? handleLogin : handleRegister}>
                {!isLogin && (
                  <>
                    <div className="setup-input-group">
                      <label>Shop Name</label>
                      <input className="setup-input" placeholder="e.g. Patel Kirana Store" value={shopName} onChange={e => setShopName(e.target.value)} required />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div className="setup-input-group">
                        <label>Your Name</label>
                        <input className="setup-input" placeholder="e.g. Raju Bhai" value={ownerName} onChange={e => setOwnerName(e.target.value)} required />
                      </div>
                      <div className="setup-input-group">
                        <label>City</label>
                        <input className="setup-input" placeholder="e.g. Mumbai" value={city} onChange={e => setCity(e.target.value)} required />
                      </div>
                    </div>
                  </>
                )}
                
                <div className="setup-input-group">
                  <label>Mobile Number</label>
                  <input className="setup-input" type="tel" placeholder="e.g. 9876543210" value={phone} onChange={e => setPhone(e.target.value)} required />
                </div>
                
                <div className="setup-input-group" style={{ marginBottom: 32 }}>
                  <label>Password</label>
                  <input className="setup-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>

                <button className="btn-setup" type="submit" disabled={loading}>
                  {loading ? 'Please wait...' : isLogin ? 'Sign In to Dashboard →' : 'Continue to Setup ->'}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: 32, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {isLogin ? "Don't have an account?" : 'Already have a shop?'}
                <button 
                  type="button"
                  onClick={() => setIsLogin(!isLogin)} 
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, marginLeft: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' }}
                >
                  {isLogin ? 'Register now' : 'Sign in'}
                </button>
              </div>

              {/* Clean setup/login only without demo injection button */}

            </div>
          )}

          {step === 2 && (
            <div style={{ animation: 'pageIn 0.4s ease' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>
                What do you sell?
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: '0.95rem' }}>
                Select popular items from below, upload your item list from Excel, or scan a purchase bill using AI.
              </p>

              {/* Import item list from Excel / CSV */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.02))',
                borderRadius: 'var(--radius-lg)',
                padding: 20,
                marginBottom: 16,
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ background: 'var(--success)', color: 'white', padding: 10, borderRadius: 12 }}>
                    <FileSpreadsheet size={24} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-display)' }}>Upload Excel / CSV Item List</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                      Already keep your items in a sheet? Upload .xlsx, .xls or .csv with an Item Name and Selling Price column. Cost Price, Stock, Unit, Category and Min Stock are optional.{' '}
                      <button type="button" onClick={downloadSheetTemplate} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--success)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                        Download sample
                      </button>
                    </p>
                    <label className="btn btn-secondary btn-full" style={{ position: 'relative', overflow: 'hidden', padding: '10px 16px' }}>
                      {isReadingSheet ? 'Reading sheet... ⏳' : '📊 Upload Excel / CSV'}
                      <input type="file" accept={STOCK_SHEET_ACCEPT} onChange={handleSheetUpload} disabled={isReadingSheet} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Upload Bill / Receipt (AI Feature) */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.02))',
                borderRadius: 'var(--radius-lg)',
                padding: 20,
                marginBottom: 24,
                border: '1px solid rgba(139, 92, 246, 0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ background: 'var(--purple)', color: 'white', padding: 10, borderRadius: 12 }}>
                    <ScanLine size={24} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-display)' }}>Scan Purchase Bill ✨</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                      Don't want to enter stock manually? Upload your wholesale bill, and our AI will automatically extract items, prices, and quantities.
                    </p>
                    <label className="btn btn-secondary btn-full" style={{ position: 'relative', overflow: 'hidden', padding: '10px 16px' }}>
                      {isUploadingBill ? 'Scanning using Gemini AI... ⏳' : '📷 Take Photo or Upload Bill'}
                      <input type="file" accept="image/*" capture="environment" onChange={handleBillUpload} disabled={isUploadingBill} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Added Items Preview */}
              {customItems.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 12, fontWeight: 600 }}>Successfully Scanned / Added:</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {customItems.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--success-bg)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span>📦</span>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{item.name}</span>
                        </div>
                        <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem' }}>{item.quantity} qty</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Selection Grid */}
              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 12, fontWeight: 600 }}>Or Select Popular Defaults:</h4>
              <div className="checkbox-grid" style={{ marginBottom: 24, maxHeight: '40vh', overflowY: 'auto', paddingRight: 4 }}>
                {defaultProducts.map((product, index) => (
                  <div
                    key={index}
                    className={`checkbox-item ${selectedProducts.has(index) ? 'checked' : ''}`}
                    onClick={() => toggleProduct(index)}
                  >
                    <span className="emoji">{product.emoji}</span>
                    <div>
                      <div className="name">{product.name}</div>
                      <div className="name-hindi">₹{product.sellingPrice}/{product.unit}</div>
                    </div>
                    <div className="checkbox-check">
                      {selectedProducts.has(index) && <Check size={14} color="white" />}
                    </div>
                  </div>
                ))}
              </div>

              {/* Fallback Custom Addition */}
              <div style={{ marginBottom: 32, display: 'flex', gap: 10 }}>
                <input className="setup-input" placeholder="Item name" value={customItem} onChange={e => setCustomItem(e.target.value)} style={{ flex: 2 }} />
                <input className="setup-input" type="number" placeholder="Price" value={customPrice} onChange={e => setCustomPrice(e.target.value)} style={{ flex: 1 }} />
                <button onClick={addCustomItem} disabled={!customItem || !customPrice} style={{ width: 44, borderRadius: 'var(--radius-md)', background: 'var(--glass)', color: 'white', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>+</button>
              </div>

              <button className="btn-setup" onClick={handleFinishSetup} disabled={loading || (selectedProducts.size === 0 && customItems.length === 0)}>
                {loading ? 'Initializing Shop...' : `Launch Shop ->`}
              </button>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
