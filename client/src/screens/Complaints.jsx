import { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { MessageCircle, Send, Check, Clock, AlertCircle, Plus, Trash2, X, RefreshCw } from 'lucide-react';
import api from '../api';

export default function Complaints() {
  const { showToast } = useStore();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customReply, setCustomReply] = useState('');
  const [replyingId, setReplyingId] = useState(null);

  // Add new complaint modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState('');
  const [newIssue, setNewIssue] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComplaints();
  }, []);

  const loadComplaints = async () => {
    setLoading(true);
    try {
      const data = await api.getComplaints();
      setComplaints(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load complaints:', err);
      showToast('Error loading complaints', 'error');
    }
    setLoading(false);
  };

  const handleResolve = async (id, replyText) => {
    try {
      await api.resolveComplaint(id, replyText);
      showToast(`Reply sent & issue resolved! ✅`);
      setReplyingId(null);
      setCustomReply('');
      loadComplaints();
    } catch (err) {
      console.error('Resolve error:', err);
      showToast(err.message || 'Failed to resolve complaint', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteComplaint(id);
      showToast('Complaint removed');
      loadComplaints();
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete complaint', 'error');
    }
  };

  const handleAddComplaint = async (e) => {
    e.preventDefault();
    if (!newCustomer.trim() || !newIssue.trim()) {
      showToast('Please enter customer name and issue details', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      await api.addComplaint({
        customer: newCustomer.trim(),
        issue: newIssue.trim(),
        priority: newPriority
      });
      showToast('Complaint logged! AI generated suggested reply ✨');
      setShowAddModal(false);
      setNewCustomer('');
      setNewIssue('');
      setNewPriority('medium');
      loadComplaints();
    } catch (err) {
      console.error('Add complaint error:', err);
      showToast(err.message || 'Failed to add complaint', 'error');
    }
    setSubmitting(false);
  };

  const openComplaints = complaints.filter(c => c.status === 'open');
  const resolvedComplaints = complaints.filter(c => c.status === 'resolved');

  if (loading && complaints.length === 0) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner"></div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 14, fontSize: '0.85rem' }}>Loading complaints...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Complaints 🆘</h1>
          <p className="page-subtitle">Manage & resolve customer issues with AI assistance</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-icon" onClick={loadComplaints} title="Refresh">
            <RefreshCw size={18} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Log Issue
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card" style={{ borderColor: openComplaints.length > 0 ? 'rgba(239, 68, 68, 0.3)' : 'var(--glass-border)' }}>
          <div className="stat-label">🔴 Open Issues</div>
          <div className="stat-value" style={{ color: openComplaints.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {openComplaints.length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">✅ Resolved</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{resolvedComplaints.length}</div>
        </div>
      </div>

      {/* Open Issues */}
      {openComplaints.length > 0 && (
        <>
          <div className="section-title">🔴 Open Issues</div>
          {openComplaints.map(complaint => (
            <div className="card" key={complaint.id} style={{
              borderColor: complaint.priority === 'high' ? 'rgba(239, 68, 68, 0.25)' : 'var(--glass-border)',
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--radius-full)',
                  background: complaint.priority === 'high' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <AlertCircle size={18} color={complaint.priority === 'high' ? 'var(--danger)' : 'var(--warning)'} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{complaint.customer}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} /> {complaint.date || 'Recently'}
                  </div>
                </div>
                <span className={`badge ${complaint.priority === 'high' ? 'badge-critical' : 'badge-low'}`} style={{ textTransform: 'uppercase' }}>
                  {complaint.priority}
                </span>
                <button
                  onClick={() => handleDelete(complaint.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div style={{
                padding: 12,
                background: 'var(--glass)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.9rem',
                marginBottom: 12,
                borderLeft: '3px solid var(--danger)'
              }}>
                "{complaint.issue}"
              </div>

              {/* Suggested Reply */}
              {complaint.suggestedReply && (
                <div style={{
                  padding: 12,
                  background: 'var(--success-bg)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  marginBottom: 12,
                  borderLeft: '3px solid var(--success)'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success)', marginBottom: 4, textTransform: 'uppercase' }}>
                    🤖 AI Suggested Reply:
                  </div>
                  {complaint.suggestedReply}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => handleResolve(complaint.id, complaint.suggestedReply || 'Issue resolved directly')}
                  style={{ flex: 1 }}
                >
                  <Send size={14} /> Quick Reply & Resolve
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setReplyingId(replyingId === complaint.id ? null : complaint.id);
                    setCustomReply(complaint.suggestedReply || '');
                  }}
                >
                  ✏️ Custom
                </button>
              </div>

              {/* Custom Reply Box */}
              {replyingId === complaint.id && (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    className="input"
                    placeholder="Type your custom reply..."
                    value={customReply}
                    onChange={e => setCustomReply(e.target.value)}
                    rows={3}
                    style={{ resize: 'none' }}
                  />
                  <button
                    className="btn btn-primary btn-sm btn-full"
                    onClick={() => handleResolve(complaint.id, customReply)}
                    style={{ marginTop: 8 }}
                    disabled={!customReply.trim()}
                  >
                    <Send size={14} /> Send & Resolve
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Resolved */}
      {resolvedComplaints.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 24 }}>✅ Resolved Issues</div>
          {resolvedComplaints.map(complaint => (
            <div className="card" key={complaint.id} style={{ opacity: 0.7, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Check size={20} color="var(--success)" style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{complaint.customer}: "{complaint.issue}"</div>
                  {complaint.replySent && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic', background: 'var(--glass)', padding: 8, borderRadius: 6 }}>
                      Reply: "{complaint.replySent}"
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Resolved • {complaint.date || 'Earlier'}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(complaint.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                  title="Remove history"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Empty State */}
      {complaints.length === 0 && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div className="emoji">🎉</div>
          <h3>No Complaints!</h3>
          <p>All your customers are happy. Keep up the great work!</p>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(true)} style={{ marginTop: 16 }}>
            <Plus size={14} /> Log a new customer issue
          </button>
        </div>
      )}

      {/* Tips */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>💡 Customer Service Tips</h3>
        <ul style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 16 }}>
          <li>Always apologize first, even if it's not your fault</li>
          <li>Replace defective items immediately - it builds long-term loyalty</li>
          <li>A small discount on next purchase turns angry customers into regulars</li>
          <li>Respond within 30 minutes for best results</li>
        </ul>
      </div>

      {/* Add Complaint Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => !submitting && setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Log Customer Complaint</h3>
              <button onClick={() => !submitting && setShowAddModal(false)} className="btn btn-icon">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddComplaint}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Customer Name / Phone
                </label>
                <input
                  className="input"
                  placeholder="e.g. Ramesh Singh (9876...)"
                  value={newCustomer}
                  onChange={e => setNewCustomer(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Issue / Complaint Details
                </label>
                <textarea
                  className="input"
                  placeholder="e.g. Milk packet was sour / price discrepancy"
                  value={newIssue}
                  onChange={e => setNewIssue(e.target.value)}
                  disabled={submitting}
                  rows={3}
                  style={{ resize: 'none' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Priority Level
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['low', 'medium', 'high'].map(level => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => setNewPriority(level)}
                      className={`btn btn-sm ${newPriority === level ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, textTransform: 'capitalize' }}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={submitting || !newCustomer.trim() || !newIssue.trim()}
              >
                {submitting ? 'Generating AI Reply...' : 'Log & Generate AI Reply ✨'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
