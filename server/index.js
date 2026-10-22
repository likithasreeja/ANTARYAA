// Load environment variables first
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const { connectDB, disconnectDB, isDbConnected, getDbStatus } = require('./db');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const salesRoutes = require('./routes/sales');
const customerRoutes = require('./routes/customers');
const dashboardRoutes = require('./routes/dashboard');
const aiRoutes = require('./routes/ai');
const complaintRoutes = require('./routes/complaints');
const mlRoutes = require('./routes/ml');
const learningRoutes = require('./routes/learning');
const paymentRoutes = require('./routes/payments');
const inventoryRoutes = require('./routes/inventory');
const subscriptionRoutes = require('./routes/subscription');
const adminRoutes = require('./routes/admin');

const app = express();

const allowedOrigins = [
  'https://antarya-one.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.FRONTEND_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean)
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
})); // Larger limit for audio data & capture rawBody for webhook HMAC signatures

app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/api/health') return next();
  if (!isDbConnected()) {
    return res.status(503).json({ error: 'Database unavailable' });
  }
  return next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/admin', adminRoutes);

function healthPayload() {
  const db = getDbStatus();
  return {
    status: db.connected ? 'ok' : 'degraded',
    name: 'Antarya API',
    version: '2.0.0',
    db: {
      connected: db.connected,
      state: db.state,
      host: db.host,
      name: db.name
    },
    ai: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      bhashini: Boolean(process.env.BHASHINI_USER_ID && process.env.BHASHINI_API_KEY)
    }
  };
}

app.get('/health', (req, res) => {
  const payload = healthPayload();
  res.status(payload.db.connected ? 200 : 503).json(payload);
});

app.get('/api/health', (req, res) => {
  const payload = healthPayload();
  res.status(payload.db.connected ? 200 : 503).json(payload);
});

const PORT = process.env.PORT || 5001;

let serverInstance = null;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Closing ANTARYA server...`);
  if (serverInstance) {
    await new Promise(resolve => serverInstance.close(resolve));
  }
  try {
    await disconnectDB();
  } catch (err) {
    console.error('Error during MongoDB disconnect');
  }
  process.exit(0);
}

if (require.main === module) {
  connectDB().then(() => {
    serverInstance = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🏪 ANTARYA Server running on port ${PORT}`);
      console.log(`   Dukan Ka Dimaag is ready!\n`);
      console.log(`   🧠 Gemini AI: ${process.env.GEMINI_API_KEY ? 'configured' : 'not configured'}`);
      console.log(`   🗣️ Bhashini:  ${process.env.BHASHINI_USER_ID ? 'configured' : 'not configured'}`);
      console.log('');
    });
  }).catch(() => {
    console.error('Failed to start ANTARYA server');
    process.exit(1);
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, connectDB, disconnectDB };
