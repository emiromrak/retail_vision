const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { prepare } = require('../db/database');
const { generateReport } = require('../services/llm');
const { analyzeImage, analyzeCameraFrame } = require('../services/yolo');

// Yüklenen dosyaları uploads/ klasörüne orijinal uzantısıyla kaydet
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../../uploads'),
  filename: (_req, file, cb) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `upload_${ts}${ext}`);
  },
});
const upload = multer({ storage });

/**
 * Tespit edilen ürünleri kayıtlı ürünlerle karşılaştırır.
 * Python'daki compute_stock_status() ile birebir aynı mantık.
 */
function computeStockStatus(detected, products) {
  const activeProducts = products.filter((p) => p.active);
  const items = [];
  const missing = [];
  const total = Object.values(detected).reduce((a, b) => a + b, 0) || 1;
  const productNames = new Set(activeProducts.map((p) => p.name));

  for (const product of activeProducts) {
    const count = detected[product.name] || 0;
    const crit = product.critical_level;
    const pct = Math.round((count / total) * 1000) / 10;
    let status;

    if (count === 0) {
      status = 'KRITIK';
      missing.push(product.name);
    } else if (count < crit) {
      status = 'EKSIK';
      missing.push(product.name);
    } else {
      status = 'OK';
    }

    items.push({ name: product.name, display_name: product.display_name, count, critical_level: crit, status, percentage: pct });
  }

  // Ürün listesinde olmayan tespit edilenleri de ekle
  for (const [name, count] of Object.entries(detected)) {
    if (!productNames.has(name)) {
      items.push({
        name,
        display_name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
        critical_level: 0,
        status: 'IZLENMEZ',
        percentage: Math.round((count / total) * 1000) / 10,
      });
    }
  }

  return { items, missing };
}

// POST /api/analyze — görsel yükle ve analiz et
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ detail: 'Dosya gereklidir.' });

  const conf = parseFloat(req.body.conf || 0.35);

  try {
    const detection = await analyzeImage(req.file.path, req.file.originalname, conf);
    const { detected, annotated_image, total_items, image_path, image_filename } = detection;

    const products = prepare('SELECT * FROM products WHERE active = 1').all();
    const { items, missing } = computeStockStatus(detected, products);
    const aiReport = await generateReport(missing, detected);

    const info = prepare(
      `INSERT INTO analysis_records
        (image_path, image_filename, detected_json, missing_json, ai_report, total_items, missing_count, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      image_path,
      image_filename,
      JSON.stringify(detected),
      JSON.stringify(missing),
      aiReport,
      total_items,
      missing.length,
      'upload'
    );

    const record = prepare('SELECT * FROM analysis_records WHERE id = ?').get(info.lastInsertRowid);

    res.json({
      id: record.id,
      detected,
      items,
      missing,
      ai_report: aiReport,
      total_items,
      missing_count: missing.length,
      annotated_image,
      analyzed_at: record.analyzed_at,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

// POST /api/analyze/camera — aktif kamera karesini analiz et
router.post('/camera', async (req, res) => {
  try {
    const detection = await analyzeCameraFrame();
    const { detected, annotated_image, total_items } = detection;

    const products = prepare('SELECT * FROM products WHERE active = 1').all();
    const { items, missing } = computeStockStatus(detected, products);
    const aiReport = await generateReport(missing, detected);

    const info = prepare(
      `INSERT INTO analysis_records
        (image_path, image_filename, detected_json, missing_json, ai_report, total_items, missing_count, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'camera',
      'camera_frame.jpg',
      JSON.stringify(detected),
      JSON.stringify(missing),
      aiReport,
      total_items,
      missing.length,
      'camera'
    );

    const record = prepare('SELECT * FROM analysis_records WHERE id = ?').get(info.lastInsertRowid);

    res.json({
      id: record.id,
      detected,
      items,
      missing,
      ai_report: aiReport,
      total_items,
      missing_count: missing.length,
      annotated_image,
      analyzed_at: record.analyzed_at,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

module.exports = router;
