const mongoose = require('mongoose');
const net = require('net');

function getMongoUri() {
  return (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
}

function isUsableMongoUri(uri) {
  if (!uri) return false;
  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) return false;
  if (/<[^>]+>/.test(uri)) return false;
  return true;
}

function getMongoDbName(uri) {
  const fromEnv = (process.env.MONGODB_DB || '').trim();
  try {
    const parsed = new URL(uri);
    const fromUri = decodeURIComponent(parsed.pathname.replace(/^\//, '')).split('/')[0].trim();
    if (fromUri) return fromUri;
  } catch {
    // Never log the URI. Fall through to the default database name.
  }
  return fromEnv || 'antarya';
}

function getMongoConnectOptions(uri) {
  return {
    family: 4,
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000,
    dbName: getMongoDbName(uri)
  };
}

function safeMongoError(err) {
  return String(err && err.message ? err.message : err)
    .replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, 'mongodb://***')
    .replace(/:[^:@/\s]+@/g, ':***@');
}

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function getDbStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    connected: isDbConnected(),
    state: states[mongoose.connection.readyState] || 'unknown',
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

const connectDB = async () => {
  const mongoUri = getMongoUri();
  const isProduction = process.env.NODE_ENV === 'production';

  console.log('--- Startup Diagnostics ---');
  console.log('MONGODB_URI exists:', Boolean(process.env.MONGODB_URI));
  console.log('MONGO_URI exists:', Boolean(process.env.MONGO_URI));
  console.log('GEMINI_API_KEY exists:', Boolean(process.env.GEMINI_API_KEY));
  console.log('JWT_SECRET exists:', Boolean(process.env.JWT_SECRET));
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('PORT:', process.env.PORT || 5001);
  console.log('---------------------------');

  if (isProduction && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required in production.');
  }

  if (mongoUri) {
    if (!isUsableMongoUri(mongoUri)) {
      const message = 'MONGODB_URI is invalid. Use a mongodb+srv URI with a real username and password, and no Atlas placeholders.';
      console.error(`Fatal: ${message}`);
      if (isProduction) {
        throw new Error(message);
      }
    } else {
      try {
        if (typeof net.setDefaultAutoSelectFamily === 'function') {
          net.setDefaultAutoSelectFamily(false);
        }
        const conn = await mongoose.connect(mongoUri, getMongoConnectOptions(mongoUri));
        if (mongoose.connection.readyState !== 1) {
          throw new Error('MongoDB reported a non-connected state after connect()');
        }
        console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${safeMongoError(error)}`);
        console.error('Check Atlas Network Access, the database user password, and that MONGODB_URI is set on the host.');
        if (isProduction) {
          throw error;
        }
      }
    }
  }

  if (isProduction) {
    throw new Error('MONGODB_URI is required in production. In-memory MongoDB is local-only.');
  }

  // Fallback to in-memory DB so dev/local server runs smoothly without requiring Atlas setup
  console.log('\n⚠️  STARTING LOCAL IN-MEMORY MONGODB FOR DEVELOPMENT...');
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongoServer = await MongoMemoryServer.create({
      instance: { storageEngine: 'wiredTiger' },
      binary: { downloadDir: require('path').join(__dirname, '.cache', 'mongodb-binaries') }
    });
    const conn = await mongoose.connect(mongoServer.getUri());
    console.log(`✅ In-Memory MongoDB Connected successfully (${conn.connection.host})`);
    return conn;
  } catch (fallbackError) {
    console.error(`❌ In-Memory MongoDB fallback failed: ${safeMongoError(fallbackError)}`);
    try {
      const conn = await mongoose.connect('mongodb://127.0.0.1:27017/antarya');
      console.log(`✅ Connected to local MongoDB daemon: ${conn.connection.host}`);
      return conn;
    } catch (localErr) {
      console.error(`❌ Fatal: Could not connect to any MongoDB instance. ${safeMongoError(localErr)}`);
      process.exit(1);
    }
  }
};

const shopSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // keeping id for backward compatibility
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  ownerName: { type: String, required: true },
  city: { type: String },
  setupComplete: { type: Boolean, default: false }
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  id: { type: String, required: true },
  shopId: { type: String, required: true },
  name: { type: String, required: true },
  nameHindi: { type: String },
  emoji: { type: String, default: '📦' },
  sellingPrice: { type: Number, required: true },
  costPrice: { type: Number, required: true },
  unit: { type: String, default: 'pc' },
  category: { type: String, default: 'General' },
  quantity: { type: Number, default: 0 },
  minStock: { type: Number, default: 5 },
  isDemo: { type: Boolean, default: false }
}, { timestamps: true });

const customerSchema = new mongoose.Schema({
  id: { type: String, required: true },
  shopId: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: String },
  city: { type: String, default: 'Local Area' },
  totalSpent: { type: Number, default: 0 },
  totalCredit: { type: Number, default: 0 }, // positive means they owe money (udhaar)
  totalTransactions: { type: Number, default: 0 },
  averageOrderValue: { type: Number, default: 0 },
  customerType: { 
    type: String, 
    enum: ['New', 'Regular', 'High Value', 'At Risk', 'Inactive'], 
    default: 'New' 
  },
  status: { 
    type: String, 
    enum: ['Active', 'Inactive'], 
    default: 'Active' 
  },
  amountPaid: { type: Number, default: 0 },
  paymentStatus: { 
    type: String, 
    enum: ['Paid', 'Pending', 'Partially Paid', 'Up-to-date', 'Overdue'], 
    default: 'Up-to-date' 
  },
  lastVisit: { type: Date },
  isDemo: { type: Boolean, default: false }
}, { timestamps: true });

const saleSchema = new mongoose.Schema({
  id: { type: String, required: true },
  shopId: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['cash', 'upi', 'udhaar'], required: true },
  items: [{
    productId: { type: String },
    name: { type: String },
    qty: { type: Number },
    price: { type: Number },
    costPrice: { type: Number },
    category: { type: String }
  }],
  customerId: { type: String }, // optional, for customer linkage
  customerName: { type: String },
  timestamp: { type: Date, default: Date.now },
  isDemo: { type: Boolean, default: false }
});

const expenseSchema = new mongoose.Schema({
  id: { type: String, required: true },
  shopId: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  note: { type: String },
  month: { type: String }, // e.g. "April 2026"
  date: { type: String }, // e.g. "2026-04-18"
  timestamp: { type: Date, default: Date.now },
  isDemo: { type: Boolean, default: false }
});

const complaintSchema = new mongoose.Schema({
  id: { type: String, required: true },
  shopId: { type: String, required: true },
  customer: { type: String, required: true },
  issue: { type: String, required: true },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  suggestedReply: { type: String },
  replySent: { type: String },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  timestamp: { type: Date, default: Date.now }
});

const predictionLogSchema = new mongoose.Schema({
  id: { type: String, required: true },
  shopId: { type: String, required: true },
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  predictedDemand: { type: Number, required: true },
  confidence: { type: Number },
  modelVersion: { type: String, required: true },
  modelType: { type: String, enum: ['foundation', 'hybrid', 'local'], default: 'foundation' },
  timestamp: { type: Date, default: Date.now }
});

const actualLogSchema = new mongoose.Schema({
  id: { type: String, required: true },
  shopId: { type: String, required: true },
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  actualSales: { type: Number, required: true },
  predictionLogId: { type: String }, // Links to the prediction
  absoluteError: { type: Number },
  percentageError: { type: Number },
  timestamp: { type: Date, default: Date.now }
});

const modelRegistrySchema = new mongoose.Schema({
  shopId: { type: String, required: true }, // "global" for foundation model
  version: { type: String, required: true },
  type: { type: String, enum: ['foundation', 'hybrid', 'local'], required: true },
  trainedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'staged', 'retired'], default: 'active' },
  trainingRows: { type: Number }
});

const paymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  shopId: { type: String, required: true },
  customerId: { type: String, required: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String },
  amount: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  balanceRemaining: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['upi', 'cash', 'card', 'bank_transfer'], default: 'upi' },
  status: { 
    type: String, 
    enum: ['Pending', 'Paid', 'Successful', 'Partially Paid', 'Failed', 'Cancelled'], 
    default: 'Pending' 
  },
  referenceNo: { type: String, required: true, unique: true },
  upiTransactionRef: { type: String },
  gatewayProvider: { type: String, default: 'manual' }, // 'razorpay' | 'manual' | 'upi_direct'
  gatewayOrderId: { type: String },
  gatewayPaymentId: { type: String },
  gatewayQrCodeId: { type: String },
  gatewayQrImageUrl: { type: String },
  gatewayUpiIntent: { type: String },
  qrDataUrl: { type: String },
  webhookReceivedAt: { type: Date },
  webhookEventId: { type: String },
  failureReason: { type: String },
  amountVerified: { type: Boolean, default: false },
  saleId: { type: String },
  invoiceNumber: { type: String },
  // 'checkout': the client records the itemised sale itself; 'counter': a sale is recorded when the payment succeeds
  purpose: { type: String, enum: ['counter', 'checkout'], default: 'counter' },
  notes: { type: String },
  auditTrail: [{
    status: { type: String },
    updatedBy: { type: String, default: 'Shop Owner' },
    note: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  verifiedAt: { type: Date },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const inventoryUploadSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  shopId: { type: String, required: true },
  market: { type: String, required: true },
  marketKey: { type: String, required: true }, // lower-cased market name used for grouping
  fileName: { type: String, required: true },
  fileHash: { type: String, required: true },
  sheetName: { type: String },
  mapping: { type: Object },
  rowCount: { type: Number, default: 0 },
  skippedRows: { type: Number, default: 0 },
  productCount: { type: Number, default: 0 },
  dateFrom: { type: String },
  dateTo: { type: String }
}, { timestamps: true });
inventoryUploadSchema.index({ shopId: 1, marketKey: 1, fileHash: 1 }, { unique: true });

const inventorySaleRowSchema = new mongoose.Schema({
  shopId: { type: String, required: true },
  marketKey: { type: String, required: true },
  uploadId: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  product: { type: String, required: true },
  quantity: { type: Number, required: true },
  category: { type: String },
  price: { type: Number },
  stock: { type: Number },
  cost: { type: Number },
  discountPct: { type: Number },
  festival: { type: Number },
  festivalName: { type: String },
  promotion: { type: Number }
});
inventorySaleRowSchema.index({ shopId: 1, marketKey: 1 });
inventorySaleRowSchema.index({ uploadId: 1 });

// Latest calculated plan per market, so the dashboard can show it without retraining.
const inventoryPlanSchema = new mongoose.Schema({
  shopId: { type: String, required: true },
  marketKey: { type: String, required: true },
  market: { type: String, required: true },
  method: { type: String },
  settings: { type: Object },
  data: { type: Object },
  summary: { type: Object },
  validation: { type: Object },
  attributeEffects: { type: Object },
  upcomingFestivals: { type: Array },
  topProducts: { type: Array },
  notes: { type: Array }
}, { timestamps: true });
inventoryPlanSchema.index({ shopId: 1, marketKey: 1 }, { unique: true });

// Monthly Antarya subscription payments (shop owner -> Antarya), verified with Razorpay
// or paid by UPI QR to the platform VPA and verified by the platform admin.
const subscriptionPaymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  shopId: { type: String, required: true },
  period: { type: String, required: true }, // YYYY-MM the payment covers
  amount: { type: Number, required: true }, // rupees
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['created', 'pending_verification', 'paid', 'failed', 'rejected'], default: 'created' },
  provider: { type: String, enum: ['razorpay', 'upi_qr'], default: 'razorpay' },
  gatewayMode: { type: String }, // test | live | upi_qr
  razorpayOrderId: { type: String, unique: true, sparse: true, required: function () { return this.provider !== 'upi_qr'; } },
  razorpayPaymentId: { type: String },
  method: { type: String },
  upiTransactionId: { type: String },
  upiReference: { type: String, unique: true, sparse: true }, // `tr` in the platform UPI intent
  payeeVpa: { type: String },
  utrSubmittedAt: { type: Date },
  verifiedBy: { type: String }, // checkout_signature | webhook | api_sync | admin:<username>
  paidAt: { type: Date },
  failureReason: { type: String }
}, { timestamps: true });
subscriptionPaymentSchema.index({ shopId: 1, period: 1 });

const Shop = mongoose.model('Shop', shopSchema);
const Product = mongoose.model('Product', productSchema);
const Customer = mongoose.model('Customer', customerSchema);
const Sale = mongoose.model('Sale', saleSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const Expense = mongoose.model('Expense', expenseSchema);
const Complaint = mongoose.model('Complaint', complaintSchema);
const PredictionLog = mongoose.model('PredictionLog', predictionLogSchema);
const ActualLog = mongoose.model('ActualLog', actualLogSchema);
const ModelRegistry = mongoose.model('ModelRegistry', modelRegistrySchema);
const InventoryUpload = mongoose.model('InventoryUpload', inventoryUploadSchema);
const InventorySaleRow = mongoose.model('InventorySaleRow', inventorySaleRowSchema);
const InventoryPlan = mongoose.model('InventoryPlan', inventoryPlanSchema);
const SubscriptionPayment = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);

module.exports = {
  db: {
    shops: Shop,
    products: Product,
    customers: Customer,
    sales: Sale,
    payments: Payment,
    expenses: Expense,
    complaints: Complaint,
    predictionLogs: PredictionLog,
    actualLogs: ActualLog,
    modelRegistry: ModelRegistry,
    inventoryUploads: InventoryUpload,
    inventorySaleRows: InventorySaleRow,
    inventoryPlans: InventoryPlan,
    subscriptionPayments: SubscriptionPayment
  },
  connectDB,
  disconnectDB,
  getMongoUri,
  isUsableMongoUri,
  getMongoDbName,
  getMongoConnectOptions,
  isDbConnected,
  getDbStatus,
  safeMongoError
};
