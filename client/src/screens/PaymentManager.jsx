import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  QrCode, ArrowLeft, Download, Maximize2, CheckCircle2, Clock, 
  AlertCircle, ShieldCheck, Printer, RefreshCw, Search, Filter, 
  FileText, TrendingUp, DollarSign, Wallet, Users, Sparkles, Check,
  CreditCard, ChevronRight, Eye, UserPlus, Calendar, X, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import { trackEvent } from '../utils/analytics';
import PaymentQRModal from '../components/PaymentQRModal';
import { generateInvoice, downloadInvoice } from '../utils/generateInvoice';
import { useStore } from '../context/StoreContext';

export default function PaymentManager() {
  const navigate = useNavigate();
  const { shop, showToast } = useStore();

  const [activeTab, setActiveTab] = useState('terminal'); // 'terminal' | 'ledger' | 'audit'
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState('all'); // 'all' | 'today' | '7days' | '30days' | 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Terminal state
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customAmount, setCustomAmount] = useState('250');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [modalCustomer, setModalCustomer] = useState(null);
  const [modalAmount, setModalAmount] = useState(250);
  const [modalFullScreen, setModalFullScreen] = useState(false);
  const [modalPayment, setModalPayment] = useState(null);

  // Quick Add Customer Modal
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustCity, setNewCustCity] = useState('');
  const [newCustCredit, setNewCustCredit] = useState('');
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [customerAddError, setCustomerAddError] = useState('');

  // Selected Payment for Detail View
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState(null);

  // Permanent Store QR Code Image
  const [imageError, setImageError] = useState(false);
  const QR_IMAGE_PATH = '/images/payment-qr.jpeg';

  useEffect(() => {
    loadPaymentData();
  }, []);

  const loadPaymentData = async () => {
    setIsRefreshing(true);
    try {
      const [pays, sum, custs] = await Promise.all([
        api.getPayments().catch(() => []),
        api.getPaymentSummary().catch(() => null),
        api.getCustomers().catch(() => [])
      ]);
      setPayments(pays || []);
      setSummary(sum);
      setCustomers(custs || []);
    } catch (err) {
      console.error('Error loading payments:', err);
    }
    setLoading(false);
    setIsRefreshing(false);
  };

  const handleOpenTerminalModal = (customerObj, amt, isFullScreen = false, existingPayment = null) => {
    setModalCustomer(customerObj);
    setModalAmount(amt || Number(customAmount) || 100);
    setModalFullScreen(isFullScreen);
    setModalPayment(existingPayment || null);
    setQrModalOpen(true);
  };

  const handleDownloadQR = async () => {
    try {
      const response = await fetch(QR_IMAGE_PATH);
      if (!response.ok) throw new Error('Failed to fetch image');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'store_upi_payment_qr.jpeg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      const link = document.createElement('a');
      link.href = QR_IMAGE_PATH;
      link.download = 'store_upi_payment_qr.jpeg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const receiptDataFor = (payment) => ({
    shop,
    customerName: payment.customerName || 'Walk-in Customer',
    total: payment.amountPaid || payment.amount,
    method: `UPI QR (${payment.referenceNo})`,
    invoiceNo: payment.referenceNo,
    date: payment.verifiedAt || payment.updatedAt || payment.timestamp,
    items: [
      {
        name: `Payment Settlement - Ref #${payment.referenceNo}`,
        qty: 1,
        price: payment.amountPaid || payment.amount,
        unit: 'transaction'
      }
    ]
  });

  const handlePrintReceipt = (payment) => {
    generateInvoice(receiptDataFor(payment));
    trackEvent('invoice_created', { payment_method: 'upi', item_count: 1 });
  };

  const handleDownloadReceipt = async (payment) => {
    try {
      await downloadInvoice(receiptDataFor(payment));
      trackEvent('invoice_created', { payment_method: 'upi', item_count: 1 });
    } catch (err) {
      showToast(err.message || 'Could not create the bill PDF', 'error');
    }
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      setCustomerAddError('Customer name is required');
      return;
    }
    setIsAddingCustomer(true);
    setCustomerAddError('');
    try {
      const created = await api.addCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        city: newCustCity.trim(),
        totalCredit: Number(newCustCredit) || 0,
        customerType: 'Regular',
        status: 'Active'
      });
      // Append new customer to list and select them
      setCustomers(prev => [created, ...prev]);
      setSelectedCustomerId(created.id);
      trackEvent('customer_added', {
        customer_id: created.id,
        customer_count: customers.length + 1
      });
      setShowQuickAddCustomer(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustCity('');
      setNewCustCredit('');
    } catch (err) {
      setCustomerAddError(err.message || 'Failed to add customer');
    }
    setIsAddingCustomer(false);
  };

  // Filtered Payments Calculation
  const filteredPayments = payments.filter(p => {
    // Status Filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'Successful') {
        if (p.status !== 'Successful' && p.status !== 'Paid') return false;
      } else if (p.status !== filterStatus) {
        return false;
      }
    }

    // Customer Filter
    if (filterCustomer !== 'all') {
      if (p.customerId !== filterCustomer && p.customerName !== filterCustomer) return false;
    }

    // Amount Range Filter
    const amt = p.amount || 0;
    if (minAmount && amt < Number(minAmount)) return false;
    if (maxAmount && amt > Number(maxAmount)) return false;

    // Date Range Filter
    if (filterDateRange !== 'all') {
      const pDate = new Date(p.timestamp || p.createdAt);
      const now = new Date();

      if (filterDateRange === 'today') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (pDate < todayStart) return false;
      } else if (filterDateRange === '7days') {
        const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (pDate < past7) return false;
      } else if (filterDateRange === '30days') {
        const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (pDate < past30) return false;
      } else if (filterDateRange === 'custom') {
        if (customStartDate && pDate < new Date(customStartDate)) return false;
        if (customEndDate) {
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          if (pDate > end) return false;
        }
      }
    }

    // Search Term Filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchName = p.customerName?.toLowerCase().includes(term);
      const matchPhone = p.customerPhone?.includes(term);
      const matchRef = p.referenceNo?.toLowerCase().includes(term);
      const matchUtr = p.upiTransactionRef?.toLowerCase().includes(term);
      const matchGateway = p.gatewayPaymentId?.toLowerCase().includes(term);
      if (!matchName && !matchPhone && !matchRef && !matchUtr && !matchGateway) return false;
    }

    return true;
  });

  // Calculate Successful Payments KPI directly from verified data
  const successfulPaymentsList = payments.filter(p => p.status === 'Successful' || p.status === 'Paid');
  const totalSuccessfulCount = successfulPaymentsList.length;
  const totalSuccessfulVolume = successfulPaymentsList.reduce((sum, p) => sum + (p.amountPaid || p.amount || 0), 0);

  const fmt = (val) => `₹${Math.round(val || 0).toLocaleString('en-IN')}`;

  // Filtered dropdown customers for terminal search
  const visibleCustomers = customers.filter(c => {
    if (!customerSearchTerm) return true;
    const term = customerSearchTerm.toLowerCase();
    return c.name?.toLowerCase().includes(term) || c.phone?.includes(term) || c.city?.toLowerCase().includes(term);
  });

  return (
    <div className="page" style={{ paddingTop: 16, paddingBottom: 80 }}>
      
      {/* ─── HEADER BAR ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ padding: 8, width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 className="page-title" style={{ fontSize: '1.6rem', margin: 0, fontWeight: 900, letterSpacing: '-0.5px' }}>
                Payment Management & Real-Time Tracking
              </h1>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                VERIFIED GATEWAY
              </span>
            </div>
            <p className="page-subtitle" style={{ fontSize: '0.84rem', margin: '2px 0 0', color: 'var(--text-secondary)' }}>
              Dedicated UPI payment counter, connected customer CRM, and automated webhook tracking
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={loadPaymentData}
            title="Refresh payment records"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderRadius: '12px' }}
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button 
            className="btn btn-primary"
            onClick={() => handleOpenTerminalModal(null, Number(customAmount) || 200)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: '12px' }}
          >
            <QrCode size={18} /> Open UPI Terminal
          </button>
        </div>
      </div>

      {/* ─── REVENUE & FINANCIAL KPI CARDS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 24 }}>
        
        {/* KPI 1: Total Successful Payments */}
        <div className="bento-card" style={{ padding: 18, background: 'var(--card-bg)', borderRadius: '18px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={16} color="#34d399" /> Total Successful Payments
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 900, color: '#34d399', marginTop: 4 }}>
            {totalSuccessfulCount} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>({fmt(totalSuccessfulVolume)})</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#34d399', marginTop: 2, fontWeight: 600 }}>
            ✓ Verified via provider webhooks & audit
          </div>
        </div>

        {/* KPI 2: Total Money Collected */}
        <div className="bento-card" style={{ padding: 18, background: 'var(--card-bg)', borderRadius: '18px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Wallet size={15} color="#38bdf8" /> Total Money Collected
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 900, color: '#38bdf8', marginTop: 4 }}>
            {fmt(summary?.totalMoneyCollected || totalSuccessfulVolume)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Across all payment channels
          </div>
        </div>

        {/* KPI 3: Outstanding Customer Balances */}
        <div className="bento-card" style={{ padding: 18, background: 'var(--card-bg)', borderRadius: '18px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={15} color="#fb7185" /> Outstanding Balances
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 900, color: '#fb7185', marginTop: 4 }}>
            {fmt(summary?.totalOutstandingCustomerBalances || 0)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Unsettled customer credit (Khata)
          </div>
        </div>

        {/* KPI 4: Pending Payments */}
        <div className="bento-card" style={{ padding: 18, background: 'var(--card-bg)', borderRadius: '18px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={15} color="#fbbf24" /> Pending Payments
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 900, color: '#fbbf24', marginTop: 4 }}>
            {fmt(summary?.totalPendingAmount || 0)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {summary?.counts?.pending || 0} awaiting scan/verification
          </div>
        </div>

      </div>

      {/* ─── NAVIGATION TABS ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--glass-border)', paddingBottom: 12 }}>
        {[
          { id: 'terminal', label: 'Dedicated UPI QR Terminal', icon: QrCode },
          { id: 'ledger', label: `Payment History & Tracking (${payments.length})`, icon: CreditCard },
          { id: 'audit', label: 'Verification & Audit Trail', icon: ShieldCheck }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: '12px', border: 'none',
                background: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
                color: isActive ? 'white' : 'var(--text-secondary)',
                fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: DEDICATED UPI QR PAYMENT TERMINAL ─── */}
      {activeTab === 'terminal' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          
          {/* Permanent Store QR Display Card */}
          <div className="bento-card" style={{ padding: 24, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Sparkles size={18} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'white' }}>
                Counter Terminal Standee
              </h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 16px', maxWidth: 320 }}>
              Permanent shop counter QR. For dynamic customer bills with instant status notifications, use the request creator on the right.
            </p>

            <div style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              maxWidth: 280,
              minHeight: 280,
              marginBottom: 16
            }}>
              {!imageError ? (
                <img
                  src={QR_IMAGE_PATH}
                  alt="Store UPI QR Code"
                  onError={() => setImageError(true)}
                  onLoad={() => setImageError(false)}
                  style={{
                    width: '100%',
                    height: 'auto',
                    maxWidth: 240,
                    maxHeight: 240,
                    objectFit: 'contain',
                    aspectRatio: '1 / 1',
                    borderRadius: '12px'
                  }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 12px', color: '#1e293b' }}>
                  <AlertCircle size={40} color="#ef4444" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#991b1b', marginBottom: 6 }}>
                    Store Standee Ready
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: 12, lineHeight: 1.4 }}>
                    Ready for dynamic QR generation. Click below to test with custom amount.
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>
                UPI ID: merchant@upi • All UPI Apps Supported
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 280 }}>
              <button className="btn btn-secondary" onClick={handleDownloadQR} style={{ flex: 1, padding: '10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Download size={14} /> Download
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => handleOpenTerminalModal(null, Number(customAmount) || 200, true)} 
                style={{ flex: 1, padding: '10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Maximize2 size={14} /> Full Screen
              </button>
            </div>
          </div>

          {/* Quick Payment Initiator connected to Customer Database */}
          <div className="bento-card" style={{ padding: 24, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'white' }}>
                Create Customer Payment Request
              </h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowQuickAddCustomer(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', padding: '6px 12px' }}
              >
                <UserPlus size={14} /> + New Customer
              </button>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              Connected to customer database ({customers.length} registered customers). Generates a dynamic QR with real-time payment confirmation.
            </p>

            {/* Customer Search & Select Box */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Select Customer (Unlimited CRM Support)
              </label>

              {/* Fast customer filter input */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0 10px', marginBottom: 8 }}>
                <Search size={14} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Type to filter customer list..."
                  value={customerSearchTerm}
                  onChange={e => setCustomerSearchTerm(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', padding: '8px 6px', fontSize: '0.8rem', outline: 'none' }}
                />
                {customerSearchTerm && (
                  <button type="button" onClick={() => setCustomerSearchTerm('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              <select
                className="input"
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', background: '#0c0a1e', color: 'white', borderRadius: '12px', fontSize: '0.9rem' }}
              >
                <option value="">Walk-in Customer (General Counter)</option>
                {visibleCustomers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : c.city ? `(${c.city})` : ''} — Balance: ₹{c.totalCredit || 0}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount Input & Quick Presets */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Payment Amount (₹ INR)
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  type="number"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  style={{ flex: 1, padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', color: 'white', fontSize: '1.2rem', fontWeight: 800 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[50, 100, 200, 500, 1000, 2000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCustomAmount(String(val))}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: customAmount === String(val) ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                      color: 'white',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ₹{val}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                const cust = customers.find(c => c.id === selectedCustomerId);
                handleOpenTerminalModal(cust, Number(customAmount) || 100);
              }}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '14px',
                fontSize: '1.05rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 'auto'
              }}
            >
              <QrCode size={20} /> Open Dynamic QR for ₹{Number(customAmount || 0).toLocaleString('en-IN')}
            </button>
          </div>

        </div>
      )}

      {/* ─── TAB 2: PAYMENTS LEDGER & ADVANCED FILTERS ─── */}
      {activeTab === 'ledger' && (
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
          
          {/* Search & Filter Toolbar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              {/* Search Box */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '0 12px', width: '100%', maxWidth: 360 }}>
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search by customer, phone, ref, UTR, gateway ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', padding: '10px 8px', fontSize: '0.86rem', outline: 'none' }}
                />
              </div>

              {/* Status Pills */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'All Status' },
                  { id: 'Successful', label: 'Successful / Paid' },
                  { id: 'Pending', label: 'Pending' },
                  { id: 'Partially Paid', label: 'Partially Paid' },
                  { id: 'Cancelled', label: 'Cancelled' },
                  { id: 'Failed', label: 'Failed' }
                ].map(st => (
                  <button
                    key={st.id}
                    onClick={() => setFilterStatus(st.id)}
                    style={{
                      padding: '6px 12px', borderRadius: '10px', border: 'none',
                      background: filterStatus === st.id ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                      color: filterStatus === st.id ? 'white' : 'var(--text-secondary)',
                      fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer'
                    }}
                  >
                    {st.label}
                  </button>
                ))}

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}
                >
                  <Filter size={14} />
                  <span>Filters {showAdvancedFilters ? '▲' : '▼'}</span>
                </button>
              </div>
            </div>

            {/* Advanced Filters Panel (Date Range, Customer Selector, Amount Range) */}
            {showAdvancedFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 14
                }}
              >
                {/* Date Range Picker */}
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Date Range
                  </label>
                  <select
                    className="input"
                    value={filterDateRange}
                    onChange={e => setFilterDateRange(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: '#0f172a', color: 'white', borderRadius: '8px', fontSize: '0.8rem' }}
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="7days">Last 7 Days</option>
                    <option value="30days">Last 30 Days</option>
                    <option value="custom">Custom Date Range</option>
                  </select>

                  {filterDateRange === 'custom' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={e => setCustomStartDate(e.target.value)}
                        style={{ flex: 1, padding: '6px 8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px', fontSize: '0.74rem' }}
                      />
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={e => setCustomEndDate(e.target.value)}
                        style={{ flex: 1, padding: '6px 8px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px', fontSize: '0.74rem' }}
                      />
                    </div>
                  )}
                </div>

                {/* Filter by Customer */}
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Filter By Customer
                  </label>
                  <select
                    className="input"
                    value={filterCustomer}
                    onChange={e => setFilterCustomer(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: '#0f172a', color: 'white', borderRadius: '8px', fontSize: '0.8rem' }}
                  >
                    <option value="all">All Customers</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount Range Filter */}
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Amount Range (₹)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number"
                      placeholder="Min ₹"
                      value={minAmount}
                      onChange={e => setMinAmount(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px', fontSize: '0.8rem' }}
                    />
                    <input
                      type="number"
                      placeholder="Max ₹"
                      value={maxAmount}
                      onChange={e => setMaxAmount(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px', fontSize: '0.8rem' }}
                    />
                  </div>
                </div>

                {/* Reset Filters */}
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setFilterStatus('all');
                      setFilterCustomer('all');
                      setFilterDateRange('all');
                      setCustomStartDate('');
                      setCustomEndDate('');
                      setMinAmount('');
                      setMaxAmount('');
                      setSearchTerm('');
                    }}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', fontSize: '0.78rem', color: '#fb7185' }}
                  >
                    Reset All Filters
                  </button>
                </div>
              </motion.div>
            )}

          </div>

          {/* Table */}
          {filteredPayments.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              No payments match your selected search or filter criteria.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px 14px' }}>Date / Time</th>
                    <th style={{ padding: '12px 14px' }}>Reference #</th>
                    <th style={{ padding: '12px 14px' }}>Customer</th>
                    <th style={{ padding: '12px 14px' }}>Amount</th>
                    <th style={{ padding: '12px 14px' }}>Collected</th>
                    <th style={{ padding: '12px 14px' }}>Gateway / Provider</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map(p => {
                    const isSuccess = p.status === 'Successful' || p.status === 'Paid';
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(p.timestamp || p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{' '}
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            {new Date(p.timestamp || p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#38bdf8', fontWeight: 700 }}>
                          {p.referenceNo}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: 'white' }}>
                          {p.customerName || 'Walk-in Customer'}
                          {p.customerPhone && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>{p.customerPhone}</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: 'white' }}>
                          ₹{p.amount?.toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: isSuccess ? '#34d399' : 'var(--text-secondary)' }}>
                          ₹{(p.amountPaid || (isSuccess ? p.amount : 0)).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {p.gatewayProvider || 'Razorpay'}
                            {p.amountVerified && (
                              <span title="Cryptographically Verified Webhook" style={{ color: '#34d399', fontWeight: 800 }}>✓</span>
                            )}
                          </span>
                          {p.gatewayPaymentId && (
                            <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#38bdf8' }}>
                              {p.gatewayPaymentId.slice(0, 16)}...
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '4px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 800,
                            background: isSuccess ? 'rgba(16,185,129,0.15)' : p.status === 'Partially Paid' ? 'rgba(56,189,248,0.15)' : p.status === 'Cancelled' ? 'rgba(244,63,94,0.15)' : 'rgba(251,191,36,0.15)',
                            color: isSuccess ? '#34d399' : p.status === 'Partially Paid' ? '#38bdf8' : p.status === 'Cancelled' ? '#f43f5e' : '#fbbf24'
                          }}>
                            {isSuccess ? 'Successful' : p.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            {isSuccess ? (
                              <>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handlePrintReceipt(p)}
                                  title="Print Receipt"
                                  style={{ padding: '6px 10px', fontSize: '0.74rem' }}
                                >
                                  <Printer size={13} /> Receipt
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleDownloadReceipt(p)}
                                  title="Download bill as PDF"
                                  style={{ padding: '6px 10px', fontSize: '0.74rem' }}
                                >
                                  <Download size={13} /> PDF
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleOpenTerminalModal(
                                  { name: p.customerName, id: p.customerId, phone: p.customerPhone }, 
                                  p.balanceRemaining != null && p.balanceRemaining > 0 ? p.balanceRemaining : p.amount, 
                                  false, 
                                  p
                                )}
                                style={{ padding: '6px 10px', fontSize: '0.74rem' }}
                              >
                                <QrCode size={13} /> Collect
                              </button>
                            )}
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setSelectedPaymentDetail(p)}
                              title="View Details"
                              style={{ padding: '6px 8px' }}
                            >
                              <Eye size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* ─── TAB 3: VERIFICATION & AUDIT TRAIL ─── */}
      {activeTab === 'audit' && (
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <ShieldCheck size={20} color="#34d399" />
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>
              Payment Verification & Audit Log
            </h3>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
            Permanent audit trail of HMAC-verified webhook confirmations and counter verifications.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {payments.flatMap(p => (p.auditTrail || []).map(a => ({ 
              ...a, 
              paymentRef: p.referenceNo, 
              customer: p.customerName,
              provider: p.gatewayProvider,
              paymentId: p.gatewayPaymentId,
              amountVerified: p.amountVerified
            })))
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
              .map((log, idx) => (
                <div key={idx} style={{
                  padding: '12px 16px', background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: '0.82rem', gap: 12
                }}>
                  <div>
                    <span style={{ fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
                      {log.paymentRef}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                      ({log.customer || 'Counter Customer'})
                    </span>
                    <div style={{ color: 'white', marginTop: 4 }}>
                      {log.note}
                    </div>
                    {log.paymentId && (
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>
                        ID: {log.paymentId} {log.amountVerified ? '• ✓ Amount Verified' : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 700 }}>
                      {log.updatedBy || 'Payment Gateway Webhook'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Quick Add Customer Modal */}
      {showQuickAddCustomer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', width: '100%', maxWidth: '440px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>
                + Add Customer to CRM
              </h3>
              <button className="btn btn-ghost" onClick={() => setShowQuickAddCustomer(false)} style={{ padding: 6 }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {customerAddError && (
                <div style={{ padding: '8px 12px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', borderRadius: '8px', fontSize: '0.8rem' }}>
                  {customerAddError}
                </div>
              )}

              <div>
                <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 4 }}>Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', fontSize: '0.86rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 4 }}>Phone Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={newCustPhone}
                  onChange={e => setNewCustPhone(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', fontSize: '0.86rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 4 }}>City / Area</label>
                  <input
                    type="text"
                    placeholder="e.g. Sector 14"
                    value={newCustCity}
                    onChange={e => setNewCustCity(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', fontSize: '0.86rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 4 }}>Initial Khata (₹)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newCustCredit}
                    onChange={e => setNewCustCredit(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'white', fontSize: '0.86rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={isAddingCustomer}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', fontWeight: 800 }}
                >
                  {isAddingCustomer ? 'Adding...' : 'Save & Select'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowQuickAddCustomer(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Details Drawer/Modal */}
      {selectedPaymentDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', width: '100%', maxWidth: '480px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'white' }}>
                  Transaction Details
                </h3>
                <span style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'monospace' }}>
                  Ref: {selectedPaymentDetail.referenceNo}
                </span>
              </div>
              <button className="btn btn-ghost" onClick={() => setSelectedPaymentDetail(null)} style={{ padding: 6 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#94a3b8' }}>Customer:</span>
                <span style={{ fontWeight: 800, color: 'white' }}>{selectedPaymentDetail.customerName || 'Walk-in'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#94a3b8' }}>Amount:</span>
                <span style={{ fontWeight: 800, color: '#34d399', fontSize: '1.05rem' }}>₹{selectedPaymentDetail.amount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#94a3b8' }}>Status:</span>
                <span style={{ fontWeight: 800, color: selectedPaymentDetail.status === 'Successful' || selectedPaymentDetail.status === 'Paid' ? '#34d399' : '#fbbf24' }}>
                  {selectedPaymentDetail.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#94a3b8' }}>Gateway Provider:</span>
                <span style={{ color: 'white' }}>{selectedPaymentDetail.gatewayProvider || 'Razorpay'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#94a3b8' }}>Provider Payment ID:</span>
                <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{selectedPaymentDetail.gatewayPaymentId || selectedPaymentDetail.upiTransactionRef || 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#94a3b8' }}>Webhook Event ID:</span>
                <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.76rem' }}>{selectedPaymentDetail.webhookEventId || 'Direct / Offline'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#94a3b8' }}>Amount Verified:</span>
                <span style={{ color: selectedPaymentDetail.amountVerified ? '#34d399' : '#94a3b8', fontWeight: 800 }}>
                  {selectedPaymentDetail.amountVerified ? '✓ Cryptographically Verified' : 'Manual / Pending'}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  handlePrintReceipt(selectedPaymentDetail);
                  setSelectedPaymentDetail(null);
                }}
                style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
              >
                <Printer size={16} /> Print Receipt
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handleDownloadReceipt(selectedPaymentDetail)}
                style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
              >
                <Download size={16} /> Download PDF
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedPaymentDetail(null)}
                style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPI QR Payment Modal */}
      <PaymentQRModal
        isOpen={qrModalOpen}
        onClose={() => { setQrModalOpen(false); setModalPayment(null); loadPaymentData(); }}
        customer={modalCustomer}
        initialAmount={modalAmount}
        payment={modalPayment}
        onSuccess={() => { setModalPayment(null); loadPaymentData(); }}
        onPaymentSuccess={() => { setModalPayment(null); loadPaymentData(); }}
        startFullScreen={modalFullScreen}
      />

    </div>
  );
}
