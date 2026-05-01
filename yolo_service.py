"""
RetailVision YOLO Mikroservisi — Port 8001
Sadece görüntü analizi ve kamera işlemlerini üstlenir.
Node.js ana API bu servisi dahili olarak HTTP ile çağırır.
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from datetime import datetime
import shutil

from backend.analyzer import analyzer
from backend.camera import camera_manager

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="RetailVision YOLO Microservice", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "yolo-microservice"}


# ─── Görsel Analizi ──────────────────────────────────────────────────────────

@app.post("/analyze")
async def analyze_image(
    file: UploadFile = File(...),
    conf: float = Form(default=0.35),
):
    ext = Path(file.filename).suffix or ".jpg"
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    save_path = UPLOAD_DIR / f"upload_{ts}{ext}"

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        detection = analyzer.analyze_image(str(save_path), conf=conf)
        return {
            "detected": detection["detected"],
            "annotated_image": detection["annotated_image"],
            "total_items": detection["total_items"],
            "image_path": str(save_path),
            "image_filename": file.filename,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analyze/camera")
async def analyze_camera_frame():
    frame = camera_manager.get_frame()
    if frame is None:
        raise HTTPException(status_code=400, detail="Kamera aktif değil veya kare alınamadı.")

    detection = analyzer.analyze_frame(frame)
    return {
        "detected": detection["detected"],
        "annotated_image": detection["annotated_image"],
        "total_items": detection["total_items"],
        "image_path": "camera",
        "image_filename": "camera_frame.jpg",
    }


# ─── Kamera ──────────────────────────────────────────────────────────────────

@app.post("/camera/start")
def start_camera(source: str = Form(default="0")):
    src = int(source) if source.isdigit() else source
    ok = camera_manager.start(src)
    if not ok:
        raise HTTPException(status_code=500, detail="Kamera açılamadı. Bağlı kamera var mı?")
    return {"active": True, "source": str(src), "fps": camera_manager.fps}


@app.post("/camera/stop")
def stop_camera():
    camera_manager.stop()
    return {"active": False}


@app.get("/camera/status")
def camera_status():
    return {
        "active": camera_manager.active,
        "source": str(camera_manager.source),
        "fps": round(camera_manager.fps, 1),
    }


@app.get("/camera/stream")
def camera_stream():
    if not camera_manager.active:
        raise HTTPException(status_code=400, detail="Kamera aktif değil.")
    return StreamingResponse(
        camera_manager.generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
