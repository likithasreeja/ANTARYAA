import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Antarya UI Crash Captured:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="page" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '80vh',
          textAlign: 'center',
          padding: 24 
        }}>
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20
          }}>
            <AlertTriangle size={36} color="#f43f5e" />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8 }}>
            Store Intelligence Encountered a Glitch ⚠️
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 400, lineHeight: 1.6, marginBottom: 24 }}>
            Something went wrong while displaying this screen. Don't worry, your shop data and inventory are 100% safe in the database.
          </p>

          <div style={{
            background: 'rgba(0,0,0,0.3)',
            padding: 12,
            borderRadius: 8,
            border: '1px solid var(--glass-border)',
            fontSize: '0.78rem',
            color: '#f43f5e',
            fontFamily: 'monospace',
            maxWidth: 450,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 28,
            textAlign: 'left',
            width: '100%'
          }}>
            {this.state.error?.toString() || 'Unknown runtime error'}
          </div>

          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 320 }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => window.location.reload()} 
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <RefreshCw size={16} /> Reload
            </button>
            <button 
              className="btn btn-primary" 
              onClick={this.handleReset} 
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Home size={16} /> Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
