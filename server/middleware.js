const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'antarya-dukan-ka-dimaag-2026-secret';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    req.shopId = decoded.shopId;
    req.shopName = decoded.shopName;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function generateToken(shop) {
  return jwt.sign(
    { shopId: shop.id, shopName: shop.name },
    SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { authMiddleware, generateToken, SECRET };
