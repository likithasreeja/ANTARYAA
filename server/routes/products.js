const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware } = require('../middleware');

const router = express.Router();

// All routes require auth
router.use(authMiddleware);

// GET /api/products - Get all products for shop
router.get('/', async (req, res) => {
  try {
    const products = await db.products.find({ shopId: req.shopId });
    res.json(products);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/products - Add single product
router.post('/', async (req, res) => {
  try {
    const { name, nameHindi, category, sellingPrice, costPrice, quantity, unit, minStock } = req.body;

    if (!name || sellingPrice === undefined) {
      return res.status(400).json({ error: 'Name and selling price are required' });
    }

    const product = new db.products({
      id: uuidv4(),
      shopId: req.shopId,
      name,
      nameHindi: nameHindi || '',
      category: category || 'General',
      sellingPrice: Number(sellingPrice),
      costPrice: Number(costPrice) || 0,
      quantity: Number(quantity) || 0,
      unit: unit || 'pc',
      minStock: Number(minStock) || 5
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error('Add product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/products/bulk - Add multiple products at once
router.post('/bulk', async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products array is required' });
    }

    const productsToInsert = products.map(p => ({
      id: uuidv4(),
      shopId: req.shopId,
      name: p.name,
      nameHindi: p.nameHindi || '',
      category: p.category || 'General',
      sellingPrice: Number(p.sellingPrice) || 0,
      costPrice: Number(p.costPrice) || 0,
      quantity: Number(p.quantity) || 0,
      unit: p.unit || 'pc',
      minStock: Number(p.minStock) || 5,
      emoji: p.emoji || '📦'
    }));

    const created = await db.products.insertMany(productsToInsert);
    res.status(201).json(created);
  } catch (err) {
    console.error('Bulk add error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/products/seed-demo - Add demo products for ML
router.post('/seed-demo', async (req, res) => {
  try {
    const demoProducts = [
      { name: "Amul Taaza Milk 1L", category: "Dairy", sellingPrice: 65, costPrice: 50, quantity: 12, unit: "pc", emoji: "🥛" },
      { name: "Aashirvaad Atta 5kg", category: "Grocery", sellingPrice: 220, costPrice: 190, quantity: 4, unit: "pc", emoji: "🌾" },
      { name: "Maggi 2-Minute Noodles", category: "Snacks", sellingPrice: 14, costPrice: 12, quantity: 45, unit: "pc", emoji: "🍜" },
      { name: "Tata Salt 1kg", category: "Grocery", sellingPrice: 28, costPrice: 22, quantity: 3, unit: "pc", emoji: "🧂" }, // Low stock
      { name: "Britannia Good Day", category: "Snacks", sellingPrice: 30, costPrice: 25, quantity: 0, unit: "pc", emoji: "🍪" }  // Out of stock
    ];

    const productsToInsert = demoProducts.map(p => ({
      id: uuidv4(),
      shopId: req.shopId,
      name: p.name,
      nameHindi: '',
      category: p.category,
      sellingPrice: p.sellingPrice,
      costPrice: p.costPrice,
      quantity: p.quantity,
      unit: p.unit,
      minStock: 5,
      emoji: p.emoji
    }));

    await db.products.insertMany(productsToInsert);
    res.status(201).json({ success: true, message: "Demo products loaded!" });
  } catch (err) {
    console.error('Seed demo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', async (req, res) => {
  try {
    const product = await db.products.findOne({ id: req.params.id });
    if (!product || product.shopId !== req.shopId) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updates = {};
    const allowedFields = ['name', 'nameHindi', 'category', 'sellingPrice', 'costPrice', 'quantity', 'unit', 'minStock'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = ['sellingPrice', 'costPrice', 'quantity', 'minStock'].includes(field)
          ? Number(req.body[field])
          : req.body[field];
      }
    });

    const updated = await db.products.findOneAndUpdate(
      { id: req.params.id, shopId: req.shopId },
      { $set: updates },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/products/:id/add-stock - Add stock quantity
router.put('/:id/add-stock', async (req, res) => {
  try {
    const product = await db.products.findOne({ id: req.params.id });
    if (!product || product.shopId !== req.shopId) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const addQty = Number(req.body.quantity) || 0;
    const costPrice = req.body.costPrice !== undefined ? Number(req.body.costPrice) : product.costPrice;

    const updated = await db.products.findOneAndUpdate(
      { id: req.params.id, shopId: req.shopId },
      { 
        $set: { costPrice },
        $inc: { quantity: addQty } 
      },
      { new: true }
    );

    // Record as expense if cost provided
    if (req.body.totalCost) {
      const expense = new db.expenses({
        id: uuidv4(),
        shopId: req.shopId,
        note: `Stock: ${product.name} x ${addQty} ${product.unit}`,
        amount: Number(req.body.totalCost),
        category: 'Stock Purchase',
        productId: product.id,
        month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
        date: new Date().toISOString().split('T')[0]
      });
      await expense.save();

      // Reduce cash in hand on shop model is skipped here as we don't track cashInHand strictly anymore in the new Mongoose model
    }

    res.json(updated);
  } catch (err) {
    console.error('Add stock error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.products.findOneAndDelete({ id: req.params.id, shopId: req.shopId });
    if (!result) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
