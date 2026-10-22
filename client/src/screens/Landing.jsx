import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleStart = () => {
    navigate('/onboarding');
  };

  return (
    <main className="landing-page">
      {/* ===== HERO BACKGROUND ===== */}
      <div className="landing-hero-bg" />
      
      {/* ===== ADVANCED OVERLAY ===== */}
      <div className="landing-overlay-1" />
      <div className="landing-overlay-2" />
      <div className="landing-overlay-3" />
      
      {/* ===== CONTENT ===== */}
      <div className="landing-content">
        
        {/* NAVBAR */}
        <nav className="landing-nav">
          <div className="landing-logo-group">
            <div className="landing-logo-icon">अ</div>
            <span className="landing-logo-text">ANTARYA</span>
          </div>
          <button className="landing-nav-btn" onClick={handleStart}>
            Connect Your Shop →
          </button>
        </nav>

        {/* HERO BODY */}
        <div className="landing-hero-body">
          
          {/* BADGE */}
          <div className="landing-badge">
            <span className="landing-badge-dot-container">
              <span className="landing-badge-dot-ping"></span>
              <span className="landing-badge-dot"></span>
            </span>
            <span className="landing-badge-text">
              Built for 63 Lakh+ Indian Shops
            </span>
          </div>

          {/* MAIN HEADLINE */}
          <h1 className="landing-headline">
            Run Your Store <br />
            <span className="landing-headline-gradient">
              From Your Phone
            </span>
          </h1>

          {/* SUBTITLE */}
          <div className="landing-subtitle-box">
            <p className="landing-subtitle-text">
              <span className="text-emerald-400">Antarya</span> is the 
              <span className="text-white-bold"> autonomous, self-learning digital brain </span>
              for your shop. Powered by a Two-Stage Hurdle Model (`Evening Demand Surge`), a CatBoost Excel Inventory Planner, and What-If Price Elasticity simulation.
            </p>
          </div>

          {/* CTA BUTTONS */}
          <div className="landing-cta-group">
            <button className="landing-btn-primary group" onClick={handleStart}>
              <span>🚀 Start For Free</span>
              <div className="landing-btn-primary-shimmer" />
            </button>
            
            <button className="landing-btn-secondary" onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}>
              <span>▶</span> Quick Tour
            </button>
          </div>

          {/* TRUST BADGES */}
          <div className="landing-trust-badges">
            <div className="landing-trust-item">
              <div className="landing-trust-value">₹0</div>
              <div className="landing-trust-label">Cost</div>
            </div>
            <div className="landing-trust-divider" />
            <div className="landing-trust-item">
              <div className="landing-trust-value">2 Min</div>
              <div className="landing-trust-label">Setup</div>
            </div>
            <div className="landing-trust-divider" />
            <div className="landing-trust-item">
              <div className="landing-trust-value">100%</div>
              <div className="landing-trust-label">Made in India</div>
            </div>
          </div>
        </div>

        {/* SCROLL INDICATOR */}
        <div className="landing-scroll-indicator">
          <div className="landing-scroll-mouse">
            <div className="landing-scroll-wheel" />
          </div>
        </div>
      </div>

      {/* ===== FEATURES SECTION ===== */}
      <section className="landing-features-section">
        <div className="landing-features-container">
          
          <div className="landing-features-header">
            <h2>
              Autonomous & <span className="text-emerald-400">Self-Learning AI</span>
            </h2>
            <p>Predicting demand peaks, preventing stockouts, and maximizing working capital effortlessly.</p>
          </div>

          <div className="landing-features-grid">
            {/* CARD 1 */}
            <div className="landing-feature-card">
              <div className="landing-feature-icon">🧠</div>
              <h3>Self-Learning AI Engine</h3>
              <p>
                Continuously learns from every customer bill (`recordSale`) and scanned supplier invoice (`extractBill`), automatically adapting prediction accuracy to your exact neighborhood trends.
              </p>
            </div>

            {/* CARD 2 */}
            <div className="landing-feature-card">
              <div className="landing-feature-icon">✨</div>
              <h3>Predictive Hurdle Model</h3>
              <p>
                Our Two-Stage Hurdle Model actively forecasts customer footfall (`Probability of Sale`) and evening demand surges (`Evening Demand Surge`) hours before stock runs out!
              </p>
            </div>

            {/* CARD 3 */}
            <div className="landing-feature-card">
              <div className="landing-feature-icon">📑</div>
              <h3>Excel Inventory Planner & Bill OCR</h3>
              <p>
                Upload as many sales Excel sheets as you like for each market. A CatBoost model tells you what to stock and how much, and supplier bill photos restock inventory in seconds.
              </p>
            </div>

            {/* CARD 4 */}
            <div className="landing-feature-card">
              <div className="landing-feature-icon">📈</div>
              <h3>Price Elasticity Studio</h3>
              <p>
                Simulate exact profit multipliers ("If I drop Atta by ₹3, sales jump +18%") backed by interactive, real-time SHAP factor diagnostic explanations.
              </p>
            </div>

            {/* CARD 5 */}
            <div className="landing-feature-card">
              <div className="landing-feature-icon">💬</div>
              <h3>1-Tap WhatsApp Restocking</h3>
              <p>
                Never lose sales to stockouts. When AI alerts low stock, order instantly via WhatsApp directly from regional wholesale distributors and ONDC nodes.
              </p>
            </div>

            {/* CARD 6 */}
            <div className="landing-feature-card">
              <div className="landing-feature-icon">💳</div>
              <h3>Smart Credit Recovery</h3>
              <p>
                Track aging customer credit (`Customer Credit`) effortlessly. Send automated, polite WhatsApp reminders with 1-click UPI Autopay links to recover bad debts faster.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="landing-final-cta">
        <h2>
          Your Shop, <br />
          <span className="text-emerald-400">Make It Smart</span>
        </h2>
        <p>
          Join the smart shopkeepers who use modern technology to grow their business effortlessly.
        </p>
        <button className="landing-btn-final" onClick={handleStart}>
          Get Started Now — It's Free
        </button>
      </section>
    </main>
  );
}
