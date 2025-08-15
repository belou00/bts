function requireAdmin(req, res, next) {
  // Simple RBAC DEV: en PROD on passera sur un JWT Admin
  const token = req.headers['x-admin-token'];
  if (token && token === process.env.JWT_SECRET) return next();
  return res.status(401).json({ error: 'admin required' });
}
module.exports = { requireAdmin };
