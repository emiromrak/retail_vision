const express = require('express');
const router = express.Router();
const { prepare } = require('../db/database');

// GET /api/stats — genel istatistikler + grafik verileri
router.get('/', (req, res) => {
  const total = prepare('SELECT COUNT(*) as cnt FROM analysis_records').get().cnt || 0;
  const totalItems = prepare('SELECT SUM(total_items) as s FROM analysis_records').get().s || 0;
  const totalMissing = prepare('SELECT SUM(missing_count) as s FROM analysis_records').get().s || 0;
  const avgMissing = total > 0 ? Math.round((totalMissing / total) * 100) / 100 : 0;

  // En çok eksik olan ürün
  const allRecords = prepare('SELECT missing_json FROM analysis_records').all();
  const missingCounter = {};
  for (const r of allRecords) {
    const missing = JSON.parse(r.missing_json || '[]');
    for (const item of missing) {
      missingCounter[item] = (missingCounter[item] || 0) + 1;
    }
  }
  const mostMissing =
    Object.keys(missingCounter).length > 0
      ? Object.entries(missingCounter).sort((a, b) => b[1] - a[1])[0][0]
      : null;

  // Son 10 analiz
  const recent = prepare(
    'SELECT * FROM analysis_records ORDER BY analyzed_at DESC LIMIT 10'
  ).all();

  // Son 7 günlük günlük grafik verisi
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dailyRows = prepare(
    "SELECT * FROM analysis_records WHERE analyzed_at >= ?"
  ).all(sevenDaysAgo);

  const daily = {};
  for (const r of dailyRows) {
    const date = new Date(r.analyzed_at);
    // "27 Nis" gibi Türkçe format
    const day = date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
    if (!daily[day]) daily[day] = { analyses: 0, missing: 0, items: 0 };
    daily[day].analyses += 1;
    daily[day].missing += r.missing_count;
    daily[day].items += r.total_items;
  }

  res.json({
    total_analyses: total,
    total_items_detected: totalItems,
    total_missing: totalMissing,
    avg_missing_per_analysis: avgMissing,
    most_missing_product: mostMissing,
    recent_analyses: recent.map((r) => ({
      id: r.id,
      image_filename: r.image_filename,
      total_items: r.total_items,
      missing_count: r.missing_count,
      source: r.source,
      analyzed_at: r.analyzed_at,
    })),
    daily_chart: daily,
    missing_frequency: missingCounter,
  });
});

module.exports = router;
