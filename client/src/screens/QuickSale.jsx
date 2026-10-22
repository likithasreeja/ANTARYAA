import { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { Check, X, Plus, Minus, User, ShoppingBag, ArrowLeft, Search, Printer, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { generateInvoice, downloadInvoice } from '../utils/generateInvoice';
import { trackEvent } from '../utils/analytics';
import PaymentQRModal from '../components/PaymentQRModal';

export default function QuickSale() {
  const { shop, showToast, refreshAll } = useStore();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [saleItems, setSaleItems] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [lastCompletedSale, setLastCompletedSale] = useState(null);

  // Credit state
  const [showCredit, setShowCredit] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [buyerName, setBuyerName] = useState('');

  useEffect(() => {
    api.getProducts().then(setProducts).catch(console.error);
    api.getCustomers().then(setCustomers).catch(console.error);
  }, []);

  const addManualItem = (product) => {
    const existing = saleItems.find(i => i.productId === product.id);
    if (existing) {
      setSaleItems(saleItems.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1, itemTotal: (i.quantity + 1) * i.price } : i));
    } else {
      setSaleItems([...saleItems, { productId: product.id, productName: product.name, quantity: 1, unit: product.unit, price: product.sellingPrice, itemTotal: product.sellingPrice }]);
    }
    setShowResult(true);
    setShowManual(false);
    setManualSearch('');
  };

  const updateQty = (productId, delta) => {
    setSaleItems(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(0.5, item.quantity + delta);
        return { ...item, quantity: newQty, itemTotal: newQty * item.price };
      }
      return item;
    }));
  };

  const removeItem = (productId) => {
    const updated = saleItems.filter(i => i.productId !== productId);
    setSaleItems(updated);
    if (updated.length === 0) setShowResult(false);
  };

  const total = saleItems.reduce((sum, i) => sum + i.itemTotal, 0);

  const completeSale = async (paymentType, udhaarName, paymentId) => {
    setLoading(true);
    try {
      const finalCustomer = paymentType.toLowerCase() === 'udhaar' ? udhaarName : (buyerName || 'Walk-in Customer');
      const recorded = await api.recordSale({
        items: saleItems, 
        totalAmount: total, 
        paymentType: paymentType.toLowerCase(),
        customerName: finalCustomer,
        paymentId,
      });
      
      trackEvent('sale_created', {
        sale_id: recorded.id,
        amount: total,
        payment_method: paymentType.toLowerCase(),
        item_count: saleItems.length
      });

      if (refreshAll) await refreshAll();
      api.getProducts().then(setProducts).catch(console.error);

      setLastCompletedSale({
        shop,
        items: saleItems.map(i => ({ name: i.productName, qty: i.quantity, price: i.price, unit: i.unit })),
        total,
        method: paymentType.toUpperCase(),
        customerName: finalCustomer,
        invoiceNo: `INV-${String(recorded.id).slice(0, 8).toUpperCase()}`,
        date: recorded.createdAt
      });
      setSuccess(paymentType);
    } catch (err) {
      showToast(err.message || 'Sale failed', 'error');
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', background: 'var(--bg-primary)', padding: '20px' }}>
        <div className="animate-in" style={{ textAlign: 'center', width: '100%', maxWidth: 360 }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Check size={48} color="#10b981" />
          </div>
          <h1 style={{ fontSize: '2rem', marginBottom: 8 }}>Sale Recorded!</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: 32 }}>₹{total.toLocaleString('en-IN')} via {success}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              className="btn btn-primary"
              onClick={() => lastCompletedSale && generateInvoice(lastCompletedSale)}
              style={{ padding: '16px', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#10b981', boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}
            >
              <span>🖨️ Print Receipt / Invoice</span>
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => lastCompletedSale && downloadInvoice(lastCompletedSale).catch(err => showToast(err.message || 'Could not create the bill PDF', 'error'))}
              style={{ padding: '14px', fontSize: '1rem' }}
            >
              ⬇️ Download Bill (PDF)
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => {
                setSuccess(false); setShowResult(false); setSaleItems([]); setShowCredit(false);
                setCustomerName(''); setCustomerSearch(''); setBuyerName('');
              }}
              style={{ padding: '14px', fontSize: '1rem' }}
            >
              Start New Sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ padding: 8, width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.4rem', marginBottom: 2 }}>New Sale</h1>
          <p className="page-subtitle" style={{ fontSize: '0.8rem' }}>Fast checkout</p>
        </div>
      </div>

      {/* Product Selection */}
      {(showManual || !showResult) && (
        <div className="animate-in" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '1rem', padding: '0 16px', marginBottom: 16 }}>
             <Search size={20} color="var(--text-muted)" />
             <input type="text" placeholder="Search products..." value={manualSearch} onChange={e => setManualSearch(e.target.value)} autoFocus style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', padding: '16px 12px', fontSize: '1rem', outline: 'none' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
            {products.filter(p => p.name.toLowerCase().includes(manualSearch.toLowerCase())).map(p => (
              <div key={p.id} onClick={() => addManualItem(p)} className="hover-scale" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer' }}>
                 <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'var(--glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: '1.2rem', fontWeight: 700 }}>{p.name[0]}</div>
                 <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{p.name}</div>
                 <div style={{ color: 'var(--primary)', fontWeight: 800 }}>₹{p.sellingPrice}</div>
              </div>
            ))}
          </div>
          
          {showResult && (
            <button className="btn btn-ghost btn-full" onClick={() => setShowManual(false)} style={{ marginTop: 20 }}>Cancel</button>
          )}
        </div>
      )}

      {/* Shopping Cart Result */}
      {showResult && !showCredit && (
        <div className="animate-in" style={{ position: 'relative' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '1.5rem', padding: 20, marginBottom: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                 <ShoppingBag size={20} color="var(--primary)" />
                 <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Current Order</span>
              </div>
              <button onClick={() => setShowManual(true)} style={{ background: 'var(--glass)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 600 }}>+ Add Item</button>
            </div>

            {/* Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
              {saleItems.map((item) => (
                <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                     <div style={{ fontWeight: 600, fontSize: '1rem' }}>{item.productName}</div>
                     <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>₹{item.price}/{item.unit}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--glass)', borderRadius: '2rem', padding: 4 }}>
                      <button onClick={() => item.quantity <= 0.5 ? removeItem(item.productId) : updateQty(item.productId, -0.5)} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-primary)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={14}/></button>
                      <span style={{ width: 32, textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>{item.quantity}</span>
                      <button onClick={() => updateQty(item.productId, 1)} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-primary)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={14}/></button>
                    </div>
                    <div style={{ width: 60, textAlign: 'right', fontWeight: 800, fontSize: '1.05rem', color: 'var(--primary)' }}>₹{item.itemTotal}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: '1rem' }}>
              <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>Total Amount</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white' }}>₹{total.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <input type="text" className="input" placeholder="Customer Name (Optional)" value={buyerName} onChange={e => setBuyerName(e.target.value)} style={{ padding: '16px', borderRadius: '1rem' }} />
          </div>

          {/* Checkout Buttons */}
          <button
            onClick={() => setShowQRModal(true)}
            disabled={loading}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: 'white',
              border: 'none',
              padding: '18px',
              borderRadius: '1rem',
              fontWeight: 800,
              fontSize: '1.15rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              marginBottom: 12,
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
            }}
          >
            <QrCode size={22} /> Pay via UPI QR
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
             <button onClick={() => completeSale('Cash')} disabled={loading} style={{ background: '#10b981', color: 'white', border: 'none', padding: 18, borderRadius: '1rem', fontWeight: 800, fontSize: '1.05rem' }}>Paid Cash</button>
             <button onClick={() => completeSale('UPI')} disabled={loading} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: 18, borderRadius: '1rem', fontWeight: 800, fontSize: '1.05rem' }}>Paid UPI</button>
          </div>
          <button onClick={() => setShowCredit(true)} style={{ width: '100%', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', padding: 16, borderRadius: '1rem', fontWeight: 800, fontSize: '1.05rem' }}>Customer Credit (Udhaar)</button>
          <button className="btn btn-ghost btn-full" onClick={() => { setShowResult(false); setSaleItems([]); }} style={{ marginTop: 16 }}>Discard Order</button>

          {/* Payment QR Modal */}
          <PaymentQRModal
            isOpen={showQRModal}
            onClose={() => setShowQRModal(false)}
            customer={{ name: buyerName }}
            initialAmount={total}
            purpose="checkout"
            onSuccess={(payment) => {
              setShowQRModal(false);
              completeSale('UPI', buyerName, payment?.id);
            }}
          />
        </div>
      )}

      {/* Credit Modal Overlay */}
      {showCredit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="animate-in" style={{ background: '#0f172a', width: '100%', maxWidth: 400, borderRadius: '24px 24px 0 0', padding: 24, paddingBottom: 40, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b', margin: 0 }}>Create Credit</h3>
              <button onClick={() => setShowCredit(false)} style={{ background: 'var(--glass)', border: 'none', color: 'var(--text-muted)', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: 24 }}>
              <input className="input" placeholder="Search or Enter Customer Name" autoFocus value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setCustomerName(e.target.value); }} style={{ padding: '16px', fontSize: '1.05rem' }} />
              
              {customerSearch && (
                <div style={{ marginTop: 12, maxHeight: 150, overflowY: 'auto', background: 'var(--glass)', borderRadius: '1rem', padding: 8 }}>
                  {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                    <div key={c.id} onClick={() => { setCustomerName(c.name); setCustomerSearch(c.name); }} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', fontWeight: 600 }}>
                      {c.name}
                    </div>
                  ))}
                  {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && (
                     <div style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>New customer "{customerSearch}" will be created</div>
                  )}
                </div>
              )}
            </div>

            <button className="btn btn-primary" onClick={() => completeSale('Credit', customerName)} disabled={!customerName || loading} style={{ width: '100%', padding: '18px', fontSize: '1.1rem', fontWeight: 800, borderRadius: '1rem', background: '#f59e0b', color: '#000' }}>
              Confirm ₹{total.toLocaleString('en-IN')} Credit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
