import sys
import cv2

# Pass camera index or URL via command line argument:
# Example: python camera_test.py 0
# Example: python camera_test.py http://192.168.1.100:8080/video
camera_source = 0
if len(sys.argv) > 1:
    arg = sys.argv[1]
    camera_source = int(arg) if arg.isdigit() else arg

print(f"Testing connection to camera: {camera_source}")
cap = cv2.VideoCapture(camera_source)

if not cap.isOpened() and isinstance(camera_source, str):
    print(f"Could not open {camera_source}. Trying default webcam (0)...")
    cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Camera connection failed! Check device index or IP URL.")
    exit(1)

print("Camera connected successfully! Press 'Q' in the window to quit.")

while True:
    ret, frame = cap.read()
    if not ret:
        print("Failed to receive frame.")
        break

    cv2.imshow("Camera Test Feed", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()