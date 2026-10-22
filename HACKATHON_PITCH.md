# 🏆 ANTARYA: Hackathon Pitch & Presentation Guide

This document contains everything needed to pitch, demonstrate, and defend ANTARYA in front of hackathon judges and investors.

---

## ⏱️ 1-Minute Elevator Pitch

"Traditional software stores transactions. **ANTARYA stores knowledge.** We are building the first **Self-Learning Predictive Decision Platform for Indian Kirana stores and MSMEs**. 

Most shop owners rely on gut feeling for inventory, leading to massive stockouts or dead inventory. ANTARYA solves this using our proprietary **Two-Stage Hurdle Model**—an AI that understands the chaotic, intermittent nature of Indian retail. But here is the magic: our AI solves the cold-start problem on Day 1 using a global foundation model trained on 395,000 real retail days, and then **continuously learns from every single sale in the shop**. Over 90 days, it evolves from a global brain into a hyper-personalized, store-specific intelligence engine. ANTARYA doesn't just give you a dashboard; it gives every Kirana owner an AI-powered CEO."

---

## 🎬 3-Minute Demo Script (The Hero Flow)

1. **The Setup (0:00 - 0:30):**
   * "Welcome to Dukan Ka Dimaag. Imagine you are a Kirana owner in Pune. It's 7 AM."
   * *Open the Decision Center.*
   * "Instead of checking shelves manually, the AI has already run millions of calculations overnight."

2. **The Predictive Power (0:30 - 1:30):**
   * *Point to Urgent Reorders.*
   * "Our Two-Stage CatBoost model predicts exactly what will stock out today. Notice it tells us to order exactly 5 cartons of Aashirvaad Atta. This isn't a guess—it's based on the upcoming salary cycle, local weather, and 7-day momentum."
   * *Show AI Reliability Panel.* "And we prove our accuracy. The model operates at 71.2% daily accuracy with less than 1 unit of error."

3. **The Learning Engine (1:30 - 2:30):**
   * *Navigate to ANTARYA Learning Engine.*
   * "Here is where ANTARYA becomes a unicorn product. Every time you log a sale, the AI logs it as training data. You can see the exact predictions compared to actual sales."
   * *Click 'Retrain Model'.*
   * "Watch this. The AI detects demand drift, extracts new features from recent sales, and fine-tunes a local model just for this specific shop. By Day 90, this AI is 90% customized to the specific customers of this exact neighborhood."

4. **The Close (2:30 - 3:00):**
   * "We eliminated 88% of false-positive AI noise using our hurdle architecture. We are ready to deploy to the 12 million Kirana stores in India today."

---

## 🧠 Judge FAQ (Defensibility)

### Q1: Why did you use a Two-Stage Hurdle Model instead of ARIMA or basic XGBoost?
**Answer:** "Indian Kirana demand is highly intermittent—items like shampoo or spices might not sell for 3 days, and then sell 4 units on the 4th day. A standard model (like XGBoost) predicts fractional noise every day (e.g., 0.15 units), annoying the shopkeeper. Our Two-Stage Hurdle first acts as a classifier (will it sell today: yes/no?). If no, it predicts zero. If yes, the regressor predicts the volume. This architecture reduced false alarms on zero-demand days by 88.3%."

### Q2: How do you solve the Cold-Start problem for a new shop?
**Answer:** "Day 1 is powered by our Foundation Model (v7). We trained it on a massive dataset of 395,000 retail days across multiple states. We mapped products into a universal 'Kirana Taxonomy'. So when a new shop adds 'Parle-G', the Foundation Model instantly knows its base velocity and seasonality before a single sale is even made."

### Q3: What happens when the shop's behavior drifts from your Foundation Model?
**Answer:** "That's exactly why we built the ANTARYA Learning Engine. Every night, the system tracks Prediction Error (Predicted vs. Actual). By Day 30, the system automatically blends the global foundation model with a local store-specific model. By Month 4, the shop runs almost entirely on its own personalized intelligence."

### Q4: Are the confidence scores and accuracy numbers real?
**Answer:** "Yes. The 71.27% WMAPE is derived from a strict 5-fold TimeSeriesSplit backtest on 15,500 hold-out days. The Prediction Intervals (e.g., [4 - 6] units) are calculated using the model's historical Mean Absolute Error (MAE) applied to the point forecast."

---

## 💼 Investor FAQ (Startup Readiness)

### Q1: Is this just a dashboard wrapper around an API?
**Answer:** "Absolutely not. We host our own CatBoost machine learning microservice in Python (FastAPI), completely decoupled from our Node.js transactional backend. This is enterprise-grade microservice architecture, allowing us to scale the ML compute independently of the web traffic."

### Q2: What is your moat? Why can't a competitor copy this?
**Answer:** "Data gravity. Our moat is the continuous learning loop. A competitor can copy our UI tomorrow, but they cannot copy a model that has spent 6 months fine-tuning its weights to the exact purchase behavior of a specific neighborhood. The longer a store uses ANTARYA, the smarter it gets, creating absolute vendor lock-in."

### Q3: Why is this 'Predictive Analytics' and not just reporting?
**Answer:** "Reporting tells you what happened yesterday. We tell you what will happen tomorrow. We simulate salary cycles, inject weather forecasts, map Indian festivals, and output exact whole-integer carton orders for the distributor visit."

---

## 🏗️ Technical Architecture 

1. **Frontend:** React + Vite (PWA ready for mobile Kirana owners).
2. **Transactional Backend:** Node.js + Express (Handles Auth, Inventory, Billing).
3. **Database:** MongoDB (Stores schemas for Products, Sales, Prediction Logs).
4. **Predictive Engine:** Python + FastAPI (Hosts the pre-trained `indian_v7_hurdle_model.pkl`).
5. **Learning Engine:** Tracks predicted vs. actuals, detects drift, and handles store-specific fine-tuning.

---

## 🚀 Production Roadmap (Post-Hackathon)
1. **Automated Nightly Retraining Jobs:** Move the demo retraining button to a distributed Celery/Redis worker queue.
2. **WhatsApp Bot Integration:** Push morning CEO Briefs directly to the shop owner's WhatsApp.
3. **Multi-Tenant Feature Store:** Deploy Hopsworks to serve real-time rolling features at scale.
