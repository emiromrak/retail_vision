from ultralytics import YOLO
import cv2
import numpy as np
import base64
from pathlib import Path
import os

MODEL_PATH = Path(__file__).parent / "yolov8n.pt"

# Color palette for bounding boxes
COLORS = [
    (0, 255, 136), (0, 200, 255), (255, 100, 0), (255, 0, 150),
    (150, 0, 255), (0, 255, 200), (255, 200, 0), (0, 150, 255),
]


class RetailAnalyzer:
    def __init__(self):
        self.model = YOLO(str(MODEL_PATH))
        self._color_map = {}

    def _get_color(self, name: str):
        if name not in self._color_map:
            idx = len(self._color_map) % len(COLORS)
            self._color_map[name] = COLORS[idx]
        return self._color_map[name]

    def analyze_image(self, image_path: str, conf: float = 0.35) -> dict:
        """Analyze image and return detection results with annotated image."""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Görsel bulunamadı: {image_path}")

        img = cv2.imread(image_path)
        if img is None:
            raise ValueError("Görsel okunamadı.")

        return self._run_detection(img, conf)

    def analyze_frame(self, frame: np.ndarray, conf: float = 0.35) -> dict:
        """Analyze a raw OpenCV frame (for camera mode)."""
        return self._run_detection(frame, conf)

    def _run_detection(self, img: np.ndarray, conf: float) -> dict:
        results = self.model(img, conf=conf, verbose=False)

        stok_durumu = {}
        annotated = img.copy()

        boxes = results[0].boxes
        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])
                name = self.model.names[class_id]
                stok_durumu[name] = stok_durumu.get(name, 0) + 1

                # Draw bounding box
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                color = self._get_color(name)
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

                # Label background
                label = f"{name} {confidence:.2f}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
                cv2.rectangle(annotated, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
                cv2.putText(annotated, label, (x1 + 2, y1 - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1)

        # Encode to base64
        _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
        img_b64 = base64.b64encode(buffer).decode("utf-8")

        return {
            "detected": stok_durumu,
            "annotated_image": img_b64,
            "total_items": sum(stok_durumu.values()),
        }

    def compute_stock_status(self, detected: dict, products: list) -> dict:
        """
        Compare detected items against product critical levels.
        Returns enriched status per product.
        """
        product_map = {p.name: p for p in products if p.active}
        items = []
        missing = []

        for product in products:
            if not product.active:
                continue
            count = detected.get(product.name, 0)
            crit = product.critical_level
            total = sum(detected.values()) or 1
            pct = round(count / total * 100, 1)

            if count == 0:
                status = "KRITIK"
                missing.append(product.name)
            elif count < crit:
                status = "EKSIK"
                missing.append(product.name)
            else:
                status = "OK"

            items.append({
                "name": product.name,
                "display_name": product.display_name,
                "count": count,
                "critical_level": crit,
                "status": status,
                "percentage": pct,
            })

        # Also include detected items NOT in product list
        for name, count in detected.items():
            if name not in product_map:
                items.append({
                    "name": name,
                    "display_name": name.capitalize(),
                    "count": count,
                    "critical_level": 0,
                    "status": "IZLENMEZ",
                    "percentage": round(count / (sum(detected.values()) or 1) * 100, 1),
                })

        return {"items": items, "missing": missing}


# Singleton instance
analyzer = RetailAnalyzer()
