import sys
import time
import json
import cv2
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread, Lock
from urllib.parse import parse_qs, urlparse

# Global state
state_lock = Lock()
latest_frame = None
camera_source = "http://10.233.5.162:8080/video"
cap = None
cap_running = True

# Detection & Statistics State
detection_state = {
    "detected_color": None,
    "confidence": 0,
    "x": 0,
    "y": 0,
    "area": 0,
    "camera_connected": False,
    "camera_url": camera_source,
    "counts": {
        "red": 0,
        "green": 0,
        "blue": 0,
        "total": 0
    }
}

# Object tracking debounce state
tracking = {
    "current_color": None,
    "consecutive_frames": 0,
    "cooldown_frames": 0,
    "counted_current_object": False
}

def set_camera(new_source):
    global camera_source, cap
    with state_lock:
        if new_source.isdigit():
            camera_source = int(new_source)
        else:
            camera_source = new_source
        detection_state["camera_url"] = str(camera_source)
        detection_state["camera_connected"] = False
        print(f"[*] Switching camera source to: {camera_source}")
        if cap is not None:
            cap.release()
            cap = None

# If CLI argument provided
if len(sys.argv) > 1:
    set_camera(sys.argv[1])

def capture_and_detect_loop():
    global latest_frame, cap, cap_running

    kernel = np.ones((5, 5), np.uint8)

    while cap_running:
        with state_lock:
            current_src = camera_source

        if cap is None or not cap.isOpened():
            print(f"[*] Attempting connection to: {current_src}...")
            new_cap = cv2.VideoCapture(current_src)
            # Short timeout / verify
            if not new_cap.isOpened():
                with state_lock:
                    detection_state["camera_connected"] = False
                # Generate offline placeholder frame
                placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(placeholder, "CONNECTING TO IP CAMERA...", (110, 220),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
                cv2.putText(placeholder, f"URL: {current_src}", (60, 260),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)
                cv2.putText(placeholder, "Make sure phone IP Webcam app is running", (90, 300),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (130, 130, 130), 1)
                _, jpeg = cv2.imencode('.jpg', placeholder, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                with state_lock:
                    latest_frame = jpeg.tobytes()
                time.sleep(1.0)
                continue
            else:
                cap = new_cap
                with state_lock:
                    detection_state["camera_connected"] = True
                print(f"[+] Successfully connected to camera: {current_src}")

        ret, frame = cap.read()
        if not ret:
            with state_lock:
                detection_state["camera_connected"] = False
            time.sleep(0.2)
            continue

        with state_lock:
            detection_state["camera_connected"] = True

        # Resize for consistent processing
        frame = cv2.resize(frame, (640, 480))

        # Convert BGR -> HSV
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        # RED masks (circular range)
        red_mask1 = cv2.inRange(hsv, np.array([0, 90, 80]), np.array([10, 255, 255]))
        red_mask2 = cv2.inRange(hsv, np.array([168, 90, 80]), np.array([180, 255, 255]))
        red_mask = red_mask1 | red_mask2

        # GREEN mask
        green_mask = cv2.inRange(hsv, np.array([35, 70, 70]), np.array([85, 255, 255]))

        # BLUE mask
        blue_mask = cv2.inRange(hsv, np.array([90, 70, 70]), np.array([135, 255, 255]))

        # Noise cleanup
        red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_OPEN, kernel)
        green_mask = cv2.morphologyEx(green_mask, cv2.MORPH_OPEN, kernel)
        blue_mask = cv2.morphologyEx(blue_mask, cv2.MORPH_OPEN, kernel)

        masks = {
            "RED": (red_mask, (0, 0, 255)),
            "GREEN": (green_mask, (0, 255, 0)),
            "BLUE": (blue_mask, (255, 120, 0))
        }

        detected_color = None
        detected_area = 0
        detected_center = None
        detected_box = None
        box_color = (255, 255, 255)

        for color_name, (mask, draw_color) in masks.items():
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < 800:
                    continue
                if area > detected_area:
                    detected_area = area
                    detected_color = color_name
                    box_color = draw_color
                    x, y, w, h = cv2.boundingRect(contour)
                    detected_center = (x + w // 2, y + h // 2)
                    detected_box = (x, y, w, h)

        # Update tracking & count logic
        with state_lock:
            if detected_color is not None:
                if tracking["current_color"] == detected_color:
                    tracking["consecutive_frames"] += 1
                else:
                    tracking["current_color"] = detected_color
                    tracking["consecutive_frames"] = 1
                    tracking["counted_current_object"] = False

                tracking["cooldown_frames"] = 0

                # Count object if present for 4 consecutive frames and not yet counted
                if tracking["consecutive_frames"] >= 4 and not tracking["counted_current_object"]:
                    key = detected_color.lower()
                    detection_state["counts"][key] += 1
                    detection_state["counts"]["total"] += 1
                    tracking["counted_current_object"] = True
                    print(f"[COUNT] Registered {detected_color}! Total: {detection_state['counts']['total']}")

                # Draw bounding box & coordinates on video stream
                x, y, w, h = detected_box
                cx, cy = detected_center
                cv2.rectangle(frame, (x, y), (x + w, y + h), box_color, 3)
                cv2.circle(frame, (cx, cy), 7, (255, 255, 255), -1)

                # Label background & text
                label = f"{detected_color} | X:{cx} Y:{cy}"
                cv2.rectangle(frame, (x, max(0, y - 28)), (x + 175, max(24, y)), (0, 0, 0), -1)
                cv2.putText(frame, label, (x + 5, max(18, y - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

                confidence = min(99, int((detected_area / 15000) * 100))
                detection_state["detected_color"] = detected_color
                detection_state["confidence"] = max(70, confidence)
                detection_state["x"] = cx
                detection_state["y"] = cy
                detection_state["area"] = int(detected_area)

            else:
                tracking["cooldown_frames"] += 1
                # If no object detected for 12 frames (~0.4s), reset tracking
                if tracking["cooldown_frames"] > 12:
                    tracking["current_color"] = None
                    tracking["consecutive_frames"] = 0
                    tracking["counted_current_object"] = False

                detection_state["detected_color"] = None
                detection_state["confidence"] = 0
                detection_state["x"] = 0
                detection_state["y"] = 0
                detection_state["area"] = 0

            # Draw live stats overlay on the top banner of the frame
            counts = detection_state["counts"]
            banner = f"RED: {counts['red']} | GREEN: {counts['green']} | BLUE: {counts['blue']} | TOTAL: {counts['total']}"
            cv2.rectangle(frame, (0, 0), (640, 32), (15, 20, 28), -1)
            cv2.putText(frame, banner, (15, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 180), 2)

        # Encode frame as JPEG
        _, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        with state_lock:
            latest_frame = jpeg.tobytes()

        time.sleep(0.025)

class APIHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == '/video_feed':
            self.send_response(200)
            self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=--jpgboundary')
            self.end_headers()
            while True:
                with state_lock:
                    frame = latest_frame
                if frame is not None:
                    try:
                        self.wfile.write(b"--jpgboundary\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n\r\n")
                        self.wfile.write(frame)
                        self.wfile.write(b"\r\n")
                    except (BrokenPipeError, ConnectionResetError):
                        break
                time.sleep(0.035)

        elif parsed.path == '/api/detection':
            with state_lock:
                data = dict(detection_state)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))

        elif parsed.path == '/api/set_camera':
            params = parse_qs(parsed.query)
            if 'url' in params:
                new_url = params['url'][0]
                set_camera(new_url)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "url": new_url}).encode('utf-8'))
            else:
                self.send_response(400)
                self.end_headers()

        elif parsed.path == '/api/reset_counts':
            with state_lock:
                detection_state["counts"] = {"red": 0, "green": 0, "blue": 0, "total": 0}
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "reset_success"}).encode('utf-8'))

        else:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            with state_lock:
                info = {
                    "service": "ColorSort AI Vision Server",
                    "camera_url": str(camera_source),
                    "connected": detection_state["camera_connected"]
                }
            self.wfile.write(json.dumps(info).encode('utf-8'))

    def do_POST(self):
        parsed = urlparse(self.path)
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8') if content_len > 0 else ""

        if parsed.path == '/api/set_camera':
            try:
                data = json.loads(body) if body else {}
                new_url = data.get("url")
                if new_url:
                    set_camera(new_url)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok", "url": new_url}).encode('utf-8'))
                    return
            except Exception as e:
                print("Error parsing set_camera:", e)

            self.send_response(400)
            self.end_headers()

        elif parsed.path == '/api/reset_counts':
            with state_lock:
                detection_state["counts"] = {"red": 0, "green": 0, "blue": 0, "total": 0}
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "reset_success"}).encode('utf-8'))

        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return

def run_server(port=5000):
    server = HTTPServer(('0.0.0.0', port), APIHandler)
    print(f"\n==================================================================")
    print(f"  ColorSort AI Vision Server Online on port {port}")
    print(f"  Camera Source: {camera_source}")
    print(f"  Live Annotated Stream: http://localhost:{port}/video_feed")
    print(f"  Real-Time Telemetry API: http://localhost:{port}/api/detection")
    print(f"==================================================================\n")
    server.serve_forever()

if __name__ == '__main__':
    t = Thread(target=capture_and_detect_loop, daemon=True)
    t.start()
    run_server(5000)
