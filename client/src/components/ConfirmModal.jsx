import React from 'react';
import { AlertTriangle, Trash2, Check, X } from 'lucide-react';

export default function ConfirmModal({ 
  isOpen, 
  title = 'Confirm Action', 
  message = 'Are you sure you want to proceed?', 
  confirmText = 'Confirm', 
  cancelText = 'Cancel', 
  isDanger = true, 
  onConfirm, 
  onCancel 
}) {
  if (!isOpen) return null;

  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div className="confirm-modal-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: isDanger ? 'rgba(244, 63, 94, 0.15)' : 'rgba(52, 211, 153, 0.15)',
            color: isDanger ? '#f43f5e' : '#34d399',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {isDanger ? <Trash2 size={22} /> : <Check size={22} />}
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'white' }}>{title}</h3>
          </div>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 24, paddingLeft: 4 }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            style={{ flex: 1, padding: '12px', fontWeight: 600 }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="btn"
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '12px',
              fontWeight: 700,
              background: isDanger ? '#f43f5e' : '#10b981',
              color: 'white',
              border: 'none',
              boxShadow: isDanger ? '0 4px 14px rgba(244, 63, 94, 0.3)' : '0 4px 14px rgba(16, 185, 129, 0.3)'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
