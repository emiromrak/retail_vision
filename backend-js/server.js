const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { initDb } = require('./db/database');

const productsRouter = require('./routes/products');
const analysisRouter = require('./routes/analysis');
const historyRouter  = require('./routes/history');
const statsRouter    = require('./routes/stats');
const cameraRouter   = require('./routes/camera');

const app  = express();
const PORT = 8000;

// ── Python YOLO Mikroservisini Otomatik Başlat ────────────────────────────────
function startYoloService() {
  const projectRoot = path.join(__dirname, '..');

  console.log('  🐍 Python YOLO servisi başlatılıyor...');

  const pyProcess = spawn(
    'python',
    ['-m', 'uvicorn', 'yolo_service:app', '--host', '127.0.0.1', '--port', '8001', '--log-level', 'warning'],
    {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Windows'ta ayrı pencere açma
      detached: false,
    }
  );

  pyProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`  [YOLO] ${msg}`);
  });

  pyProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    // uvicorn INFO mesajlarını filtrele, sadece önemli olanları göster
    if (msg && !msg.includes('INFO') && !msg.includes('WARNING: This is a development server')) {
      console.log(`  [YOLO] ${msg}`);
    }
  });

  pyProcess.on('error', (err) => {
    console.error(`  ❌ YOLO servisi başlatılamadı: ${err.message}`);
    console.error('     Python ve uvicorn kurulu olduğundan emin olun.');
  });

  pyProcess.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
      console.log(`  ⚠️  YOLO servisi kapandı (kod: ${code}). Kamera/analiz özellikleri çalışmayacak.`);
    }
  });

  // Ana process kapanınca Python'u da kapat
  process.on('exit', () => pyProcess.kill());
  process.on('SIGINT', () => { pyProcess.kill(); process.exit(0); });
  process.on('SIGTERM', () => { pyProcess.kill(); process.exit(0); });

  return pyProcess;
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Frontend static dosyaları ─────────────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '../frontend');
app.use('/static', express.static(FRONTEND_DIR));

// Frontend CSS/JS klasörlerini doğrudan erişilebilir yap
app.use('/css', express.static(path.join(FRONTEND_DIR, 'css')));
app.use('/js',  express.static(path.join(FRONTEND_DIR, 'js')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/products', productsRouter);
app.use('/api/analyze',  analysisRouter);
app.use('/api/history',  historyRouter);
app.use('/api/stats',    statsRouter);
app.use('/api/camera',   cameraRouter);

// ── Root — index.html ─────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend bulunamadı: ' + indexPath);
  }
});

// ── Global hata yakalayıcı ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Sunucu hatası:', err);
  res.status(500).json({ detail: err.message || 'Sunucu hatası' });
});

// ── Başlat ────────────────────────────────────────────────────────────────────
initDb();
startYoloService(); // Python YOLO otomatik başlar

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ██████╗ ███████╗████████╗ █████╗ ██╗██╗    ██╗   ██╗██╗███████╗██╗ ██████╗ ███╗   ██╗');
  console.log('  ██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██║██║    ██║   ██║██║██╔════╝██║██╔═══██╗████╗  ██║');
  console.log('  ██████╔╝█████╗     ██║   ███████║██║██║    ██║   ██║██║███████╗██║██║   ██║██╔██╗ ██║');
  console.log('  ██╔══██╗██╔══╝     ██║   ██╔══██║██║██║    ╚██╗ ██╔╝██║╚════██║██║██║   ██║██║╚██╗██║');
  console.log('  ██║  ██║███████╗   ██║   ██║  ██║██║███████╗╚████╔╝ ██║███████║██║╚██████╔╝██║ ╚████║');
  console.log('  ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚══════╝ ╚═══╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝');
  console.log('');
  console.log(`  ✅ RetailVision hazır    : http://localhost:${PORT}`);
  console.log(`  📊 Dashboard            : http://localhost:${PORT}`);
  console.log(`  🔌 YOLO + Kamera        : arka planda çalışıyor`);
  console.log('');
});
