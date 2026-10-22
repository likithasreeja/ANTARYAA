# 📊 ANTARYA Demand Forecasting Model
## Enterprise Model Card

*A Model Card provides transparency into how an AI model was trained, what data it uses, its performance metrics, and its intended use cases. This is a standard practice in production ML systems.*

---

### 1. Model Details
- **Model Type:** LightGBM (Gradient Boosting Decision Tree) Regressor
- **Architecture:** `lgb.train()` with early stopping and Optuna hyperparameter optimization.
- **Task:** Time-series demand forecasting (1 to 7-day horizon).
- **Version:** 1.0.0 (Hackathon Prototype)
- **Developers:** ANTARYA Team

### 2. Intended Use
- **Primary Use Case:** Predicting daily unit sales for MSME Kirana stores in India.
- **Downstream Actions:** Driving automated stockout alerts, smart reorder quantities, and slow-moving inventory detection in the ANTARYA Decision Engine.
- **Out of Scope:** Predicting price elasticity, workforce optimization, or credit risk default.

### 3. Training Data
- **Dataset:** [Corporación Favorita Grocery Sales Forecasting](https://www.kaggle.com/c/favorita-grocery-sales-forecasting)
- **Source:** Kaggle (Real grocery retailer in Ecuador).
- **Justification:** High-fidelity, daily, item-level POS data that closely mimics the transaction patterns of Indian kirana stores (weekends, holidays, promotions).
- **Preprocessing:** 
  - Filtered to Store 44 (high completeness).
  - Filtered to Kirana-relevant product families (DAIRY, GROCERY, BEVERAGES, etc.).
  - Chronologically sorted; zero-filled missing days.

### 4. Feature Engineering
The model learns from **18 engineered features**:
- **Temporal (6):** `day_of_week`, `day_of_month`, `month`, `is_weekend`, `is_month_start`, `is_month_end`
- **Autoregressive (4):** `lag_1`, `lag_7`, `lag_14`, `lag_28` (Past sales performance)
- **Rolling Statistics (3):** `rolling_mean_7d`, `rolling_mean_30d`, `rolling_std_7d` (Momentum and volatility)
- **Trend (1):** `trend_14d` (Linear slope of recent demand)
- **Events (2):** `is_holiday`, `onpromotion`
- **Metadata (2):** `family_code`, `price`

### 5. Evaluation Metrics
- **Validation Strategy:** Temporal Train/Test split (Training on past data, Testing on the most recent 30 days). We do *not* use random cross-validation to prevent data leakage from the future.
- **Primary Metric (MAPE):** Mean Absolute Percentage Error (custom capped for zeroes).
- **Secondary Metrics:** MAE (Mean Absolute Error), RMSE (Root Mean Squared Error).
*(See `model_metrics.json` for live training results).*

### 6. Explainability & Trust
- **Method:** Tree SHAP (SHapley Additive exPlanations).
- **Implementation:** Every prediction sent to the frontend can be explained via the `/explain` endpoint, breaking down the exact contribution of each feature (e.g., "Sunday added +5 units, Holiday added +3 units").
- **Prediction Intervals:** The model outputs honest expected error bounds based on historical MAPE, rather than arbitrary confidence percentages.

### 7. Known Limitations & Production Roadmap
- **Current Limitation:** The model is trained on Ecuador grocery data. While patterns (weekends, holidays) transfer reasonably well, specific cultural trends (e.g., Diwali demand spikes) are absent.
- **Production Solution:** The ANTARYA architecture includes a **Scheduled Model Retraining Pipeline**. Once deployed to a kirana store, the system will collect real POS data via the Express API and periodically fine-tune this base model on the store's specific transaction history, creating a bespoke, hyper-accurate model for that specific shop.
