function errorHandler(err, _req, res, _next) {
  console.error('[BTS] Error:', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal error' });
}
module.exports = { errorHandler };
