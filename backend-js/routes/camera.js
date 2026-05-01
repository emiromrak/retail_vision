const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { startCamera, stopCamera, getCameraStatus, YOLO_STREAM_URL } = require('../services/yolo');

// POST /api/camera/start
router.post('/start', async (req, res) => {
  const source = req.body.source || '0';
  try {
    const result = await startCamera(source);
    if (result.detail) return res.status(500).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// POST /api/camera/stop
router.post('/stop', async (req, res) => {
  try {
    const result = await stopCamera();
    res.json(result);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// GET /api/camera/status
router.get('/status', async (req, res) => {
  try {
    const result = await getCameraStatus();
    res.json(result);
  } catch (err) {
    res.status(503).json({ active: false, source: '0', fps: 0 });
  }
});

// GET /api/camera/stream — Python MJPEG stream'ini proxy'le
router.get('/stream', async (req, res) => {
  try {
    const upstream = await fetch(YOLO_STREAM_URL, { timeout: 5000 });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ detail: 'Kamera aktif değil.' });
    }

    // MJPEG header'larını ilet
    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Pragma', 'no-cache');

    // Stream'i doğrudan client'a aktar
    upstream.body.pipe(res);

    // Client bağlantıyı keserse upstream'i de sonlandır
    req.on('close', () => {
      upstream.body.destroy();
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ detail: 'Stream proxy hatası: ' + err.message });
    }
  }
});

module.exports = router;
