import { useState, useEffect, useRef } from 'react';
import { 
  X, QrCode, Download, Maximize2, Minimize2, CheckCircle2, 
  AlertCircle, Clock, ShieldCheck, Printer, RefreshCw,
  DollarSign, User, FileText, Check, Copy, ExternalLink, Zap,
  Smartphone, CheckCircle, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import api from '../api';
import { trackEvent } from '../utils/analytics';
import { generateInvoice, downloadInvoice } from '../utils/generateInvoice';
import { useStore } from '../context/StoreContext';

export default function PaymentQRModal({
  isOpen,
  onClose,
  payment = null,
  paymentRecord: propPaymentRecord = null,
  paymentId = null,
  customer = null,
  initialAmount = 0,
  suggestedAmount = null,
  customerName: propCustomerName = '',
  customerPhone: propCustomerPhone = '',
  customerId: propCustomerId = '',
  note = '',
  saleId = null,
  purpose = 'counter',
  onSuccess = null,
  onPaymentSuccess = null,
  startFullScreen = false
}) {
  const { shop } = useStore();
  const [amount, setAmount] = useState(initialAmount || 100);
  const [customerName, setCustomerName] = useState(customer?.name || propCustomerName || '');
  const [customerPhone, setCustomerPhone] = useState(customer?.phone || propCustomerPhone || '');
  const [isFullScreen, setIsFullScreen] = useState(startFullScreen || false);
  const [imageError, setImageError] = useState(false);
  
  // Payment lifecycle state
  const [paymentRecord, setPaymentRecord] = useState(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('Pending'); // 'Pending' | 'Paid' | 'Successful' | 'Partially Paid' | 'Failed' | 'Cancelled'
  
  // Manual Shop Owner Verification inputs
  const [upiRefInput, setUpiRefInput] = useState('');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [showPartialInput, setShowPartialInput] = useState(false);
  const [partialAmountInput, setPartialAmountInput] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isProcessingStatus, setIsProcessingStatus] = useState(false);
  
  // Feedback & Copy states
  const [feedbackMessage, setFeedbackMessage] = useState(null); // { type: 'success'|'error'|'info', text: string }
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [providerInfo, setProviderInfo] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // References for live stream & polling cleanup
  const sseRef = useRef(null);
  const pollingRef = useRef(null);
  const partialInputRef = useRef(null);
  const successNotifiedRef = useRef(null);

  // SSE, polling and the manual-confirm response can all report the same success
  const notifySuccess = (updated) => {
    const key = updated?.id || updated?.referenceNo || updated?._id;
    if (key && successNotifiedRef.current === key) return;
    successNotifiedRef.current = key;
    if (onSuccess) onSuccess(updated);
    if (onPaymentSuccess) onPaymentSuccess(updated);
  };

  // Fallback Store UPI QR Code path
  const STATIC_QR_IMAGE = '/images/payment-qr.jpeg';

  useEffect(() => {
    if (isOpen) {
      setFeedbackMessage(null);
      setShowCancelConfirm(false);
      setShowPartialInput(false);
      setIsProcessingStatus(false);
      setImageError(false);
      setIsFullScreen(startFullScreen || false);

      const existingRecord = payment || propPaymentRecord;

      if (existingRecord) {
        // Use existing payment request directly
        setPaymentRecord(existingRecord);
        const recAmount = Number(existingRecord.amount) || 100;
        setAmount(recAmount);
        setCustomerName(existingRecord.customerName || customer?.name || propCustomerName || '');
        setCustomerPhone(existingRecord.customerPhone || customer?.phone || propCustomerPhone || '');
        setPaymentStatus(existingRecord.status || 'Pending');
        setUpiRefInput(existingRecord.upiTransactionRef || '');
        setVerificationNotes('');
        setPartialAmountInput(existingRecord.amountPaid ? String(existingRecord.amountPaid) : String(Math.round(recAmount / 2)));
      } else if (paymentId) {
        // Fetch existing payment by ID
        fetchExistingPayment(paymentId);
      } else {
        // Create new counter payment request
        const numAmt = Number(suggestedAmount) > 0
          ? Number(suggestedAmount)
          : (Number(initialAmount) || 100);
        const cName = customer?.name || propCustomerName || '';
        const cPhone = customer?.phone || propCustomerPhone || '';
        const cId = customer?.id || propCustomerId || null;

        setAmount(numAmt);
        setCustomerName(cName);
        setCustomerPhone(cPhone);
        setPaymentStatus('Pending');
        setUpiRefInput('');
        setVerificationNotes('');
        setPartialAmountInput(String(Math.round(numAmt / 2)));

        createPaymentSession(numAmt, cName, cId, note);
      }

      loadProviderStatus();

      trackEvent('payment_qr_viewed', {
        amount_range: getAmountRange(amount),
        payment_method: 'upi'
      });
    }

    return () => {
      stopTracking();
    };
  }, [isOpen, payment, propPaymentRecord, paymentId, initialAmount, suggestedAmount, customer, propCustomerName, propCustomerPhone, propCustomerId, note, startFullScreen]);

  // Handle SSE and Polling based on paymentRecord
  useEffect(() => {
    const targetId = paymentRecord?.id || paymentRecord?.referenceNo || paymentRecord?._id;
    if (!paymentRecord || !targetId) return;
    
    // If payment is already in terminal state, don't poll
    if (['Successful', 'Paid', 'Failed', 'Cancelled'].includes(paymentStatus)) {
      stopTracking();
      return;
    }

    startTracking(targetId);

    return () => {
      stopTracking();
    };
  }, [paymentRecord?.id, paymentRecord?.referenceNo, paymentRecord?._id, paymentStatus]);

  const fetchExistingPayment = async (id) => {
    setIsCreatingPayment(true);
    try {
      const rec = await api.getPayment(id);
      if (rec) {
        setPaymentRecord(rec);
        setAmount(Number(rec.amount) || 100);
        setCustomerName(rec.customerName || '');
        setCustomerPhone(rec.customerPhone || '');
        setPaymentStatus(rec.status || 'Pending');
        setUpiRefInput(rec.upiTransactionRef || '');
        setPartialAmountInput(rec.amountPaid ? String(rec.amountPaid) : String(Math.round(rec.amount / 2)));
      }
    } catch (err) {
      console.error('Failed to load payment by ID:', err);
      setFeedbackMessage({ type: 'error', text: 'Could not load transaction details from server.' });
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const loadProviderStatus = async () => {
    try {
      const res = await api.getProviderStatus();
      setProviderInfo(res);
    } catch {
      // Ignore provider status error
    }
  };

  const startTracking = (payId) => {
    stopTracking();

    // 1. Server-Sent Events (SSE) for zero-latency push updates
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api';
      const sseUrl = `${apiUrl}/payments/${payId}/live-status`;
      const es = new EventSource(sseUrl);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleLiveUpdate(data);
        } catch (e) {
          console.error('SSE JSON error:', e);
        }
      };

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          es.close();
        }
      };

      sseRef.current = es;
    } catch (err) {
      console.warn('SSE stream failed to connect:', err);
    }

    // 2. Active Polling Fallback (every 2.5 seconds)
    pollingRef.current = setInterval(async () => {
      try {
        const syncRes = await api.syncPaymentGateway(payId);
        if (syncRes && syncRes.payment) {
          handleLiveUpdate(syncRes.payment);
        }
      } catch (err) {
        // Silent poll error
      }
    }, 2500);
  };

  const stopTracking = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleLiveUpdate = (updated) => {
    if (!updated || !updated.status) return;

    if (updated.status === 'Successful' || updated.status === 'Paid') {
      setPaymentStatus(updated.status);
      setPaymentRecord(prev => ({ ...prev, ...updated }));
      stopTracking();

      trackEvent('payment_confirmed', {
        payment_method: 'upi',
        amount_range: getAmountRange(updated.amount || amount),
        provider: updated.gatewayProvider || 'Razorpay'
      });

      notifySuccess(updated);
    } else if (updated.status === 'Failed' || updated.status === 'Cancelled' || updated.status === 'Partially Paid') {
      setPaymentStatus(updated.status);
      setPaymentRecord(prev => ({ ...prev, ...updated }));
      if (updated.status !== 'Partially Paid') {
        stopTracking();
      }
    }
  };

  const getAmountRange = (val) => {
    if (val <= 100) return '0-100';
    if (val <= 500) return '101-500';
    if (val <= 1000) return '501-1000';
    return '1000+';
  };

  const createPaymentSession = async (amt, custName, custId, sessionNote) => {
    setIsCreatingPayment(true);
    setFeedbackMessage(null);
    try {
      const record = await api.createPayment({
        amount: amt,
        customerName: custName || 'Walk-in Customer',
        customerId: custId,
        paymentMethod: 'upi',
        saleId,
        purpose,
        notes: sessionNote || 'Initiated via Antarya UPI QR Terminal'
      });
      setPaymentRecord(record);
      setPaymentStatus(record.status || 'Pending');

      trackEvent('payment_initiated', {
        payment_method: 'upi',
        amount_range: getAmountRange(amt)
      });
    } catch (err) {
      console.error('Failed to create payment session:', err);
      setFeedbackMessage({ 
        type: 'error', 
        text: 'Failed to create payment request: ' + (err.message || 'Server error. Please retry.') 
      });
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const handleAmountChange = (newVal) => {
    const val = Math.max(1, Number(newVal) || 0);
    setAmount(val);
    setPartialAmountInput(String(Math.round(val / 2)));
    if (!payment && !propPaymentRecord) {
      createPaymentSession(val, customerName, customer?.id || propCustomerId, note);
    }
  };

  const handleDownloadQR = async () => {
    try {
      let downloadSrc = paymentRecord?.qrDataUrl || paymentRecord?.gatewayQrImageUrl || STATIC_QR_IMAGE;
      const link = document.createElement('a');
      link.href = downloadSrc;
      link.download = `UPI_QR_${paymentRecord?.referenceNo || 'payment'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download failed', err);
    }
  };

  const handleCopyRef = () => {
    if (paymentRecord?.referenceNo) {
      navigator.clipboard.writeText(paymentRecord.referenceNo);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const handleCopyUPI = () => {
    const upiString = paymentRecord?.gatewayUpiIntent || (providerInfo?.merchantVpa ? `upi://pay?pa=${providerInfo.merchantVpa}&am=${amount}` : '');
    if (upiString) {
      navigator.clipboard.writeText(upiString);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    }
  };

  // ==========================================================================
  // REQUIREMENT 2: MARK AS VERIFIED (PAID)
  // ==========================================================================
  const handleConfirmPaidManual = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setFeedbackMessage(null);

    const targetId = paymentRecord?.id || paymentRecord?.referenceNo || paymentRecord?._id;

    // Verify that the payment request exists
    if (!paymentRecord || !targetId) {
      if (isCreatingPayment) {
        setFeedbackMessage({ type: 'info', text: 'Payment session is being created, please wait a moment...' });
        return;
      }
      setFeedbackMessage({ type: 'error', text: 'No active payment request found. Generating a new session now...' });
      createPaymentSession(amount, customerName, customer?.id || propCustomerId, note);
      return;
    }

    // Prevent duplicate updates if already Paid
    if (paymentStatus === 'Paid' || paymentStatus === 'Successful') {
      setFeedbackMessage({ type: 'info', text: 'This payment is already confirmed as Paid.' });
      return;
    }

    setIsProcessingStatus(true);
    try {
      const targetAmount = paymentRecord.amount || amount;
      const updated = await api.updatePaymentStatus(targetId, {
        status: 'Paid',
        amountPaid: targetAmount,
        upiTransactionRef: upiRefInput.trim() || undefined,
        note: verificationNotes.trim() || 'Verified received by shop owner (Manual Verification)',
        updatedBy: 'Shop Owner (Manual Verification)'
      });

      setPaymentRecord(updated);
      setPaymentStatus('Paid');
      stopTracking();
      setFeedbackMessage({ 
        type: 'success', 
        text: `✓ Payment of ₹${targetAmount.toLocaleString('en-IN')} marked as Paid!` 
      });

      trackEvent('payment_confirmed', {
        payment_method: 'upi',
        amount_range: getAmountRange(targetAmount),
        verification_type: 'manual'
      });

      notifySuccess(updated);
    } catch (err) {
      console.error('Failed to confirm payment:', err);
      setFeedbackMessage({ 
        type: 'error', 
        text: err.message || 'Failed to update payment status in database. Please try again.' 
      });
    } finally {
      setIsProcessingStatus(false);
    }
  };

  // ==========================================================================
  // REQUIREMENT 3: PARTIAL PAY
  // ==========================================================================
  const handleTogglePartialPay = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowCancelConfirm(false);
    const nextState = !showPartialInput;
    setShowPartialInput(nextState);
    if (nextState) {
      if (!partialAmountInput || Number(partialAmountInput) <= 0) {
        setPartialAmountInput(String(Math.round((paymentRecord?.amount || amount) / 2)));
      }
      setTimeout(() => {
        partialInputRef.current?.focus();
      }, 100);
    }
  };

  const handleConfirmPartial = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setFeedbackMessage(null);

    const targetId = paymentRecord?.id || paymentRecord?.referenceNo || paymentRecord?._id;

    if (!paymentRecord || !targetId) {
      setFeedbackMessage({ type: 'error', text: 'No active payment request found.' });
      return;
    }

    const totalAmt = paymentRecord.amount || amount;
    const partialAmt = Number(partialAmountInput);

    if (!partialAmt || partialAmt <= 0) {
      setFeedbackMessage({ type: 'error', text: 'Please enter a valid partial amount greater than ₹0.' });
      return;
    }

    if (partialAmt >= totalAmt) {
      setFeedbackMessage({ 
        type: 'error', 
        text: `Partial amount (₹${partialAmt}) must be less than total bill (₹${totalAmt}). For full payment, click "Mark as Verified (Paid)".` 
      });
      return;
    }

    setIsProcessingStatus(true);
    try {
      const updated = await api.updatePaymentStatus(targetId, {
        status: 'Partially Paid',
        amountPaid: partialAmt,
        upiTransactionRef: upiRefInput.trim() || undefined,
        note: verificationNotes.trim() || `Partial payment of ₹${partialAmt} received by shop owner`,
        updatedBy: 'Shop Owner'
      });

      setPaymentRecord(updated);
      setPaymentStatus('Partially Paid');
      setShowPartialInput(false);
      setFeedbackMessage({ 
        type: 'success', 
        text: `✓ Partial payment of ₹${partialAmt.toLocaleString('en-IN')} saved! Remaining balance: ₹${updated.balanceRemaining?.toLocaleString('en-IN')}.` 
      });

      // Refresh parent transaction history and financial summary
      if (onSuccess) onSuccess(updated);
      if (onPaymentSuccess) onPaymentSuccess(updated);
    } catch (err) {
      console.error('Failed to record partial payment:', err);
      setFeedbackMessage({ 
        type: 'error', 
        text: err.message || 'Failed to record partial payment.' 
      });
    } finally {
      setIsProcessingStatus(false);
    }
  };

  // ==========================================================================
  // REQUIREMENT 4: CANCEL PAYMENT WITH CONFIRMATION
  // ==========================================================================
  const handleOpenCancelConfirm = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowPartialInput(false);
    setShowCancelConfirm(true);
  };

  const handleExecuteCancel = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setFeedbackMessage(null);

    if (!paymentRecord || !paymentRecord.id) {
      setFeedbackMessage({ type: 'error', text: 'No active payment request found to cancel.' });
      setShowCancelConfirm(false);
      return;
    }

    setIsProcessingStatus(true);
    try {
      const updated = await api.updatePaymentStatus(paymentRecord.id, {
        status: 'Cancelled',
        note: verificationNotes.trim() || 'Payment request cancelled by shop owner',
        updatedBy: 'Shop Owner'
      });

      setPaymentRecord(updated);
      setPaymentStatus('Cancelled');
      setShowCancelConfirm(false);
      stopTracking();
      setFeedbackMessage({ 
        type: 'info', 
        text: `Payment request #${paymentRecord.referenceNo} has been cancelled. Record preserved in history.` 
      });

      trackEvent('payment_failed', {
        payment_method: 'upi',
        reason: 'cancelled_by_user'
      });

      // Refresh parent transaction history and financial summary
      if (onSuccess) onSuccess(updated);
      if (onPaymentSuccess) onPaymentSuccess(updated);
    } catch (err) {
      console.error('Failed to cancel payment:', err);
      setFeedbackMessage({ 
        type: 'error', 
        text: err.message || 'Failed to cancel payment request.' 
      });
    } finally {
      setIsProcessingStatus(false);
    }
  };

  // Developer & Sandbox Simulator
  const handleSimulateWebhook = async (statusToSimulate = 'Paid') => {
    if (!paymentRecord) return;
    setIsSimulating(true);
    setFeedbackMessage(null);
    try {
      const res = await api.testPaymentWebhook({
        paymentId: paymentRecord.id,
        status: statusToSimulate,
        amount: paymentRecord.amount
      });
      setFeedbackMessage({
        type: 'success',
        text: `⚡ Simulated Webhook Delivered! Status updated to ${statusToSimulate}.`
      });
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: `Webhook simulation failed: ${err.message}`
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const buildReceiptData = () => {
    const paid = paymentStatus === 'Partially Paid' ? (paymentRecord?.amountPaid || amount) : amount;
    return {
      shop,
      customerName: customerName || paymentRecord?.customerName || 'Walk-in Customer',
      total: paid,
      method: `UPI QR (${paymentRecord?.referenceNo || 'Direct'})`,
      invoiceNo: paymentRecord?.referenceNo,
      date: paymentRecord?.verifiedAt || paymentRecord?.updatedAt,
      items: [
        {
          name: `Bill Settlement - Ref #${paymentRecord?.referenceNo || 'UPI'}`,
          qty: 1,
          price: paid,
          unit: 'transaction'
        }
      ]
    };
  };

  const handlePrintReceipt = () => {
    generateInvoice(buildReceiptData());
    trackEvent('invoice_created', {
      payment_method: 'upi',
      item_count: 1
    });
  };

  const handleDownloadReceipt = async () => {
    try {
      await downloadInvoice(buildReceiptData());
      trackEvent('invoice_created', { payment_method: 'upi', item_count: 1 });
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Could not create the bill PDF.' });
    }
  };

  if (!isOpen) return null;

  const isSuccess = paymentStatus === 'Successful' || paymentStatus === 'Paid';
  const isPartiallyPaid = paymentStatus === 'Partially Paid';
  const isCancelled = paymentStatus === 'Cancelled';

  return (
    <AnimatePresence>
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5, 5, 16, 0.88)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          pointerEvents: 'auto'
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          style={{
            background: 'var(--card-bg, #0f172a)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
            borderRadius: isFullScreen ? '0px' : '24px',
            width: isFullScreen ? '100vw' : '100%',
            maxWidth: isFullScreen ? '100vw' : '540px',
            height: isFullScreen ? '100vh' : 'auto',
            maxHeight: isFullScreen ? '100vh' : '92vh',
            overflowY: 'auto',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            zIndex: 100000,
            pointerEvents: 'auto'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '18px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '12px',
                background: isSuccess ? 'rgba(16, 185, 129, 0.2)' : isPartiallyPaid ? 'rgba(56, 189, 248, 0.2)' : isCancelled ? 'rgba(244, 63, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color: isSuccess ? '#34d399' : isPartiallyPaid ? '#38bdf8' : isCancelled ? '#f43f5e' : '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {isSuccess ? <CheckCircle2 size={24} /> : isCancelled ? <X size={22} /> : <QrCode size={22} />}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'white' }}>
                  {isSuccess ? 'Payment Confirmed' : isPartiallyPaid ? 'Partially Paid Terminal' : isCancelled ? 'Payment Cancelled' : 'Dynamic UPI QR Terminal'}
                </h3>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #94a3b8)' }}>
                  {isSuccess 
                    ? 'Payment verified and recorded in store ledger' 
                    : isCancelled
                    ? 'Transaction marked cancelled; record preserved'
                    : 'Real-time tracking enabled with automated webhook & manual verification'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsFullScreen(!isFullScreen)}
                title={isFullScreen ? 'Exit Full Screen' : 'Show Full Screen QR'}
                style={{ padding: 8, borderRadius: '10px', color: '#cbd5e1', cursor: 'pointer' }}
              >
                {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
                style={{ padding: 8, borderRadius: '10px', color: '#cbd5e1', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            
            {/* Feedback Message Banner (Success / Error / Info) */}
            {feedbackMessage && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '0.84rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: feedbackMessage.type === 'success' 
                  ? 'rgba(16, 185, 129, 0.2)' 
                  : feedbackMessage.type === 'error' 
                  ? 'rgba(244, 63, 94, 0.2)' 
                  : 'rgba(56, 189, 248, 0.2)',
                border: `1px solid ${feedbackMessage.type === 'success' ? '#10b981' : feedbackMessage.type === 'error' ? '#f43f5e' : '#38bdf8'}`,
                color: feedbackMessage.type === 'success' ? '#34d399' : feedbackMessage.type === 'error' ? '#fb7185' : '#38bdf8'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {feedbackMessage.type === 'success' ? <CheckCircle size={18} /> : feedbackMessage.type === 'error' ? <AlertCircle size={18} /> : <Zap size={18} />}
                  <span>{feedbackMessage.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackMessage(null)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 4 }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Amount & Reference Bar */}
            <div style={{
              background: isSuccess ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
              borderRadius: '16px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {isSuccess ? 'Amount Received' : isPartiallyPaid ? 'Total Bill (Partially Settled)' : 'Amount Payable'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 900, color: isSuccess ? '#34d399' : isPartiallyPaid ? '#38bdf8' : '#10b981' }}>
                    ₹{Math.round(amount).toLocaleString('en-IN')}
                  </span>
                  {customerName && (
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '6px' }}>
                      for {customerName}
                    </span>
                  )}
                </div>
                {isPartiallyPaid && paymentRecord && (
                  <div style={{ fontSize: '0.76rem', color: '#38bdf8', marginTop: 4, fontWeight: 700 }}>
                    Received: ₹{paymentRecord.amountPaid?.toLocaleString('en-IN')} • Remaining: ₹{paymentRecord.balanceRemaining?.toLocaleString('en-IN')}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Payment Reference
                </div>
                <div 
                  onClick={handleCopyRef}
                  style={{ 
                    fontFamily: 'monospace', 
                    fontSize: '0.85rem', 
                    color: '#38bdf8', 
                    marginTop: 4, 
                    cursor: 'pointer',
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6,
                    background: 'rgba(56, 189, 248, 0.1)',
                    padding: '4px 10px',
                    borderRadius: '8px'
                  }}
                  title="Click to copy reference"
                >
                  <span>{paymentRecord?.referenceNo || 'Generating...'}</span>
                  {copiedRef ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                </div>
              </div>
            </div>

            {/* Merchant Gateway Provider Status Banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              borderRadius: '10px',
              background: providerInfo?.razorpayConfigured ? 'rgba(56, 189, 248, 0.1)' : 'rgba(251, 191, 36, 0.1)',
              border: `1px solid ${providerInfo?.razorpayConfigured ? 'rgba(56, 189, 248, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
              fontSize: '0.75rem',
              color: providerInfo?.razorpayConfigured ? '#38bdf8' : '#fbbf24'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} />
                <span>
                  <strong>Merchant Gateway:</strong> {providerInfo?.provider || 'Razorpay / Direct UPI'}
                  {providerInfo?.razorpayConfigured ? ' (Automated Webhooks Active)' : ' (Sandbox / Direct Mode)'}
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>
                VPA: {providerInfo?.merchantVpa || 'payments@antarya'}
              </span>
            </div>

            {/* Quick Amount Editor (Only when creating a new pending payment) */}
            {!isSuccess && !isCancelled && !payment && !propPaymentRecord && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 700 }}>
                  Adjust:
                </span>
                {[50, 100, 200, 500, 1000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleAmountChange(val)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: amount === val ? 'var(--accent, #ff6b35)' : 'rgba(255,255,255,0.05)',
                      color: 'white',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ₹{val}
                  </button>
                ))}
                <input
                  type="number"
                  value={amount}
                  onChange={e => handleAmountChange(e.target.value)}
                  style={{
                    width: 85,
                    padding: '4px 8px',
                    borderRadius: '8px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    textAlign: 'right'
                  }}
                />
              </div>
            )}

            {/* Dynamic QR Code Display Container */}
            {!isSuccess && !isCancelled ? (
              <div style={{
                background: '#ffffff',
                borderRadius: '20px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                position: 'relative',
                minHeight: '260px'
              }}>
                {isCreatingPayment ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#0f172a' }}>
                    <RefreshCw size={32} className="animate-spin" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Generating Dynamic UPI QR...</span>
                  </div>
                ) : paymentRecord?.qrDataUrl ? (
                  <img
                    src={paymentRecord.qrDataUrl}
                    alt="Dynamic UPI QR Code"
                    style={{
                      maxWidth: isFullScreen ? '360px' : '220px',
                      maxHeight: isFullScreen ? '360px' : '220px',
                      width: '100%',
                      height: 'auto',
                      objectFit: 'contain',
                      aspectRatio: '1 / 1',
                      borderRadius: '8px'
                    }}
                  />
                ) : paymentRecord?.gatewayQrImageUrl ? (
                  <img
                    src={paymentRecord.gatewayQrImageUrl}
                    alt="Merchant Gateway QR"
                    style={{
                      maxWidth: isFullScreen ? '360px' : '220px',
                      maxHeight: isFullScreen ? '360px' : '220px',
                      width: '100%',
                      height: 'auto',
                      objectFit: 'contain',
                      aspectRatio: '1 / 1',
                      borderRadius: '8px'
                    }}
                  />
                ) : paymentRecord?.gatewayUpiIntent ? (
                  <div style={{ padding: 10, background: 'white', borderRadius: 8 }}>
                    <QRCodeSVG
                      value={paymentRecord.gatewayUpiIntent}
                      size={isFullScreen ? 320 : 220}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                ) : !imageError ? (
                  <img
                    src={STATIC_QR_IMAGE}
                    alt="Store UPI Payment QR Code"
                    onError={() => setImageError(true)}
                    style={{
                      maxWidth: isFullScreen ? '360px' : '220px',
                      maxHeight: isFullScreen ? '360px' : '220px',
                      width: '100%',
                      height: 'auto',
                      objectFit: 'contain',
                      borderRadius: '8px'
                    }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 14px', color: '#1e293b' }}>
                    <AlertCircle size={40} color="#ef4444" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#991b1b', marginBottom: 6 }}>
                      QR Generation
                    </div>
                    <button
                      type="button"
                      onClick={() => createPaymentSession(amount, customerName, customer?.id || propCustomerId, note)}
                      style={{
                        padding: '8px 16px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      <RefreshCw size={14} /> Retry
                    </button>
                  </div>
                )}

                {/* Supported UPI Apps Row */}
                <div style={{
                  marginTop: 14,
                  padding: '6px 14px',
                  borderRadius: '20px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <span>Google Pay</span> • <span>PhonePe</span> • <span>Paytm</span> • <span>BHIM UPI</span>
                </div>
              </div>
            ) : isCancelled ? (
              /* Cancelled Card Display */
              <div style={{
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: '20px',
                padding: '24px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(244, 63, 94, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f43f5e'
                }}>
                  <X size={32} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: 'white' }}>
                  Payment Request Cancelled
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', maxWidth: 360 }}>
                  This payment request has been cancelled by the shop owner. The audit log has been updated and the record is preserved in history.
                </p>
              </div>
            ) : (
              /* Success Card Celebration */
              <div style={{
                background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.08))',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '20px',
                padding: '24px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12
              }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#34d399',
                  boxShadow: '0 0 25px rgba(16, 185, 129, 0.3)'
                }}>
                  <CheckCircle size={38} />
                </div>

                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>
                  ₹{Math.round(amount).toLocaleString('en-IN')} Received!
                </h3>
                
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', maxWidth: 360 }}>
                  Payment confirmed and recorded. Customer Khata ledger and shop financial records have been updated.
                </p>

                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  width: '100%',
                  maxWidth: 380,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  textAlign: 'left',
                  fontSize: '0.78rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Status:</span>
                    <span style={{ color: '#34d399', fontWeight: 800 }}>Paid (Verified)</span>
                  </div>
                  {paymentRecord?.upiTransactionRef && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Ref / UTR:</span>
                      <span style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700 }}>
                        {paymentRecord.upiTransactionRef}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Verified Amount:</span>
                    <span style={{ color: '#34d399', fontWeight: 800 }}>
                      ✓ ₹{paymentRecord?.amountPaid || amount}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Recorded At:</span>
                    <span style={{ color: 'white' }}>
                      {new Date(paymentRecord?.verifiedAt || paymentRecord?.updatedAt || Date.now()).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* QR Utility Buttons & UPI Intent Link (When Pending or Partially Paid) */}
            {!isSuccess && !isCancelled && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDownloadQR}
                  style={{ flex: 1, padding: '10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                >
                  <Download size={15} /> Download QR
                </button>
                {paymentRecord?.gatewayUpiIntent && (
                  <a
                    href={paymentRecord.gatewayUpiIntent}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
                  >
                    <Smartphone size={15} /> Pay on Device
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCopyUPI}
                  style={{ flex: 1, padding: '10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                >
                  {copiedUpi ? <Check size={15} color="#34d399" /> : <Copy size={15} />}
                  <span>{copiedUpi ? 'Copied Intent' : 'Copy Intent'}</span>
                </button>
              </div>
            )}

            {/* Status Indicator */}
            <div style={{
              padding: '12px 16px',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 
                isSuccess ? 'rgba(16, 185, 129, 0.15)' :
                isPartiallyPaid ? 'rgba(56, 189, 248, 0.15)' :
                isCancelled ? 'rgba(244, 63, 94, 0.15)' :
                'rgba(251, 191, 36, 0.15)',
              border: `1px solid ${
                isSuccess ? 'rgba(16, 185, 129, 0.35)' :
                isPartiallyPaid ? 'rgba(56, 189, 248, 0.35)' :
                isCancelled ? 'rgba(244, 63, 94, 0.35)' :
                'rgba(251, 191, 36, 0.35)'
              }`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isSuccess ? (
                  <CheckCircle2 size={20} color="#34d399" />
                ) : isCancelled ? (
                  <AlertCircle size={20} color="#f43f5e" />
                ) : isPartiallyPaid ? (
                  <Clock size={20} color="#38bdf8" />
                ) : (
                  <RefreshCw size={20} color="#fbbf24" className="animate-spin" />
                )}
                <div>
                  <div style={{
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    color: isSuccess ? '#34d399' : isCancelled ? '#f43f5e' : isPartiallyPaid ? '#38bdf8' : '#fbbf24'
                  }}>
                    Status: {isSuccess ? 'Paid (Verified)' : paymentStatus}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #94a3b8)' }}>
                    {isSuccess 
                      ? 'Payment verified and credited to store account.'
                      : isPartiallyPaid
                      ? `₹${paymentRecord?.amountPaid} received. Balance ₹${paymentRecord?.balanceRemaining} remaining.`
                      : isCancelled
                      ? 'Payment request was cancelled.'
                      : 'Waiting for customer UPI scan or manual verification.'}
                  </div>
                </div>
              </div>

              {isSuccess && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handlePrintReceipt}
                  style={{
                    background: '#10b981',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Printer size={13} /> Print Receipt
                </button>
              )}
            </div>

            {/* Developer / Testing Sandbox: Live Webhook Simulator (Only in dev / test mode when pending) */}
            {!isSuccess && !isCancelled && providerInfo?.features?.testEvents && (
              <div style={{
                background: 'rgba(56, 189, 248, 0.05)',
                border: '1px dashed rgba(56, 189, 248, 0.3)',
                padding: '10px 14px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: '#38bdf8', fontWeight: 700 }}>
                  <Zap size={14} /> Webhook Test Tool:
                </div>
                <button
                  type="button"
                  onClick={() => handleSimulateWebhook('Paid')}
                  disabled={isSimulating}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                    borderRadius: '8px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {isSimulating ? 'Verifying...' : '⚡ Simulate Webhook'}
                </button>
              </div>
            )}

            {/* ================================================================ */}
            {/* SHOP OWNER MANUAL VERIFICATION SECTION (Fixing All 3 Buttons)      */}
            {/* ================================================================ */}
            {!isSuccess && !isCancelled && (
              <div style={{
                background: 'rgba(0,0,0,0.35)',
                padding: '18px',
                borderRadius: '18px',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                pointerEvents: 'auto'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={16} color="#38bdf8" /> Shop Owner Verification
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    (Counter Confirmation)
                  </span>
                </div>

                <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #94a3b8)', margin: 0, lineHeight: 1.4 }}>
                  Check your Google Pay, PhonePe, Paytm, or bank SMS. When confirmed received, update below:
                </p>

                {/* Optional Reference & Notes Inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Bank UTR / UPI Reference No. (Optional)"
                    value={upiRefInput}
                    onChange={e => setUpiRefInput(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px',
                      color: 'white',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Verification Note (e.g. Confirmed in HDFC App / Cash Received)"
                    value={verificationNotes}
                    onChange={e => setVerificationNotes(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px',
                      color: 'white',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Partial Pay Dedicated Input Form */}
                {showPartialInput && (
                  <div style={{
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#38bdf8' }}>
                        Enter Partial Amount Received (Total: ₹{Math.round(amount)})
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setShowPartialInput(false)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        ref={partialInputRef}
                        type="number"
                        placeholder="Amount Received ₹"
                        value={partialAmountInput}
                        onChange={e => setPartialAmountInput(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          background: '#0c0a1e',
                          border: '1px solid #38bdf8',
                          borderRadius: '10px',
                          color: 'white',
                          fontSize: '0.9rem',
                          fontWeight: 800
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleConfirmPartial}
                        disabled={isProcessingStatus}
                        className="btn"
                        style={{
                          background: '#38bdf8',
                          color: '#0f172a',
                          fontWeight: 800,
                          padding: '0 18px',
                          borderRadius: '10px',
                          fontSize: '0.84rem',
                          cursor: isProcessingStatus ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isProcessingStatus ? 'Saving...' : 'Save Partial'}
                      </button>
                    </div>

                    {Number(partialAmountInput) > 0 && Number(partialAmountInput) < amount && (
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                        Remaining balance of <strong style={{ color: '#fb7185' }}>₹{(amount - Number(partialAmountInput)).toLocaleString('en-IN')}</strong> will remain on customer Khata.
                      </div>
                    )}
                  </div>
                )}

                {/* Cancel Confirmation Prompt */}
                {showCancelConfirm && (
                  <div style={{
                    background: 'rgba(244, 63, 94, 0.12)',
                    border: '1px solid rgba(244, 63, 94, 0.4)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', fontWeight: 800, color: '#f43f5e' }}>
                      <AlertTriangle size={16} /> Confirm Cancellation
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#e2e8f0', margin: 0, lineHeight: 1.4 }}>
                      Are you sure you want to cancel payment request #{paymentRecord?.referenceNo || 'current'} for ₹{Math.round(amount)}? Transaction history will be preserved as Cancelled.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleExecuteCancel}
                        disabled={isProcessingStatus}
                        className="btn"
                        style={{
                          flex: 1,
                          background: '#f43f5e',
                          color: 'white',
                          fontWeight: 800,
                          padding: '10px',
                          borderRadius: '10px',
                          fontSize: '0.82rem',
                          cursor: isProcessingStatus ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isProcessingStatus ? 'Cancelling...' : 'Yes, Cancel Request'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '0.82rem', cursor: 'pointer' }}
                      >
                        No, Keep Pending
                      </button>
                    </div>
                  </div>
                )}

                {/* PRIMARY ACTIONS: All 3 Buttons (Guaranteed Interactive & Accessible) */}
                <div style={{ 
                  display: 'flex', 
                  gap: 10, 
                  flexWrap: 'wrap', 
                  marginTop: 4, 
                  position: 'relative', 
                  zIndex: 10 
                }}>
                  {/* Button 1: Mark as Verified (Paid) */}
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={handleConfirmPaidManual}
                    disabled={isProcessingStatus}
                    style={{
                      flex: 2,
                      minWidth: '180px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      fontWeight: 800,
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: 'none',
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: isProcessingStatus ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                      outline: 'none',
                      userSelect: 'none',
                      pointerEvents: isProcessingStatus ? 'none' : 'auto'
                    }}
                  >
                    {isProcessingStatus ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={18} />
                        <span>Mark as Verified (Paid)</span>
                      </>
                    )}
                  </button>

                  {/* Button 2: Partial Pay */}
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={handleTogglePartialPay}
                    disabled={isProcessingStatus}
                    style={{
                      flex: 1,
                      minWidth: '100px',
                      padding: '14px 14px',
                      borderRadius: '12px',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      background: showPartialInput ? '#38bdf8' : 'rgba(56, 189, 248, 0.15)',
                      color: showPartialInput ? '#0f172a' : '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      outline: 'none',
                      userSelect: 'none',
                      pointerEvents: 'auto'
                    }}
                  >
                    <span>Partial Pay</span>
                  </button>

                  {/* Button 3: Cancel */}
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={handleOpenCancelConfirm}
                    disabled={isProcessingStatus}
                    style={{
                      flex: 1,
                      minWidth: '90px',
                      padding: '14px 14px',
                      borderRadius: '12px',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      color: '#f43f5e',
                      background: 'rgba(244, 63, 94, 0.12)',
                      border: '1px solid rgba(244, 63, 94, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      outline: 'none',
                      userSelect: 'none',
                      pointerEvents: 'auto'
                    }}
                  >
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            )}

            {/* Post-Verification / Post-Cancellation Action Bar */}
            {(isSuccess || isCancelled) && (
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {isSuccess && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handlePrintReceipt}
                    style={{ flex: 1, padding: '14px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#10b981', cursor: 'pointer' }}
                  >
                    <Printer size={18} /> Print Official Receipt
                  </button>
                )}
                {isSuccess && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleDownloadReceipt}
                    style={{ flex: 1, padding: '14px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
                  >
                    <Download size={18} /> Download PDF
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  style={{ flex: 1, padding: '14px', borderRadius: '12px', cursor: 'pointer' }}
                >
                  Done
                </button>
              </div>
            )}

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
