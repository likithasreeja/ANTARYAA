import { useState, useEffect, useRef } from 'react';
import { useStore } from '../context/StoreContext';
import { Send, Zap, ZapOff } from 'lucide-react';
import api from '../api';

export default function AskAnything() {
  const { shop } = useStore();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    // Check AI status and set welcome message
    api.getAIStatus()
      .then(status => {
        setAiStatus(status);
        const source = status.gemini ? '🧠 Gemini AI' : '🤖 Local AI';
        setMessages([{
          type: 'bot',
          text: `Namaste ${shop?.ownerName || 'Boss'}! 🙏\n\nI'm your shop's ${status.gemini ? 'AI-powered' : ''} assistant. Ask me anything about your business!\n\nPowered by: ${source}\n\nTry:\n• "What is my biggest problem?"\n• "Who is my best customer?"\n• "Give me festival tips"`,
          source: status.gemini ? 'gemini' : 'local'
        }]);
      })
      .catch(() => {
        setMessages([{
          type: 'bot',
          text: `Namaste ${shop?.ownerName || 'Boss'}! 🙏\n\nAsk me anything about your shop!`,
          source: 'local'
        }]);
      });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { type: 'user', text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Send to real backend (Gemini or fallback)
      const result = await api.aiChat(text.trim(), messages);
      setMessages(prev => [
        ...prev,
        {
          type: 'bot',
          text: result.response,
          source: result.source
        }
      ]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [
        ...prev,
        {
          type: 'bot',
          text: 'Sorry, I had trouble processing that. Please try again! 🙏',
          source: 'error'
        }
      ]);
    }

    setIsTyping(false);
    inputRef.current?.focus();
  };

  const quickQuestions = [
    "What is my biggest problem?",
    "How are my sales today?",
    "Who is my best customer?",
    "What stock is low?",
    "Festival preparation tips",
    "How to increase profit?"
  ];

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 20px)', paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Ask Anything 🤖</h1>
          <p className="page-subtitle" style={{ marginBottom: 8 }}>Your shop's AI assistant</p>
        </div>
        {/* AI Status Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderRadius: 20,
          background: aiStatus?.gemini ? 'var(--success-bg)' : 'var(--glass)',
          border: `1px solid ${aiStatus?.gemini ? 'rgba(16,185,129,0.15)' : 'var(--glass-border)'}`,
          fontSize: '0.7rem',
          fontWeight: 700,
          color: aiStatus?.gemini ? 'var(--success)' : 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: 0.5
        }}>
          {aiStatus?.gemini ? <Zap size={12} /> : <ZapOff size={12} />}
          {aiStatus?.gemini ? 'Gemini AI' : 'Local AI'}
        </div>
      </div>

      {/* Chat Messages */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ position: 'relative' }}>
            <div
              className={`chat-bubble ${msg.type}`}
              style={{ whiteSpace: 'pre-line' }}
            >
              {msg.text}
            </div>
            {/* Source indicator for bot messages */}
            {msg.type === 'bot' && msg.source && msg.source !== 'error' && (
              <div style={{
                fontSize: '0.62rem',
                color: 'var(--text-muted)',
                marginBottom: 8,
                marginLeft: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                {msg.source === 'gemini' ? '🧠 Gemini AI' : msg.source === 'bhashini' ? '🗣️ Bhashini' : '🤖 Smart Fallback'}
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="chat-bubble bot" style={{ display: 'flex', gap: 6, padding: '14px 18px' }}>
            <span style={{ animation: 'badgePulse 1s infinite', fontSize: '1.1rem' }}>●</span>
            <span style={{ animation: 'badgePulse 1s infinite 0.2s', fontSize: '1.1rem' }}>●</span>
            <span style={{ animation: 'badgePulse 1s infinite 0.4s', fontSize: '1.1rem' }}>●</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      {messages.length <= 2 && (
        <div style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 8,
          marginBottom: 4,
          scrollbarWidth: 'none'
        }}>
          {quickQuestions.map((q, i) => (
            <button
              key={i}
              className="btn btn-secondary btn-sm"
              onClick={() => sendMessage(q)}
              style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '6px 12px' }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <div className="chat-input-bar">
        <input
          ref={inputRef}
          className="input"
          placeholder="Ask about your shop..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          style={{ flex: 1 }}
          id="chat-input"
        />
        <button
          className="btn btn-primary"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isTyping}
          style={{ padding: '12px 16px' }}
        >
          <Send size={18} />
        </button>
      </div>

      {/* API Key Missing Warning */}
      {aiStatus && !aiStatus.gemini && (
        <div style={{
          textAlign: 'center',
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          marginTop: 8,
          padding: '6px 12px',
          background: 'var(--glass)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--glass-border)'
        }}>
          💡 Add <strong>GEMINI_API_KEY</strong> to <code>server/.env</code> for real AI responses
        </div>
      )}
    </div>
  );
}
