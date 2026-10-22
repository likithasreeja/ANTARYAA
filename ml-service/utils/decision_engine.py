"""
ANTARYA ML Service — Decision Engine
======================================
🧠 CONCEPT: What is the Decision Engine?

The ML model says: "Milk demand = 28 units tomorrow"
But the kirana owner doesn't care about "28 units."

He cares about: "SHOULD I ORDER MORE MILK?"

The Decision Engine takes raw ML predictions and applies 
BUSINESS RULES to generate ACTIONABLE RECOMMENDATIONS.

Pipeline:
  ML Prediction (28 units) 
    + Current Stock (18 units)
    + Lead Time (2 days)
    + Safety Stock (5 units)
    ↓
  Decision Engine
    ↓
  "⚠️ URGENT: Order 25 units of Milk TODAY. 
   Stockout expected Friday 6 PM."

NO AI GUESSING. Every rule is deterministic and transparent.
"""

from datetime import datetime, timedelta


def calculate_stockout(current_stock, daily_forecasts):
    """
    📦 STOCKOUT PREDICTION
    
    Given current stock and predicted daily demand,
    calculate EXACTLY when the product will run out.
    
    Example:
      Stock = 45 units
      Forecast = [28, 22, 35, 26]  (next 4 days)
      
      Day 1: 45 - 28 = 17 remaining
      Day 2: 17 - 22 = -5 → STOCKOUT on Day 2!
      
    Returns: {
      'days_until_stockout': 2,
      'stockout_date': '2026-07-11',
      'risk_level': 'HIGH'
    }
    """
    if not daily_forecasts or current_stock <= 0:
        return {
            'days_until_stockout': 0,
            'stockout_date': datetime.now().strftime('%Y-%m-%d'),
            'risk_level': 'CRITICAL',
            'remaining_after_forecast': 0
        }
    
    remaining = current_stock
    for i, demand in enumerate(daily_forecasts):
        remaining -= max(demand, 0)
        if remaining <= 0:
            stockout_date = datetime.now() + timedelta(days=i+1)
            return {
                'days_until_stockout': i + 1,
                'stockout_date': stockout_date.strftime('%Y-%m-%d'),
                'risk_level': _risk_level(i + 1),
                'remaining_after_forecast': 0
            }
    
    return {
        'days_until_stockout': None,  # Won't stock out in forecast period
        'stockout_date': None,
        'risk_level': 'SAFE',
        'remaining_after_forecast': round(remaining, 1)
    }


def calculate_reorder(daily_forecasts, current_stock, lead_time_days=2, safety_stock=5):
    """
    🚚 SMART REORDER
    
    Formula:
      Reorder Point = Safety Stock + (Lead Time × Average Daily Demand)
      Order Quantity = (Lead Time + Review Period) × Avg Daily Demand - Current Stock + Safety Stock
    
    Example:
      Avg demand = 28/day, Lead time = 2 days, Safety stock = 5
      Reorder Point = 5 + (2 × 28) = 61
      Current Stock = 18 → Below reorder point!
      Order Qty = (2 + 7) × 28 - 18 + 5 = 239... 
      → We cap it: order enough for lead_time + 7 days buffer
    """
    if not daily_forecasts:
        return {'should_reorder': False, 'reason': 'No forecast available'}
    
    avg_daily_demand = sum(daily_forecasts) / len(daily_forecasts)
    
    reorder_point = safety_stock + (lead_time_days * avg_daily_demand)
    
    should_reorder = current_stock <= reorder_point
    
    # Order enough for lead_time + 7 days, minus current stock, plus safety
    order_qty = max(0, round(
        (lead_time_days + 7) * avg_daily_demand - current_stock + safety_stock
    ))
    
    return {
        'should_reorder': should_reorder,
        'order_quantity': order_qty,
        'reorder_point': round(reorder_point, 1),
        'avg_daily_demand': round(avg_daily_demand, 1),
        'reason': (
            f"Stock ({current_stock}) is below reorder point ({round(reorder_point, 1)})"
            if should_reorder
            else f"Stock ({current_stock}) is above reorder point ({round(reorder_point, 1)})"
        ),
        'urgency': 'HIGH' if current_stock < safety_stock else ('MEDIUM' if should_reorder else 'LOW')
    }


