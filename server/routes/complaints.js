const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware } = require('../middleware');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();
router.use(authMiddleware);

// Helper function to generate AI suggested reply for customer complaint
async function getSuggestedReply(customer, issue, shopName) {
  try {
    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a polite, helpful Indian shopkeeper (${shopName || 'Antarya Kirana'}). A customer named "${customer}" has a complaint: "${issue}". Write a brief, warm, polite suggested SMS/WhatsApp reply in simple Hindi-English mix (Hinglish) with folded hands emoji 🙏 offering a solution or discount. Keep under 30 words.`;
      const result = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 100, temperature: 0.7 }
      });
      if (result.text) return result.text.trim();
    }
  } catch (err) {
    console.error('AI Reply generation error:', err.message);
  }
  // Polite fallback reply
  return `Sorry ${customer} ji 🙏 We apologize for the inconvenience with "${issue}". Please visit our shop for an immediate replacement and special discount! 😊`;
}

// GET /api/complaints - Get all complaints
router.get('/', async (req, res) => {
  try {
    let complaints = await db.complaints.find({ shopId: req.shopId }).sort({ timestamp: -1 });

    // If shop has no complaints yet, let's seed 2 initial demo complaints so the dashboard looks alive on first launch
    if (complaints.length === 0) {
      const demo1 = new db.complaints({
        id: uuidv4(),
        shopId: req.shopId,
        customer: 'Sharma Ji',
        issue: 'Oil packet was leaking slightly',
        status: 'open',
        suggestedReply: 'Sorry Sharma ji 🙏 New packet kept aside for you. No extra charge. Please come collect anytime.',
        priority: 'high',
        timestamp: new Date(Date.now() - 3600000 * 3)
      });
      const demo2 = new db.complaints({
        id: uuidv4(),
        shopId: req.shopId,
        customer: 'Verma Madam',
        issue: 'Asked for 1kg atta but bag had 950g',
        status: 'resolved',
        suggestedReply: 'Extremely sorry Verma ji 🙏 We have adjusted the balance and sent a fresh 1kg pack to your home!',
        replySent: 'Extremely sorry Verma ji 🙏 We have adjusted the balance and sent a fresh 1kg pack to your home!',
        priority: 'medium',
        timestamp: new Date(Date.now() - 86400000 * 2)
      });
      await demo1.save();
      await demo2.save();
      complaints = [demo1, demo2];
    }

    res.json(complaints.map(c => ({
      id: c.id,
      customer: c.customer,
      issue: c.issue,
      status: c.status,
      suggestedReply: c.suggestedReply,
      replySent: c.replySent,
      priority: c.priority,
      timestamp: c.timestamp.toISOString(),
      date: getTimeAgo(c.timestamp)
    })));
  } catch (err) {
    console.error('Get complaints error:', err);
    res.status(500).json({ error: 'Server error fetching complaints' });
  }
});

// POST /api/complaints - Add new complaint
router.post('/', async (req, res) => {
  try {
    const { customer, issue, priority } = req.body;
    if (!customer || !issue) {
      return res.status(400).json({ error: 'Customer name and issue are required' });
    }

    const shop = await db.shops.findOne({ id: req.shopId });
    const suggestedReply = await getSuggestedReply(customer, issue, shop?.name);

    const complaint = new db.complaints({
      id: uuidv4(),
      shopId: req.shopId,
      customer,
      issue,
      status: 'open',
      suggestedReply,
      priority: priority || 'medium',
      timestamp: new Date()
    });

    await complaint.save();

    res.status(201).json({
      id: complaint.id,
      customer: complaint.customer,
      issue: complaint.issue,
      status: complaint.status,
      suggestedReply: complaint.suggestedReply,
      priority: complaint.priority,
      timestamp: complaint.timestamp.toISOString(),
      date: 'Just now'
    });
  } catch (err) {
    console.error('Create complaint error:', err);
    res.status(500).json({ error: 'Server error creating complaint' });
  }
});

// PUT /api/complaints/:id/resolve - Resolve a complaint
router.put('/:id/resolve', async (req, res) => {
  try {
    const { reply } = req.body;
    const complaint = await db.complaints.findOneAndUpdate(
      { id: req.params.id, shopId: req.shopId },
      { status: 'resolved', replySent: reply || 'Resolved' },
      { new: true }
    );

    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    res.json({
      success: true,
      complaint: {
        id: complaint.id,
        status: complaint.status,
        replySent: complaint.replySent
      }
    });
  } catch (err) {
    console.error('Resolve complaint error:', err);
    res.status(500).json({ error: 'Server error resolving complaint' });
  }
});

// DELETE /api/complaints/:id - Delete a complaint
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.complaints.findOneAndDelete({ id: req.params.id, shopId: req.shopId });
    if (!result) return res.status(404).json({ error: 'Complaint not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete complaint error:', err);
    res.status(500).json({ error: 'Server error deleting complaint' });
  }
});

function getTimeAgo(date) {
  if (!date) return '';
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 5) return 'Just now';
  if (diffMins < 60) return `${diffMins} mins ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

module.exports = router;
