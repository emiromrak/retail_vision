import cv2
import threading
import time
import base64
import numpy as np
from typing import Optional, Generator


class CameraManager:
    def __init__(self):
        self.cap: Optional[cv2.VideoCapture] = None
        self.active = False
        self.source = 0  # default webcam
        self.lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._thread: Optional[threading.Thread] = None
        self.fps = 0.0
        self._frame_count = 0
        self._last_fps_time = time.time()

    def start(self, source=0) -> bool:
        """Start camera capture. source=0 for webcam, or URL string for IP cam."""
        if self.active:
            return True

        self.source = source
        # Windows'ta kamera açılış sorunlarını çözmek için cv2.CAP_DSHOW ekleyelim
        if isinstance(source, int) or str(source).isdigit():
            src_int = int(source)
            self.cap = cv2.VideoCapture(src_int, cv2.CAP_DSHOW)
            if not self.cap.isOpened():
                self.cap = cv2.VideoCapture(src_int)  # Fallback to default
        else:
            self.cap = cv2.VideoCapture(source)

        if not self.cap.isOpened():
            return False

        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        self.cap.set(cv2.CAP_PROP_FPS, 30)

        self.active = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        return True

    def stop(self):
        """Stop camera capture."""
        self.active = False
        if self._thread:
            self._thread.join(timeout=2)
        if self.cap:
            self.cap.release()
            self.cap = None
        self._frame = None

    def _capture_loop(self):
        while self.active:
            ret, frame = self.cap.read()
            if ret:
                with self.lock:
                    self._frame = frame
                # FPS calculation
                self._frame_count += 1
                elapsed = time.time() - self._last_fps_time
                if elapsed >= 1.0:
                    self.fps = self._frame_count / elapsed
                    self._frame_count = 0
                    self._last_fps_time = time.time()
            else:
                time.sleep(0.05)

    def get_frame(self) -> Optional[np.ndarray]:
        with self.lock:
            return self._frame.copy() if self._frame is not None else None

    def get_frame_base64(self) -> Optional[str]:
        frame = self.get_frame()
        if frame is None:
            return None
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return base64.b64encode(buf).decode("utf-8")

    def generate_mjpeg(self) -> Generator[bytes, None, None]:
        """Generate MJPEG stream bytes."""
        while self.active:
            frame = self.get_frame()
            if frame is not None:
                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
                )
            time.sleep(0.033)  # ~30fps


camera_manager = CameraManager()
