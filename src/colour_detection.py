import sys
import cv2
import numpy as np

# ==========================================
# IP CAMERA COLOUR DETECTION & COUNTER
# ==========================================
# Run from terminal:
# python colour_detection.py
# Or with specific IP URL:
# python colour_detection.py http://100.109.243.57:8080/video

camera_url = "http://100.109.243.57:8080/video"
if len(sys.argv) > 1:
    camera_url = sys.argv[1]

print(f"[*] Connecting to IP Camera: {camera_url}")
cap = cv2.VideoCapture(camera_url)

if not cap.isOpened():
    print(f"[!] Warning: Could not connect to {camera_url}.")
    print("[*] Trying local webcam (0) as fallback...")
    cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("[X] Error: Could not open any camera. Please ensure IP Webcam is running.")
    sys.exit(1)

print("[+] Camera connected successfully!")
print("[*] Tracking RED, GREEN, and BLUE objects.")
print("[*] Press 'Q' to quit.\n")

# Morphological kernel for noise removal
kernel = np.ones((5, 5), np.uint8)

# Debounced object counting tally (No yellow / only RED, GREEN, BLUE)
counts = {"RED": 0, "GREEN": 0, "BLUE": 0}
tracking_color = None
consecutive_frames = 0
cooldown_frames = 0
counted_current = False

while True:
    ret, frame = cap.read()
    if not ret:
        print("[!] Frame not received. Reconnecting...")
        cv2.waitKey(500)
        continue

    frame = cv2.resize(frame, (640, 480))
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # ------------------------------------
    # HSV COLOR RANGES
    # ------------------------------------
    # RED (wraps around 0/180)
    red1 = cv2.inRange(hsv, np.array([0, 100, 80]), np.array([10, 255, 255]))
    red2 = cv2.inRange(hsv, np.array([170, 100, 80]), np.array([180, 255, 255]))
    red_mask = red1 | red2

    # GREEN
    green_mask = cv2.inRange(hsv, np.array([35, 75, 70]), np.array([85, 255, 255]))

    # BLUE
    blue_mask = cv2.inRange(hsv, np.array([90, 75, 70]), np.array([135, 255, 255]))

    # Clean noise
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
    detected_box = None
    detected_center = None
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

    # ------------------------------------
    # FUNCTIONAL COUNTING LOGIC (DEBOUNCED)
    # ------------------------------------
    if detected_color is not None:
        if tracking_color == detected_color:
            consecutive_frames += 1
        else:
            tracking_color = detected_color
            consecutive_frames = 1
            counted_current = False

        cooldown_frames = 0

        # Confirm after 4 consecutive frames and count once per object
        if consecutive_frames >= 4 and not counted_current:
            counts[detected_color] += 1
            counted_current = True
            print(f">>> [COUNT +1] {detected_color}! Tally: {counts}")

        # Draw bounding box & coordinates
        x, y, w, h = detected_box
        cx, cy = detected_center
        cv2.rectangle(frame, (x, y), (x + w, y + h), box_color, 3)
        cv2.circle(frame, (cx, cy), 7, (255, 255, 255), -1)

        label = f"{detected_color} | X:{cx} Y:{cy} Area:{int(detected_area)}"
        cv2.rectangle(frame, (x, max(0, y - 28)), (x + 220, max(24, y)), (0, 0, 0), -1)
        cv2.putText(frame, label, (x + 6, max(18, y - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
    else:
        cooldown_frames += 1
        if cooldown_frames > 12:
            tracking_color = None
            consecutive_frames = 0
            counted_current = False

    # Top banner with live tally (RED, GREEN, BLUE only - no yellow)
    banner = f"RED: {counts['RED']}  |  GREEN: {counts['GREEN']}  |  BLUE: {counts['BLUE']}"
    cv2.rectangle(frame, (0, 0), (640, 36), (15, 15, 18), -1)
    cv2.putText(frame, banner, (18, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (240, 240, 240), 2)

    cv2.imshow("Color Detection & Tally", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()

