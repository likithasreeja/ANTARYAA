import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { Search, Plus, Edit2, Trash2, Package, ArrowLeft, MoreVertical, X, Download } from 'lucide-react';
import api from '../api';
import ConfirmModal from '../components/ConfirmModal';
import { SkeletonList } from '../components/Skeleton';
import { trackEvent } from '../utils/analytics';

export default function MyStock() {
  const { showToast } = useStore();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, low, critical
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState('');
  const [editPrice, setEditPrice] = useState('');
  
  // Modal states
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const getStatus = (product) => {
    if (product.quantity <= 0) return { label: 'OUT OF STOCK', color: '#f43f5e', bg: 'rgba(244,63,94,0.15)' };
    if (product.quantity <= 2) return { label: 'CRITICAL', color: '#f43f5e', bg: 'rgba(244,63,94,0.15)' };
    if (product.quantity <= product.minStock) return { label: 'LOW STOCK', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
    return { label: 'IN STOCK', color: '#10b981', bg: 'rgba(16,185,129,0.15)' };
  };

  const filteredProducts = products
    .filter(p => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return p.name.toLowerCase().includes(term) || (p.nameHindi && p.nameHindi.includes(searchTerm));
      }
      return true;
    })
    .filter(p => {
      if (filter === 'low') return p.quantity <= p.minStock && p.quantity > 0;
      if (filter === 'critical') return p.quantity <= 2;
      return true;
    })
    .sort((a, b) => a.quantity - b.quantity);

  const lowCount = products.filter(p => p.quantity <= p.minStock && p.quantity > 0).length;
  const criticalCount = products.filter(p => p.quantity <= 2).length;

  const handleUpdate = async (product) => {
    try {
      const updates = {};
      if (editQty !== '') updates.quantity = Number(editQty);
      if (editPrice !== '') updates.sellingPrice = Number(editPrice);

      await api.updateProduct(product.id, updates);
      showToast(`${product.name} updated successfully!`);
      setEditingId(null);
      setEditQty('');
      setEditPrice('');
      setOpenMenuId(null);
      loadProducts();
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    }
  };

  const handleDelete = (product) => {
    setConfirmDeleteProduct(product);
  };

  const executeDelete = async () => {
    if (!confirmDeleteProduct) return;
    try {
      await api.deleteProduct(confirmDeleteProduct.id);
      showToast(`${confirmDeleteProduct.name} deleted`);
      setOpenMenuId(null);
      setConfirmDeleteProduct(null);
      loadProducts();
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const handleExportCSV = () => {
    if (products.length === 0) {
      showToast('No inventory items to export', 'warning');
      return;
    }
    const headers = ['Product Name', 'Selling Price (INR)', 'Cost Price (INR)', 'Quantity', 'Unit', 'Min Stock'];
    const rows = products.map(p => [
      `"${p.name.replace(/"/g, '""')}"`,
      p.sellingPrice,
      p.costPrice,
      p.quantity,
      p.unit || 'pc',
      p.minStock || 5
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `antarya_inventory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Inventory exported to CSV! 📥');
  };

  if (loading) {
    return (
      <div className="page" style={{ paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)' }} />
            <div>
              <h1 className="page-title" style={{ fontSize: '1.4rem', marginBottom: 2 }}>Inventory</h1>
              <p className="page-subtitle" style={{ fontSize: '0.8rem' }}>Loading items...</p>
            </div>
          </div>
        </div>
        <SkeletonList count={5} />
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
            <h1 className="page-title" style={{ fontSize: '1.4rem', marginBottom: 2 }}>Inventory</h1>
            <p className="page-subtitle" style={{ fontSize: '0.8rem' }}>{products.length} Items Total</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleExportCSV} title="Export CSV" style={{ padding: '8px 12px', borderRadius: '2rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download size={16} /> <span className="hide-mobile">Export</span>
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/add-stock')} style={{ padding: '8px 16px', borderRadius: '2rem' }}>
            <Plus size={18} style={{ marginRight: 4 }}/> Add Item
          </button>
        </div>
      </div>

      {/* Modern Search Bar */}
      <div style={{ 
        display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', 
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem', padding: '0 16px', marginBottom: 20,
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
      }}>
        <Search size={20} color="var(--text-muted)" />
        <input
          type="text"
          placeholder="Search by name..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ 
            flex: 1, background: 'transparent', border: 'none', color: 'white', 
            padding: '16px 12px', fontSize: '0.95rem', outline: 'none' 
          }}
        />
        {searchTerm && <X size={18} color="var(--text-muted)" onClick={() => setSearchTerm('')} style={{cursor: 'pointer'}} />}
      </div>

      {/* Pill Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
        {[
          { id: 'all', label: 'All Items', count: products.length },
          { id: 'low', label: 'Low Stock', count: lowCount },
          { id: 'critical', label: 'Critical', count: criticalCount }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            style={{
              padding: '8px 16px',
              borderRadius: '2rem',
              whiteSpace: 'nowrap',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: filter === tab.id ? 'white' : 'transparent',
              color: filter === tab.id ? 'black' : 'var(--text-secondary)',
              border: filter === tab.id ? '1px solid white' : '1px solid rgba(255,255,255,0.2)',
              transition: 'all 0.2s',
            }}
          >
            {tab.label} <span style={{ opacity: 0.6, fontSize: '0.8rem', marginLeft: 4 }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Restock Action Banner */}
      {lowCount > 0 && filter === 'low' && (
        <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(37,99,235,0.1))', border: '1px solid rgba(59,130,246,0.3)', padding: 16, borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h4 style={{ margin: 0, color: '#60a5fa', fontSize: '0.95rem' }}>Restock Required</h4>
            <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{lowCount + criticalCount} items are running low.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/add-stock')}>Order Now</button>
        </div>
      )}

      {/* Data Rows */}
      {filteredProducts.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <Package size={48} color="var(--glass-border)" style={{ marginBottom: 16 }} />
          <h3>No inventory found</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{searchTerm ? 'Try a different search term.' : 'Start adding products to your shop.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredProducts.map((product, i) => {
            const status = getStatus(product);
            const isEditing = editingId === product.id;
            const menuOpen = openMenuId === product.id;

            return (
              <div key={product.id} className="animate-in" style={{ 
                animationDelay: `${i * 0.05}s`,
                background: 'var(--bg-card)', 
                border: '1px solid var(--glass-border)',
                borderRadius: '1rem',
                padding: '16px',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Category / Icon Avatar */}
                  <div style={{
                    width: 48, height: 48, borderRadius: '12px', background: 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    {product.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'white' }}>{product.name}</span>
                    </div>
                    <div style={{ fontSize: '0.8.5rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>₹{product.sellingPrice} / {product.unit}</span>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                      <span style={{ 
                        background: status.bg, color: status.color, padding: '2px 8px', 
                        borderRadius: '1rem', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.5px'
                      }}>
                        {status.label}
                      </span>
                    </div>
                  </div>

                  {/* Quantity */}
                  <div style={{ textAlign: 'right', marginRight: 8 }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: status.color === '#10b981' ? 'white' : status.color, lineHeight: 1 }}>
                      {product.quantity}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 4 }}>
                      {product.unit}s
                    </div>
                  </div>

                  {/* Action Menu Toggle */}
                  <button onClick={() => setOpenMenuId(menuOpen ? null : product.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}>
                    <MoreVertical size={20} />
                  </button>
                </div>

                {/* Expanded Action Menu */}
                {menuOpen && !isEditing && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--glass-border)', display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, padding: 10, fontSize: '0.85rem' }} 
                      onClick={() => {
                        setEditingId(product.id);
                        setEditQty(String(product.quantity));
                        setEditPrice(String(product.sellingPrice));
                      }}>
                      <Edit2 size={16} style={{marginRight: 6}}/> Quick Edit
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1, padding: 10, fontSize: '0.85rem' }} onClick={() => navigate('/add-stock')}>
                      <Plus size={16} style={{marginRight: 6}}/> Restock
                    </button>
                    <button className="btn" style={{ background: 'rgba(244,63,94,0.15)', color: '#f43f5e', padding: 10 }} onClick={() => handleDelete(product)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}

                {/* Inline Quick Edit Form */}
                {isEditing && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: '0.5rem', margin: '-16px -16px -16px -16px', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                    <div className="stats-grid" style={{ marginBottom: 16 }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Update Quantity</label>
                        <input className="input" type="number" value={editQty} onChange={e => setEditQty(e.target.value)} style={{ padding: '12px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Selling Price (₹)</label>
                        <input className="input" type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} style={{ padding: '12px' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleUpdate(product)}>Save Changes</button>
                      <button className="btn btn-secondary" onClick={() => { setEditingId(null); setOpenMenuId(null); }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDeleteProduct}
        title="Delete Item"
        message={`Are you sure you want to delete "${confirmDeleteProduct?.name}" from your inventory?`}
        confirmText="Yes, Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={executeDelete}
        onCancel={() => setConfirmDeleteProduct(null)}
      />

      <div style={{ height: 40 }}></div>
    </div>
  );
}
