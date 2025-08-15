const router = require('express').Router();
router.use('/renew', require('./renew'));
router.use('/tbh7', require('./tbh7'));
router.use('/public', require('./public'));
router.use('/admin', require('./admin'));
router.use('/webhooks', require('./webhooks'));
module.exports = router;
