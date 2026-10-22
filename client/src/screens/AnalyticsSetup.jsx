import { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { 
  Activity, ShieldCheck, CheckCircle2, AlertCircle, ArrowLeft, 
  ExternalLink, Copy, Check, Terminal, Eye, RefreshCw, Send,
  Sparkles, Layers, ListFilter, HelpCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getGAStatus, subscribeToEvents, TRACKED_EVENTS_CATALOG, trackEvent } from '../utils/analytics';
import { getMixpanelStatus } from '../utils/mixpanel';
import { MIXPANEL_EVENTS_CATALOG } from '../utils/mixpanelConfig';

export default function AnalyticsSetup() {
  const { showToast } = useStore();
  const navigate = useNavigate();

  const [gaStatus, setGaStatus] = useState(getGAStatus());
  const [mixpanelStatus, setMixpanelStatus] = useState(getMixpanelStatus());
  const [eventsLog, setEventsLog] = useState(gaStatus.recentEvents);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedMixpanel, setCopiedMixpanel] = useState(false);
  const [filterEvent, setFilterEvent] = useState('all');

  useEffect(() => {
    // Subscribe to live events stream
    const unsubscribe = subscribeToEvents((newEvent, allEvents) => {
      setEventsLog([...allEvents]);
      setGaStatus(getGAStatus());
      setMixpanelStatus(getMixpanelStatus());
    });

    return () => unsubscribe();
  }, []);

  const handleCopyEnv = () => {
    navigator.clipboard.writeText('VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX');
    setCopiedKey(true);
    showToast('Copied env snippet to clipboard! 📋');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyMixpanelEnv = () => {
    navigator.clipboard.writeText('VITE_MIXPANEL_TOKEN=YOUR_MIXPANEL_TOKEN');
    setCopiedMixpanel(true);
    showToast('Copied Mixpanel env snippet to clipboard! 📋');
    setTimeout(() => setCopiedMixpanel(false), 2000);
  };

  const handleFireTestEvent = () => {
    trackEvent('ga_test_event', { source: 'analytics_setup_page' });
    showToast('Test event `ga_test_event` sent — check GA4 Realtime 🚀');
  };

  const handleFireMixpanelTestEvent = () => {
    trackEvent('mixpanel_test_event', { source: 'analytics_setup_page' });
    showToast(
      mixpanelStatus.isInitialized
        ? 'Mixpanel test event mapped as Feature Used — check Mixpanel Live View'
        : 'Mixpanel token is not configured, so the test stayed local'
    );
  };

  const statusView = {
    loaded: { ok: true, title: 'Connected & Actively Tracking', desc: 'gtag.js loaded — events are being delivered to your GA4 property' },
    loading: { ok: false, title: 'Connecting to Google…', desc: 'gtag.js is loading; events are queued until it finishes' },
    blocked: { ok: false, title: 'Blocked — Not Reaching GA4', desc: 'gtag.js failed to load (ad blocker / offline). Disable the blocker and reload.' },
    disabled: { ok: false, title: 'Awaiting Measurement ID', desc: 'No VITE_GA_MEASUREMENT_ID — events are only logged locally in this session' }
  }[gaStatus.scriptStatus] || { ok: false, title: 'Unknown', desc: '' };

  const filteredEvents = eventsLog.filter(e => {
    if (filterEvent !== 'all') return e.eventName === filterEvent;
    return true;
  });

  return (
    <div className="page" style={{ paddingTop: 16, paddingBottom: 80 }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ padding: 8, width: 40, height: 40, borderRadius: '50%', background: 'var(--glass)' }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 className="page-title" style={{ fontSize: '1.6rem', margin: 0, fontWeight: 900, letterSpacing: '-0.5px' }}>
                Google Analytics 4 (GA4) Admin
              </h1>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
                PRODUCT ANALYTICS
              </span>
            </div>
            <p className="page-subtitle" style={{ fontSize: '0.84rem', margin: '2px 0 0', color: 'var(--text-secondary)' }}>
              GA4 and Mixpanel configuration, tracked events catalog, and live session debugger
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleFireTestEvent} style={{ padding: '8px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Send size={15} /> Trigger GA4 Test Event
          </button>
          <button className="btn btn-secondary" onClick={handleFireMixpanelTestEvent} style={{ padding: '8px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Send size={15} /> Trigger Mixpanel Test Event
          </button>
        </div>
      </div>

      {/* ─── STATUS SUMMARY CARD ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        
        {/* Status Card */}
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 50, height: 50, borderRadius: '16px', background: statusView.ok ? 'rgba(16,185,129,0.18)' : 'rgba(251,191,36,0.18)', color: statusView.ok ? '#34d399' : '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {statusView.ok ? <CheckCircle2 size={28} /> : <AlertCircle size={28} />}
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
              Google Analytics Status
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: statusView.ok ? '#34d399' : '#fbbf24', marginTop: 2 }}>
              {statusView.title}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {statusView.desc}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
              User-ID: {gaStatus.userId || 'not signed in'} · DebugView: {gaStatus.debugMode ? 'on' : 'off (add ?ga_debug=1 to URL)'}
            </div>
          </div>
        </div>

        {/* Measurement ID Card */}
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 50, height: 50, borderRadius: '16px', background: 'rgba(56,189,248,0.18)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Activity size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
              VITE_GA_MEASUREMENT_ID
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', fontFamily: 'monospace', marginTop: 2 }}>
              {gaStatus.isConfigured ? gaStatus.maskedId : 'Not Configured in .env'}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Environment variable in client/.env
            </div>
          </div>
        </div>

        {/* Mixpanel Token Card */}
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 50, height: 50, borderRadius: '16px', background: mixpanelStatus.isInitialized ? 'rgba(16,185,129,0.18)' : 'rgba(251,191,36,0.18)', color: mixpanelStatus.isInitialized ? '#34d399' : '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {mixpanelStatus.isInitialized ? <CheckCircle2 size={28} /> : <AlertCircle size={28} />}
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
              Mixpanel Status
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: mixpanelStatus.isInitialized ? '#34d399' : '#fbbf24', marginTop: 2 }}>
              {mixpanelStatus.isInitialized ? 'Initialized' : mixpanelStatus.isConfigured ? 'Token present, not initialized' : 'Awaiting Project Token'}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              VITE_MIXPANEL_TOKEN: {mixpanelStatus.maskedToken}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Env: {mixpanelStatus.environment} · Shop ID: {mixpanelStatus.identifiedShopId || 'anonymous'}
            </div>
          </div>
        </div>

        {/* Live Session Events Count */}
        <div className="bento-card" style={{ padding: 22, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 50, height: 50, borderRadius: '16px', background: 'rgba(168,85,247,0.18)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Terminal size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
              Live Events Tracked (This Session)
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#c084fc', marginTop: 2 }}>
              {eventsLog.length} Events Fired
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Verified via real-time bus
            </div>
          </div>
        </div>

      </div>

      {/* ─── STEP BY STEP SETUP GUIDE ─── */}
      <div style={{ padding: 24, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Sparkles size={20} color="#fbbf24" />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0 }}>
            Google Analytics 4 Setup Instructions
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
          {[
            { step: 'Step 1', title: 'Create GA4 Property', desc: 'Open analytics.google.com and create a Google Analytics 4 property for your store.' },
            { step: 'Step 2', title: 'Add Web Data Stream', desc: 'Go to Admin → Data Streams → Add stream → Web. Enter your store domain / localhost.' },
            { step: 'Step 3', title: 'Copy Measurement ID', desc: 'Copy the stream ID in the format: G-XXXXXXXXXX' },
            { step: 'Step 4', title: 'Set in client/.env', desc: 'Add `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX` in client/.env' },
            { step: 'Step 5', title: 'Restart Application', desc: 'Restart `npm run dev` to load the environment variable into Vite.' }
          ].map((s, idx) => (
            <div key={idx} style={{ background: 'rgba(255,255,255,0.025)', padding: 14, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>{s.step}</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'white', marginTop: 4 }}>{s.title}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.35)', padding: '12px 18px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#38bdf8' }}>
            VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleCopyEnv} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {copiedKey ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
            {copiedKey ? 'Copied!' : 'Copy Key'}
          </button>
        </div>
      </div>

      {/* ─── MIXPANEL SETUP ─── */}
      <div style={{ padding: 24, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Sparkles size={20} color="#38bdf8" />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0 }}>
            Mixpanel Setup Instructions
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
          {[
            { step: 'Step 1', title: 'Open Mixpanel project settings', desc: 'In Mixpanel, open your project → Settings → Project Settings.' },
            { step: 'Step 2', title: 'Copy the Project Token', desc: 'Copy the Project Token. This is not the API Secret or Service Account secret.' },
            { step: 'Step 3', title: 'Set in client/.env', desc: 'Add `VITE_MIXPANEL_TOKEN=<token>` in client/.env. Restart Vite after saving.' },
            { step: 'Step 4', title: 'Set on Vercel', desc: 'Add the same variable in the Vercel project, then Redeploy. Vite inlines it at build time.' },
            { step: 'Step 5', title: 'Confirm Live View', desc: 'Use the app, then open Mixpanel → Live View. Events appear only after the token is configured.' }
          ].map((s, idx) => (
            <div key={idx} style={{ background: 'rgba(255,255,255,0.025)', padding: 14, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>{s.step}</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'white', marginTop: 4 }}>{s.title}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.35)', padding: '12px 18px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#38bdf8' }}>
            VITE_MIXPANEL_TOKEN=YOUR_MIXPANEL_TOKEN
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleCopyMixpanelEnv} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {copiedMixpanel ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
            {copiedMixpanel ? 'Copied!' : 'Copy Key'}
          </button>
        </div>
      </div>

      {/* ─── LIVE REAL-TIME EVENT DEBUGGER STREAM ─── */}
      <div style={{ padding: 24, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={20} color="#34d399" />
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0 }}>
                Live Real-Time GA4 Event Debugger
              </h2>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              Inspect live events fired during your interactions across screens in real-time
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="input"
              value={filterEvent}
              onChange={e => setFilterEvent(e.target.value)}
              style={{ padding: '6px 12px', fontSize: '0.82rem', background: '#0c0a1e', color: 'white', borderRadius: '10px' }}
            >
              <option value="all">All Events ({eventsLog.length})</option>
              {Array.from(new Set(eventsLog.map(e => e.eventName))).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            No events tracked yet. Click around the app or hit 'Trigger Test Event' above to watch live events flow in!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {filteredEvents.map((ev, idx) => (
              <div
                key={ev.id || idx}
                style={{
                  padding: '12px 16px', background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: '0.82rem', gap: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: ev.isSentToGA ? '#10b981' : '#38bdf8', boxShadow: `0 0 8px ${ev.isSentToGA ? '#10b981' : '#38bdf8'}` }} />
                  <span style={{ fontWeight: 800, color: 'white', fontFamily: 'monospace', fontSize: '0.88rem' }}>
                    {ev.eventName}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(ev.params)}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', background: ev.isSentToGA ? 'rgba(16,185,129,0.15)' : 'rgba(56,189,248,0.15)', color: ev.isSentToGA ? '#34d399' : '#38bdf8', fontWeight: 700 }}>
                    {ev.isSentToGA ? 'Sent to GA4' : ev.pending ? 'Queued' : 'Local only (not sent)'}
                  </span>
                  {ev.mixpanelEvents?.length > 0 && (
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', background: ev.isSentToMixpanel ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.15)', color: ev.isSentToMixpanel ? '#34d399' : '#fbbf24', fontWeight: 700 }}>
                      Mixpanel: {ev.mixpanelEvents.join(', ')}
                    </span>
                  )}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── TRACKED EVENTS CATALOG ─── */}
      <div style={{ padding: 24, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Layers size={20} color="#a855f7" />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0 }}>
            Configured Tracked Events Catalog ({TRACKED_EVENTS_CATALOG.length} Events)
          </h2>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
          These events are safely captured and transmitted without sensitive customer PII:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {TRACKED_EVENTS_CATALOG.map((item, idx) => (
            <div key={idx} style={{ padding: 14, background: 'rgba(255,255,255,0.025)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {item.name}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                {item.desc}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {item.params.map((p, pIdx) => (
                  <span key={pIdx} style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 24, background: 'var(--card-bg)', borderRadius: '20px', border: '1px solid var(--border-color)', marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Layers size={20} color="#38bdf8" />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: 0 }}>
            Mixpanel Events Catalog ({MIXPANEL_EVENTS_CATALOG.length} Events)
          </h2>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
          These Mixpanel event names are mapped from existing GA/internal events. Customer names, phones, UPI IDs, and credentials are never sent.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {MIXPANEL_EVENTS_CATALOG.map((item, idx) => (
            <div key={idx} style={{ padding: 14, background: 'rgba(255,255,255,0.025)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {item.name}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                {item.desc}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {item.params.map((p, pIdx) => (
                  <span key={pIdx} style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
