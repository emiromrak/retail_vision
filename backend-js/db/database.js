// Node.js 22.5+ built-in SQLite — derleme gerekmez
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// DB'yi proje kökünde mevcut dosyayla paylaşıyoruz
const DB_PATH = path.join(__dirname, '../../retail_vision.db');

const db = new DatabaseSync(DB_PATH);

// WAL modu: eşzamanlı okuma performansı için
db.exec('PRAGMA journal_mode = WAL');

/**
 * better-sqlite3 ile uyumlu prepare wrapper.
 * node:sqlite'ın StatementSync API'sini sararak aynı arayüzü sağlar.
 */
function prepare(sql) {
  const stmt = db.prepare(sql);
  return {
    run:   (...args) => stmt.run(...args),
    get:   (...args) => stmt.get(...args),
    all:   (...args) => stmt.all(...args),
  };
}

/**
 * Basit transaction yardımcı — node:sqlite sync olduğu için
 * try/finally ile sarıyoruz.
 */
function transaction(fn) {
  return () => {
    db.exec('BEGIN');
    try {
      fn();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      critical_level INTEGER DEFAULT 3,
      category TEXT DEFAULT 'Genel',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analysis_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT,
      image_filename TEXT,
      detected_json TEXT,
      missing_json TEXT,
      ai_report TEXT,
      total_items INTEGER DEFAULT 0,
      missing_count INTEGER DEFAULT 0,
      source TEXT DEFAULT 'upload',
      analyzed_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Varsayılan ürünleri ekle (tablo boşsa)
  const count = prepare('SELECT COUNT(*) as cnt FROM products').get();
  if (count.cnt === 0) {
    const insert = prepare(
      'INSERT INTO products (name, display_name, critical_level, category) VALUES (?, ?, ?, ?)'
    );
    const insertMany = transaction(() => {
      const defaults = [
        ['bottle',     'Su Şişesi',    5, 'İçecek'],
        ['cup',        'Bardak',        2, 'Mutfak'],
        ['apple',      'Elma',          3, 'Meyve'],
        ['orange',     'Portakal',      3, 'Meyve'],
        ['banana',     'Muz',           2, 'Meyve'],
        ['book',       'Kitap',         4, 'Kırtasiye'],
        ['cell phone', 'Cep Telefonu',  2, 'Elektronik'],
        ['laptop',     'Laptop',        1, 'Elektronik'],
      ];
      for (const d of defaults) insert.run(...d);
    });
    insertMany();
  }

  console.log('✅ Veritabanı hazır:', DB_PATH);
}

module.exports = { db, prepare, transaction, initDb };
