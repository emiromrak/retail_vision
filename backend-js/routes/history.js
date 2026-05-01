const express = require('express');
const router = express.Router();
const { prepare } = require('../db/database');

// GET /api/history?limit=50 — analiz geçmişi
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || 50, 10), 500);
  const records = prepare(
    'SELECT * FROM analysis_records ORDER BY analyzed_at DESC LIMIT ?'
  ).all(limit);

  res.json(
    records.map((r) => ({
      id: r.id,
      image_filename: r.image_filename,
      total_items: r.total_items,
      missing_count: r.missing_count,
      missing: JSON.parse(r.missing_json || '[]'),
      detected: JSON.parse(r.detected_json || '{}'),
      ai_report: r.ai_report,
      source: r.source,
      analyzed_at: r.analyzed_at,
    }))
  );
});

// DELETE /api/history/:id — kayıt sil
router.delete('/:id', (req, res) => {
  const record = prepare('SELECT id FROM analysis_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ detail: 'Kayıt bulunamadı.' });

  prepare('DELETE FROM analysis_records WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
