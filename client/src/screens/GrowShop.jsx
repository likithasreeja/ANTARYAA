import { useState, useRef, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { TrendingUp, Megaphone, Package, Send, RefreshCw, Bot, AlertTriangle } from 'lucide-react';
import api from '../api';

const EXPERTS = [
  {
    id: 'finance',
    name: 'Finance Minister',
    icon: <TrendingUp size={24} />,
    color: 'var(--success)',
    bg: 'var(--success-bg)',
    desc: 'Forecasts revenue & collections'
  },
  {
    id: 'marketing',
    name: 'Marketing Guru',
    icon: <Megaphone size={24} />,
    color: 'var(--purple-light)',
    bg: 'var(--purple-glow)',
    desc: 'Analyzes customers & creates campaigns'
  },
  {
    id: 'ops',
    name: 'Ops Manager',
    icon: <Package size={24} />,
    color: 'var(--warning)',
    bg: 'var(--warning-bg)',
    desc: 'Manages dead stock & inventory'
  }
];

// Simple markdown renderer for AI responses
const AIMessage = ({ content }) => {
  if (!content) return null;
  
  const paragraphs = content.split('\n\n').filter(p => p.trim() !== '');
  
  return (
    <div className="ai-message-content" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
      {paragraphs.map((p, i) => {
        // Handle bullet points
        if (p.startsWith('- ') || p.startsWith('* ')) {
          const items = p.split('\n').filter(i => i.trim() !== '');
          return (
            <ul key={i} style={{ paddingLeft: '1.2rem', marginBottom: '0.8rem' }}>
              {items.map((item, j) => {
                const text = item.replace(/^[-*]\s/, '');
                return <li key={j}>{renderFormattedText(text)}</li>;
              })}
            </ul>
          );
        }
        return <p key={i} style={{ marginBottom: '0.8rem' }}>{renderFormattedText(p)}</p>;
      })}
    </div>
  );
};

const renderFormattedText = (text) => {
  // Bold **text**
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  return boldParts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

export default function GrowShop() {
  const { showToast } = useStore();
  const [activeExpert, setActiveExpert] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState(true);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const selectExpert = async (expert) => {
    setActiveExpert(expert);
    setMessages([]);
    setLoading(true);
    
    try {
      const data = await api.askAdvisor(expert.id, '');
      if (data.source === 'local') {
         setAiStatus(false);
      }
      setMessages([{ role: 'model', text: data.response }]);
    } catch (err) {
      console.error(err);
      showToast('Master, I could not reach the expert.', 'error');
    }
    setLoading(false);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || loading || !activeExpert) return;

    const userMsg = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const data = await api.askAdvisor(activeExpert.id, userMsg);
      setMessages(prev => [...prev, { role: 'model', text: data.response }]);
    } catch (err) {
      console.error(err);
      showToast('Could not send message', 'error');
    }
    setLoading(false);
  };

  if (activeExpert) {
    return (
      <div className="page" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button className="btn btn-ghost" onClick={() => setActiveExpert(null)} style={{ padding: '8px' }}>
            ← Back
          </button>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: activeExpert.bg, color: activeExpert.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {activeExpert.icon}
          </div>
          <div>
            <h1 className="page-title" style={{ fontSize: '1.2rem', marginBottom: 2 }}>{activeExpert.name}</h1>
            <p className="page-subtitle" style={{ fontSize: '0.8rem' }}>AI Advisory Board</p>
          </div>
        </div>

        {/* Chat Area */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 20 }}>
          {!aiStatus && (
            <div className="alert-banner warning">
              <span className="alert-icon"><AlertTriangle size={16}/></span>
              <div className="alert-text">
                <div className="alert-title">AI is offline</div>
                <div className="alert-desc">Add GEMINI_API_KEY to server/.env to enable the Advisory Board.</div>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
             <div key={idx} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
              background: msg.role === 'user' ? 'var(--primary)' : 'var(--glass)',
              color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
              boxShadow: msg.role === 'model' ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none',
              border: msg.role === 'model' ? '1px solid var(--glass-border)' : 'none',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '16px 16px 0 16px' : '16px 16px 16px 0',
            }}>
              {msg.role === 'model' ? <AIMessage content={msg.text} /> : msg.text}
            </div>
          ))}
          
          {loading && (
            <div style={{ alignSelf: 'flex-start', background: 'var(--glass)', padding: '12px 16px', borderRadius: '16px 16px 16px 0', border: '1px solid var(--glass-border)' }}>
              <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, marginTop: 'auto', padding: '12px 0' }}>
          <input
            type="text"
            className="input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ask ${activeExpert.name}...`}
            style={{ flex: 1, borderRadius: '999px', background: 'var(--glass)', paddingLeft: 20 }}
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" style={{ borderRadius: '999px', width: 48, height: 48, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={loading || !inputText.trim()}>
            <Send size={20} />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">AI Advisory Board 🧠</h1>
      <p className="page-subtitle">Consult your specialized AI experts to optimize operations, increase revenue, and grow your shop.</p>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {EXPERTS.map(expert => (
          <div key={expert.id} className="card" style={{ padding: 20, cursor: 'pointer', transition: 'all 0.2sease', border: '1px solid var(--glass-border)' }}
            onClick={() => selectExpert(expert)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 'var(--radius-md)', background: expert.bg, color: expert.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {expert.icon}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>{expert.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{expert.desc}</p>
              </div>
              <div style={{ color: 'var(--primary)' }}>
                →
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 32, borderColor: 'rgba(16,185,129,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Bot size={20} color="var(--success)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>How does this differ from "Smart Suggestions"?</h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          While Smart Suggestions automatically tracks your day-to-day metrics (like Low Stock or Credit limits), the <strong>AI Advisory Board</strong> is designed for high-level business strategy. 
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 8 }}>
          Each expert reads completely different parts of your shop database to generate highly targeted analytics, marketing plans, and operational workflows. Connect directly with them to make domain-specific changes.
        </p>
      </div>
    </div>
  );
}
