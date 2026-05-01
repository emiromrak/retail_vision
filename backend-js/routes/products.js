const express = require('express');
const router = express.Router();
const { prepare } = require('../db/database');

// GET /api/products — tüm ürünleri listele
router.get('/', (req, res) => {
  const products = prepare('SELECT * FROM products').all();
  res.json(products.map((p) => ({ ...p, active: Boolean(p.active) })));
});

// POST /api/products — yeni ürün ekle
router.post('/', (req, res) => {
  const { name, display_name, critical_level = 3, category = 'Genel' } = req.body;

  if (!name || !display_name) {
    return res.status(400).json({ detail: 'name ve display_name zorunludur.' });
  }

  const existing = prepare('SELECT id FROM products WHERE name = ?').get(name);
  if (existing) {
    return res.status(400).json({ detail: 'Bu ürün zaten mevcut.' });
  }

  const info = prepare(
    'INSERT INTO products (name, display_name, critical_level, category) VALUES (?, ?, ?, ?)'
  ).run(name, display_name, critical_level, category);

  const product = prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...product, active: Boolean(product.active) });
});

// PUT /api/products/:id — ürünü güncelle
router.put('/:id', (req, res) => {
  const product = prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ detail: 'Ürün bulunamadı.' });

  const { display_name, critical_level, category, active } = req.body;
  const updates = {};
  if (display_name !== undefined) updates.display_name = display_name;
  if (critical_level !== undefined) updates.critical_level = critical_level;
  if (category !== undefined) updates.category = category;
  if (active !== undefined) updates.active = active ? 1 : 0;

  if (Object.keys(updates).length === 0) {
    return res.json({ ...product, active: Boolean(product.active) });
  }

  const setClause = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .join(', ');
  prepare(`UPDATE products SET ${setClause} WHERE id = ?`).run(
    ...Object.values(updates),
    req.params.id
  );

  const updated = prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  res.json({ ...updated, active: Boolean(updated.active) });
});

// DELETE /api/products/:id — ürünü sil
router.delete('/:id', (req, res) => {
  const product = prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ detail: 'Ürün bulunamadı.' });

  prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
