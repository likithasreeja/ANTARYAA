// In production, VITE_API_URL points to backend. In dev, Vite proxy handles /api.
const API_URL = import.meta.env.VITE_API_URL || '/api';

function getHeaders() {
  const token = localStorage.getItem('antarya_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handleResponse(res) {
  let data;
  try {
    data = await res.json();
  } catch (err) {
    data = {};
  }
  if (!res.ok) {
    const error = new Error(data.error || `Server error (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// Resilient fetch wrapper with timeout and automatic retry on network disconnects
async function fetchWithRetry(url, options = {}, retries = 2, timeoutMs = 20000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return await handleResponse(res);
    } catch (err) {
      clearTimeout(id);
      const isAbort = err.name === 'AbortError';
      const isNetworkError = err.name === 'TypeError' || err.message.includes('Failed to fetch');

      if ((isAbort || isNetworkError) && attempt < retries && (!options.method || options.method === 'GET')) {
        await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
        continue;
      }

      if (isAbort) {
        throw new Error('Request timed out. Please check your network connection.');
      }
      if (isNetworkError) {
        throw new Error('Network error. Could not connect to Antarya server.');
      }
      throw err;
    }
  }
}

const api = {
  get: (path) => fetchWithRetry(API_URL + path, { method: 'GET', headers: getHeaders() }),

  post: (path, body) => fetchWithRetry(API_URL + path, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  }, 1, 30000),

  put: (path, body) => fetchWithRetry(API_URL + path, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body)
  }, 1),

  delete: (path) => fetchWithRetry(API_URL + path, {
    method: 'DELETE',
    headers: getHeaders()
  }, 1),

  // Auth shortcuts
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  completeSetup: () => api.put('/auth/setup-complete', {}),

  // Products
  getProducts: () => api.get('/products'),
  addProduct: (data) => api.post('/products', data),
  addProductsBulk: (products) => api.post('/products/bulk', { products }),
  updateProduct: (id, data) => api.put(`/products/${id}`, data),
  addStock: (id, data) => api.put(`/products/${id}/add-stock`, data),
  deleteProduct: (id) => api.delete(`/products/${id}`),
  seedDemoProducts: () => api.post('/products/seed-demo', {}),

  // Sales
  recordSale: (data) => api.post('/sales', data),
  getSales: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/sales${query ? '?' + query : ''}`);
  },
  getTodaySales: () => api.get('/sales/today'),
  getSalesSummary: () => api.get('/sales/summary'),

  // Customers & Customer Analytics
  getCustomers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/customers${query ? '?' + query : ''}`);
  },
  getCustomerAnalytics: () => api.get('/customers/analytics'),
  getCustomerDetails: (id) => api.get(`/customers/${id}/details`),
  seedDemoCustomers: () => api.post('/customers/seed-demo', {}),
  seed30DemoCustomers: () => api.post('/customers/seed-30-demo', {}),
  addCustomer: (data) => api.post('/customers', data),
  updateCustomer: (id, data) => api.put(`/customers/${id}`, data),
  payCredit: (id, amount) => api.put(`/customers/${id}/pay-credit`, { amount }),
  deleteCustomer: (id) => api.delete(`/customers/${id}`),

  // Payments & UPI QR Gateway Tracking
  getPayments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/payments${query ? '?' + query : ''}`);
  },
  getPaymentSummary: () => api.get('/payments/summary'),
  getPayment: (id) => api.get(`/payments/${id}`),
  getProviderStatus: () => api.get('/payments/provider-status'),
  createPayment: (data) => api.post('/payments', data),
  syncPaymentGateway: (id) => api.post(`/payments/${id}/sync-gateway`, {}),
  updatePaymentStatus: (id, data) => api.put(`/payments/${id}/status`, data),
  triggerPaymentWebhook: (data) => api.post('/payments/webhook', data),
  testPaymentWebhook: (data) => api.post('/payments/webhook/test-event', data),

  // Dashboard & Product Analytics
  getDashboard: () => api.get('/dashboard'),
  getProductAnalytics: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/dashboard/product-analytics${query ? '?' + query : ''}`);
  },
  seedDemoBusiness: () => api.post('/dashboard/seed-demo-business', {}),
  clearDemoData: (clearAll = false) => api.delete(`/dashboard/clear-demo-data?clearAll=${clearAll}`),
  getSuggestions: () => api.get('/dashboard/suggestions'),
  addExpense: (data) => api.post('/dashboard/expense', data),
  getExpenses: () => api.get('/dashboard/expenses'),
  deleteExpense: (id) => api.delete(`/dashboard/expense/${id}`),

  // Complaints
  getComplaints: () => api.get('/complaints'),
  addComplaint: (data) => api.post('/complaints', data),
  resolveComplaint: (id, reply) => api.put(`/complaints/${id}/resolve`, { reply }),
  deleteComplaint: (id) => api.delete(`/complaints/${id}`),

  // AI (Gemini + Bhashini)
  askAdvisor: (advisorType, message) => api.post('/ai/advisor', { advisorType, message }),
  aiChat: (message, history) => api.post('/ai/chat', { message, history }),
  scanBill: (imageBase64) => api.post('/ai/scan-bill', { imageBase64 }),
  extractBill: (imageBase64) => api.post('/ai/extract-bill', { imageBase64 }),
  translate: (text, sourceLang, targetLang) => api.post('/ai/translate', { text, sourceLang, targetLang }),
  getAIStatus: () => api.get('/ai/status'),

  // ML Service & Two-Stage Hurdle Predictions
  getMLHealth: () => api.get('/ml/health'),
  getMLMetrics: () => api.get('/ml/metrics'),
  getCEOBrief: () => api.post('/ml/ceo-brief', {}),
  getTwoStageForecast: (productName, currentStock) => api.post('/ml/two-stage-forecast', { productName, currentStock }),
  predictDemand: (productName, currentStock) => api.post('/ml/predict', { product_name: productName, current_stock: currentStock }),
  explainPrediction: (productName) => api.post('/ml/explain', { product_name: productName }),

  // Learning Engine
  getLearningStats: () => api.get('/learning/stats'),
  getLearningEvolution: () => api.get('/learning/evolution'),
  getAccuracyTrend: () => api.get('/learning/accuracy-trend'),
  getPredictionHistory: () => api.get('/learning/history'),
  retrainModelDemo: () => api.post('/learning/retrain-demo', {}),
  logActualSales: (data) => api.post('/learning/log-actual', data),

  // Excel Inventory Planner (CatBoost)
  previewInventorySheet: (fileName, fileBase64) => fetchWithRetry(API_URL + '/inventory/preview', {
    method: 'POST', headers: getHeaders(), body: JSON.stringify({ fileName, fileBase64 })
  }, 0, 90000),
  uploadInventorySheet: (data) => fetchWithRetry(API_URL + '/inventory/uploads', {
    method: 'POST', headers: getHeaders(), body: JSON.stringify(data)
  }, 0, 90000),
  getInventoryMarkets: () => api.get('/inventory/markets'),
  getInventoryUploads: (market) => api.get(`/inventory/uploads?market=${encodeURIComponent(market)}`),
  deleteInventoryUpload: (id) => api.delete(`/inventory/uploads/${id}`),
  getInventoryPlan: (data) => fetchWithRetry(API_URL + '/inventory/plan', {
    method: 'POST', headers: getHeaders(), body: JSON.stringify(data)
  }, 0, 200000),
  getInventoryOverview: (market) => api.get(`/inventory/overview${market ? `?market=${encodeURIComponent(market)}` : ''}`),

  // Monthly subscription (Razorpay)
  getSubscription: () => api.get('/subscription'),
  createSubscriptionCheckout: (period) => api.post('/subscription/checkout', period ? { period } : {}),
  verifySubscriptionPayment: (data) => api.post('/subscription/verify', data),
  syncSubscriptionOrder: (orderId) => api.post(`/subscription/orders/${encodeURIComponent(orderId)}/sync`, {}),
  createSubscriptionUpi: (period) => api.post('/subscription/upi', period ? { period } : {}),
  submitSubscriptionUtr: (id, utr) => api.post(`/subscription/upi/${encodeURIComponent(id)}/reference`, { utr })
};

// Platform admin (developer) API: its own token key so the shop session in antarya_token is never touched.
export const ADMIN_TOKEN_KEY = 'antarya_admin_token';

function adminHeaders() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const adminGet = (path) => fetchWithRetry(API_URL + path, { method: 'GET', headers: adminHeaders() });
const adminPost = (path, body) => fetchWithRetry(API_URL + path, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(body) }, 0);

export const adminApi = {
  login: (username, password) => adminPost('/admin/login', { username, password }),
  getOverview: () => adminGet('/admin/overview'),
  getShops: () => adminGet('/admin/shops'),
  getSubscriptionPayments: (status) => adminGet(`/admin/subscription-payments${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  verifySubscriptionPayment: (id, data) => adminPost(`/admin/subscription-payments/${encodeURIComponent(id)}/verify`, data),
  rejectSubscriptionPayment: (id, reason) => adminPost(`/admin/subscription-payments/${encodeURIComponent(id)}/reject`, { reason })
};

export default api;
