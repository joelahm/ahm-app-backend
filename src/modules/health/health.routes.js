const express = require('express');

const router = express.Router();

router.get('/health', function health(req, res) {
  res.status(200).json({ status: 'ok', service: 'ahm-app-backend', timestamp: new Date().toISOString() });
});

module.exports = { healthRouter: router };