def detect_slow_moving(daily_forecasts, trend_14d, rolling_mean_7d, rolling_mean_30d):
    """
    🧊 SLOW MOVING INVENTORY DETECTION
    
    Instead of "Dead Stock Prediction" (which needs labels we don't have),
    we detect SLOW MOVING inventory using signals we DO have:
    
    1. Declining trend (negative slope over 14 days)
    2. Recent avg much lower than monthly avg (demand dropping)
    3. Very low forecast values
    
    Returns a risk score (0-100) and reason.
    """
    risk_score = 0
    reasons = []
    
    # Signal 1: Negative trend
    if trend_14d is not None and trend_14d < -0.5:
        risk_score += 30
        reasons.append(f"Demand declining (trend: {round(trend_14d, 2)}/day)")
    
    # Signal 2: Recent avg < Monthly avg (demand shrinking)
    if rolling_mean_7d is not None and rolling_mean_30d is not None and rolling_mean_30d > 0:
        ratio = rolling_mean_7d / rolling_mean_30d
        if ratio < 0.5:
            risk_score += 30
            reasons.append(f"Recent sales are {round((1-ratio)*100)}% below monthly average")
        elif ratio < 0.7:
            risk_score += 15
            reasons.append(f"Recent sales are {round((1-ratio)*100)}% below monthly average")
    
    # Signal 3: Very low forecasted demand
    if daily_forecasts:
        avg_forecast = sum(daily_forecasts) / len(daily_forecasts)
        if avg_forecast < 1:
            risk_score += 40
            reasons.append(f"Forecasted demand is near zero ({round(avg_forecast, 1)}/day)")
        elif avg_forecast < 3:
            risk_score += 20
            reasons.append(f"Forecasted demand is very low ({round(avg_forecast, 1)}/day)")
    
    risk_score = min(risk_score, 100)
    
    return {
        'risk_score': risk_score,
        'risk_level': 'HIGH' if risk_score >= 60 else ('MEDIUM' if risk_score >= 30 else 'LOW'),
        'reasons': reasons if reasons else ['No slow-moving signals detected'],
        'recommendation': (
            'Consider clearance sale or bundle offers' if risk_score >= 60
            else 'Monitor closely' if risk_score >= 30
            else 'Healthy demand'
        )
    }


def generate_actions(predictions_with_inventory):
    """
    👔 CEO BRIEF ACTIONS
    
    Takes all predictions and generates a prioritized action list.
    This is what the CEO Brief shows to the shop owner.
    
    Input: List of product predictions, each with:
      - product_name, forecast, stockout_info, reorder_info, slow_moving_info
    
    Output: Sorted list of actions (CRITICAL first, then HIGH, MEDIUM, LOW)
    """
    actions = []
    
    for item in predictions_with_inventory:
        name = item.get('product_name', 'Unknown')
        
        # Action 1: Stockout alert
        stockout = item.get('stockout', {})
        if stockout.get('risk_level') in ['CRITICAL', 'HIGH']:
            days = stockout.get('days_until_stockout', '?')
            actions.append({
                'priority': 'CRITICAL' if stockout['risk_level'] == 'CRITICAL' else 'HIGH',
                'action': f"Order {name}",
                'reason': f"Stockout in {days} day(s)",
                'product': name,
                'type': 'reorder'
            })
        
        # Action 2: Reorder recommendation
        reorder = item.get('reorder', {})
        if reorder.get('should_reorder') and stockout.get('risk_level') not in ['CRITICAL', 'HIGH']:
            actions.append({
                'priority': reorder.get('urgency', 'MEDIUM'),
                'action': f"Reorder {reorder.get('order_quantity', '?')} units of {name}",
                'reason': reorder.get('reason', ''),
                'product': name,
                'type': 'reorder'
            })
        
        # Action 3: Slow moving alert
        slow = item.get('slow_moving', {})
        if slow.get('risk_level') in ['HIGH', 'MEDIUM']:
            actions.append({
                'priority': 'MEDIUM',
                'action': f"Review {name} — {slow.get('recommendation', '')}",
                'reason': '; '.join(slow.get('reasons', [])),
                'product': name,
                'type': 'slow_moving'
            })
    
    # Sort by priority: CRITICAL > HIGH > MEDIUM > LOW
    priority_order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
    actions.sort(key=lambda a: priority_order.get(a['priority'], 4))
    
    return actions


def _risk_level(days_until_stockout):
    """Map days until stockout to a risk level."""
    if days_until_stockout <= 1:
        return 'CRITICAL'
    elif days_until_stockout <= 3:
        return 'HIGH'
    elif days_until_stockout <= 7:
        return 'MEDIUM'
    return 'LOW'
