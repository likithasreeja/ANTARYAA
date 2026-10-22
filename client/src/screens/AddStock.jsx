import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { Camera, PenLine, Check, Plus, ArrowLeft, Package, Search, X, ChevronRight } from 'lucide-react';
import api from '../api';
import { trackEvent } from '../utils/analytics';

export default function AddStock() {
  const { showToast } = useStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // 'photo', 'manual'
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);

  // Manual mode state
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [addQty, setAddQty] = useState('');
  const [addCost, setAddCost] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // New product state
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('pc');

  useEffect(() => {
    api.getProducts().then(setProducts).catch(console.error);
  }, []);

  const startCamera = async () => {
    setMode('photo');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      showToast('Camera not available. Use manual mode.', 'error');
      setMode(null);
    }
  };

  const fileInputRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageBase64 = e.target.result;
      setMode('photo');
      setPhotoTaken(true);
      setLoading(true);

      try {
        const res = await api.scanBill(imageBase64);
        const extracted = res?.items || [];
        const items = extracted.map(item => {
          const match = products.find(p => 
            p.name.toLowerCase().includes(item.name.toLowerCase()) || 
            item.name.toLowerCase().includes(p.name.toLowerCase())
          );
          const qty = Number(item.quantity) || 10;
          const cost = Number(item.costPrice) || (match?.costPrice || 50);
          const selling = Number(item.sellingPrice) || (match?.sellingPrice || Math.round(cost * 1.2));
          return {
            productId: match ? match.id : null,
            name: match ? match.name : item.name,
            quantity: qty,
            unit: match ? match.unit : 'pc',
            totalCost: Math.round(qty * cost),
            costPrice: cost,
            sellingPrice: selling,
            category: item.category || 'General'
          };
        });
        setScannedItems(items);
        if (items.length === 0) {
          showToast('No items found in image. Try manual mode.', 'warning');
        } else {
          showToast(`Extracted ${items.length} items using Gemini AI Vision! ✨`);
        }
      } catch (err) {
        console.error('Bill OCR Error:', err);
        showToast('Could not analyze bill image. Try manual entry.', 'error');
      }
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const saveScanResults = async () => {
    setLoading(true);
    try {
      for (const item of scannedItems) {
        if (item.productId) {
          await api.addStock(item.productId, { quantity: item.quantity, costPrice: item.costPrice, totalCost: item.totalCost });
        } else {
          // If extracted product from bill isn't in inventory yet, auto-create it
          await api.addProduct({
            name: item.name,
            sellingPrice: Math.round(item.costPrice * 1.35),
            costPrice: item.costPrice,
            quantity: item.quantity,
            unit: item.unit || 'pc',
            minStock: 5,
            category: item.category || 'General'
          });
        }
      }
      showToast(`${scannedItems.length} items restocked & saved! ✨`);
      navigate('/stock');
    } catch (err) {
      showToast(err.message || 'Error saving stock', 'error');
    }
    setLoading(false);
  };

  const handleManualAdd = async () => {
    if (!selectedProduct || !addQty) { showToast('Select product and enter quantity', 'error'); return; }
    setLoading(true);
    try {
      await api.addStock(selectedProduct.id, {
        quantity: Number(addQty), costPrice: selectedProduct.costPrice,
        totalCost: Number(addCost) || Number(addQty) * selectedProduct.costPrice
      });
      trackEvent('stock_added', { 
        product_id: selectedProduct.id, 
        quantity: Number(addQty), 
        cost: Number(addCost) || Number(addQty) * selectedProduct.costPrice 
      });
      showToast(`${selectedProduct.name} restocked! ✅`);
      setSelectedProduct(null); setAddQty(''); setAddCost('');
      setProducts(await api.getProducts());
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    setLoading(false);
  };

  const handleNewProduct = async () => {
    if (!newName || !newPrice) { showToast('Enter name and price', 'error'); return; }
    setLoading(true);
    try {
      const created = await api.addProduct({
        name: newName, sellingPrice: Number(newPrice),
        costPrice: Math.round(Number(newPrice) * 0.75),
        quantity: Number(newQty) || 0, unit: newUnit, minStock: 5
      });
      trackEvent('product_added', { product_id: created.id, name: newName, price: Number(newPrice) });
      showToast(`${newName} added! ✨`);
      setShowNewProduct(false); setNewName(''); setNewPrice(''); setNewQty('');
      setProducts(await api.getProducts());
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    setLoading(false);
  };

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ padding: 8, width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.4rem', marginBottom: 2 }}>Inbound Stock</h1>
          <p className="page-subtitle" style={{ fontSize: '0.8rem' }}>Record incoming inventory</p>
        </div>
      </div>

      {/* Main Menu */}
      {!mode && scannedItems.length === 0 && (
        <div className="animate-in stagger-1" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Action Cards */}
          <div onClick={() => fileInputRef.current.click()} style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(37,99,235,0.05) 100%)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '1.2rem', padding: 24, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }} className="hover-scale">
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}><Camera size={28} /></div>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: '#60a5fa', marginBottom: 4 }}>Upload Bill / Invoice</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Auto-extract items using Gemini Vision AI</p>
            </div>
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
            />
          </div>

          <div onClick={() => setMode('manual')} style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '1.2rem', padding: 24, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }} className="hover-scale">
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--glass-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}><PenLine size={28} /></div>
            <div>
              <h3 style={{ fontSize: '1.1rem', color: 'white', marginBottom: 4 }}>Manual Entry</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Search product or add new items</p>
            </div>
          </div>

          {/* Quick Critical Add */}
          {products.filter(p => p.quantity <= p.minStock).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: '0.9rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>⚠️ Restock Recommended</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {products.filter(p => p.quantity <= p.minStock).slice(0, 3).map(p => (
                  <div key={p.id} onClick={() => { setMode('manual'); setSelectedProduct(p); }} style={{ background: 'var(--glass)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '1rem', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                       <div style={{ width: 40, height: 40, borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700 }}>{p.name[0]}</div>
                       <div>
                         <div style={{ fontSize: '1rem', fontWeight: 600 }}>{p.name}</div>
                         <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.quantity} {p.unit} remaining</div>
                       </div>
                    </div>
                    <span style={{ background: 'rgba(244,63,94,0.15)', color: '#f43f5e', padding: '4px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700 }}>{p.quantity === 0 ? 'EMPTY' : 'CRITICAL'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- Scanner Flow --- */}
      {mode === 'photo' && !photoTaken && (
        <div className="animate-in stagger-1">
          <div style={{ borderRadius: '1.5rem', overflow: 'hidden', background: '#000', aspectRatio: '4/3', position: 'relative', marginBottom: 20, border: '1px solid var(--glass-border)' }}>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: '10%', border: '2px dashed rgba(255,255,255,0.4)', borderRadius: '1rem' }} />
          </div>
           <button className="btn btn-primary btn-full" onClick={takePhoto} style={{ padding: '16px', fontSize: '1.1rem', borderRadius: '1rem', marginBottom: 12 }}>📸 Capture Invoice</button>
           <button className="btn btn-secondary btn-full" onClick={() => { setMode(null); videoRef.current?.srcObject?.getTracks().forEach(t => t.stop()); }}>Cancel</button>
        </div>
      )}

      {mode === 'photo' && photoTaken && scannedItems.length === 0 && (
         <div style={{ textAlign: 'center', padding: '60px 0' }} className="animate-in">
           <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4 }}></div>
           <h3 style={{ fontSize: '1.2rem', marginTop: 24, color: 'white' }}>Scanning Bill OCR</h3>
           <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 8 }}>Extracting line items and unit costs...</p>
         </div>
      )}

      {/* --- Scan Results View --- */}
      {scannedItems.length > 0 && (
        <div className="animate-in">
           <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Detected Items</h3>
           <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
             {scannedItems.map((item, i) => (
               <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.3)', padding: 16, borderRadius: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div>
                   <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{item.name}</div>
                   <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>+{item.quantity} {item.unit} added</div>
                 </div>
                 <div style={{ textAlign: 'right' }}>
                   <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>₹{item.totalCost}</div>
                 </div>
               </div>
             ))}
           </div>
           
           <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '1rem', padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
             <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total Invoice Value</span>
             <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white' }}>₹{scannedItems.reduce((s, i) => s + i.totalCost, 0).toLocaleString('en-IN')}</span>
           </div>

           <button className="btn btn-success btn-full" onClick={saveScanResults} disabled={loading} style={{ padding: 16, fontSize: '1.1rem', borderRadius: '1rem', marginBottom: 12 }}>
              {loading ? 'Saving to Database...' : '✅ Confirm & Save Stock'}
           </button>
           <button className="btn btn-ghost btn-full" onClick={() => { setScannedItems([]); setMode(null); setPhotoTaken(false); }}>Discard Scan</button>
        </div>
      )}

      {/* --- Manual Entry Flow --- */}
      {mode === 'manual' && (
        <div className="animate-in" style={{ position: 'relative' }}>
          {!selectedProduct ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '0 16px', marginBottom: 20 }}>
                <Search size={20} color="var(--text-muted)" />
                <input
                  type="text" placeholder="Search product database..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus
                  style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', padding: '16px 12px', fontSize: '0.95rem', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
                  <div key={p.id} onClick={() => setSelectedProduct(p)} style={{ background: 'var(--bg-card)', padding: 16, borderRadius: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid transparent' }} className="hover-scale">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem' }}>{p.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Have {p.quantity} {p.unit}</div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 24, borderTop: '1px solid var(--glass-border)', paddingTop: 24 }}>
                <button className="btn btn-primary btn-full" onClick={() => setShowNewProduct(true)} style={{ padding: 16, borderRadius: '1rem' }}>
                  <Plus size={18} style={{marginRight: 6}} /> Register New Product
                </button>
                <button className="btn btn-ghost btn-full" onClick={() => setMode(null)} style={{ marginTop: 12 }}>Cancel</button>
              </div>
            </>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', padding: 24, borderRadius: '1.5rem' }}>
               <h2 style={{ fontSize: '1.4rem', marginBottom: 4 }}>{selectedProduct.name}</h2>
               <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>Currently holding {selectedProduct.quantity} {selectedProduct.unit}</p>
               
               <div style={{ marginBottom: 20 }}>
                 <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Inbound Quantity ({selectedProduct.unit})</label>
                 <input type="number" className="input" value={addQty} onChange={e => setAddQty(e.target.value)} autoFocus style={{ padding: '16px', fontSize: '1.2rem', background: 'rgba(255,255,255,0.05)' }} placeholder="e.g. 50" />
               </div>

               <div style={{ marginBottom: 32 }}>
                 <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Total Paid Cost (₹)</label>
                 <input type="number" className="input" value={addCost} onChange={e => setAddCost(e.target.value)} style={{ padding: '16px', fontSize: '1.2rem', background: 'rgba(255,255,255,0.05)' }} placeholder={`Auto: ₹${addQty ? Math.round(Number(addQty) * selectedProduct.costPrice) : '0'}`} />
               </div>

               <div style={{ display: 'flex', gap: 12 }}>
                 <button className="btn btn-primary" onClick={handleManualAdd} disabled={loading} style={{ flex: 1, padding: 16, fontSize: '1.05rem', borderRadius: '1rem' }}>
                    {loading ? 'Adding...' : 'Confirm Stock'}
                 </button>
                 <button className="btn btn-secondary" onClick={() => setSelectedProduct(null)} style={{ padding: '16px 24px', borderRadius: '1rem' }}>Back</button>
               </div>
            </div>
          )}
        </div>
      )}

      {/* --- New Product Modal Overlay --- */}
      {showNewProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="animate-in" style={{ background: '#0f172a', width: '100%', maxWidth: 400, borderRadius: '24px 24px 0 0', padding: 24, paddingBottom: 40, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', margin: 0 }}>Register Product</h3>
              <button onClick={() => setShowNewProduct(false)} style={{ background: 'var(--glass)', border: 'none', color: 'var(--text-muted)', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Product Name</label>
              <input className="input" placeholder="e.g. Aashirvaad Atta 5kg" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '14px', background: 'rgba(255,255,255,0.05)' }} />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
               <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Selling Price (₹)</label>
                  <input type="number" className="input" placeholder="250" value={newPrice} onChange={e => setNewPrice(e.target.value)} style={{ padding: '14px', background: 'rgba(255,255,255,0.05)' }} />
               </div>
               <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Initial Stock</label>
                  <input type="number" className="input" placeholder="10" value={newQty} onChange={e => setNewQty(e.target.value)} style={{ padding: '14px', background: 'rgba(255,255,255,0.05)' }} />
               </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Measurement Unit</label>
               <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                 {['pc', 'kg', 'L', 'g', 'ml', 'packet'].map(u => (
                   <button key={u} onClick={() => setNewUnit(u)} style={{ 
                     padding: '8px 16px', borderRadius: '2rem', border: newUnit === u ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.2)',
                     background: newUnit === u ? 'rgba(255,107,53,0.1)' : 'transparent', color: newUnit === u ? 'var(--primary)' : 'var(--text-secondary)'
                   }}>
                     {u}
                   </button>
                 ))}
               </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1rem', fontWeight: 700, borderRadius: '1rem' }} onClick={handleNewProduct}>
              Save to Database
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
