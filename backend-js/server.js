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
// NOT: Kamera/YOLO servisi dahili port 8001'de çalışır.
// Frontend sadece port 8000'i kullanır — Node.js arkada proxy yapar.
function startYoloService() {
  const projectRoot = path.join(__dirname, '..');

  console.log('  🐍 Python YOLO servisi başlatılıyor (dahili port 8001)...');

  // Windows'ta 'python' yerine 'py' (Python Launcher) kullan
  const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
  const args = ['-m', 'uvicorn', 'yolo_service:app', '--host', '127.0.0.1', '--port', '8001', '--log-level', 'warning'];

  function spawnPython(cmd) {
    return spawn(cmd, args, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
  }

  let pyProcess = spawnPython(pythonCmd);

  pyProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`  [YOLO] ${msg}`);
  });

  pyProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('INFO') && !msg.includes('WARNING: This is a development server')) {
      console.log(`  [YOLO] ${msg}`);
    }
  });

  pyProcess.on('error', (err) => {
    // 'py' bulunamazsa 'python' ile tekrar dene
    if (err.code === 'ENOENT' && pythonCmd === 'py') {
      console.log('  ⚠️  "py" bulunamadı, "python" ile tekrar deneniyor...');
      pyProcess = spawnPython('python');
      pyProcess.on('error', (err2) => {
        console.error(`  ❌ Python başlatılamadı: ${err2.message}`);
        console.error('     Python kurulu olduğundan ve PATH\'e ekli olduğundan emin olun.');
      });
    } else {
      console.error(`  ❌ YOLO servisi başlatılamadı: ${err.message}`);
    }
  });

  pyProcess.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
      console.log(`  ⚠️  YOLO servisi kapandı (kod: ${code}). Kamera/analiz özellikleri çalışmayacak.`);
    }
  });

  // Ana process kapanınca Python'u da kapat
  process.on('exit', () => { try { pyProcess.kill(); } catch(_) {} });
  process.on('SIGINT', () => { try { pyProcess.kill(); } catch(_) {} process.exit(0); });
  process.on('SIGTERM', () => { try { pyProcess.kill(); } catch(_) {} process.exit(0); });

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
  console.log(`  🔌 YOLO + Kamera        : dahili olarak çalışıyor (dışarıya kapalı)`);
  console.log(`  🌐 Tek adres            : http://localhost:${PORT} — kamera dahil HER ŞEY buradan`);
  console.log('');
});
