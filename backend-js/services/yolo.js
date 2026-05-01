const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');

const YOLO_BASE = 'http://localhost:8001';

/**
 * Bir görsel dosyasını Python YOLO mikroservisine gönderir.
 */
async function analyzeImage(filePath, filename, conf = 0.35) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), { filename });
  form.append('conf', String(conf));

  const res = await fetch(`${YOLO_BASE}/analyze`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 60000,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'YOLO servisi hatası' }));
    throw new Error(err.detail || 'YOLO analiz hatası');
  }

  return res.json();
}

/**
 * Aktif kamera karesini analiz ettirir.
 */
async function analyzeCameraFrame() {
  const res = await fetch(`${YOLO_BASE}/analyze/camera`, { timeout: 30000 });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Kamera analiz hatası' }));
    throw new Error(err.detail || 'Kamera analiz hatası');
  }

  return res.json();
}

/**
 * Kamerayı başlatır.
 */
async function startCamera(source = '0') {
  const form = new FormData();
  form.append('source', source);

  const res = await fetch(`${YOLO_BASE}/camera/start`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
    timeout: 10000,
  });

  return res.json();
}

/**
 * Kamerayı durdurur.
 */
async function stopCamera() {
  const res = await fetch(`${YOLO_BASE}/camera/stop`, { method: 'POST', timeout: 5000 });
  return res.json();
}

/**
 * Kamera durumunu döner.
 */
async function getCameraStatus() {
  const res = await fetch(`${YOLO_BASE}/camera/status`, { timeout: 5000 });
  return res.json();
}

const YOLO_STREAM_URL = `${YOLO_BASE}/camera/stream`;

module.exports = {
  analyzeImage,
  analyzeCameraFrame,
  startCamera,
  stopCamera,
  getCameraStatus,
  YOLO_STREAM_URL,
};
