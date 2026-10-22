const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { generateToken } = require('../middleware');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, ownerName, city, phone, password } = req.body;

    if (!name || !ownerName || !phone || !password) {
      return res.status(400).json({ error: 'Shop name, owner name, phone and password are required' });
    }

    // Check if phone already exists
    const existing = await db.shops.findOne({ phone });
    if (existing) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create shop
    const shop = new db.shops({
      id: uuidv4(),
      name,
      ownerName,
      city: city || '',
      phone,
      password: hashedPassword,
      setupComplete: false
    });
    await shop.save();

    const token = generateToken(shop);

    res.status(201).json({
      token,
      shop: {
        id: shop.id,
        name: shop.name,
        ownerName: shop.ownerName,
        city: shop.city,
        phone: shop.phone,
        setupComplete: shop.setupComplete
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    const shop = await db.shops.findOne({ phone });
    if (!shop) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const validPassword = await bcrypt.compare(password, shop.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const token = generateToken(shop);

    res.json({
      token,
      shop: {
        id: shop.id,
        name: shop.name,
        ownerName: shop.ownerName,
        city: shop.city,
        phone: shop.phone,
        setupComplete: shop.setupComplete
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
const { authMiddleware } = require('../middleware');
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const shop = await db.shops.findOne({ id: req.shopId });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    res.json({
      id: shop.id,
      name: shop.name,
      ownerName: shop.ownerName,
      city: shop.city,
      phone: shop.phone,
      setupComplete: shop.setupComplete
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/setup-complete
router.put('/setup-complete', authMiddleware, async (req, res) => {
  try {
    const shop = await db.shops.findOneAndUpdate({ id: req.shopId }, { setupComplete: true }, { new: true });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Setup complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
