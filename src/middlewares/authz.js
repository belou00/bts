
// src/middlewares/authz.js
function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token') || '';
  if (token && process.env.JWT_SECRET && token === process.env.JWT_SECRET) return next();
  return res.status(401).json({ error: 'admin auth required' });
}
module.exports = { requireAdmin };
