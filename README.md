# 🤖 Robotic Arm – Pick & Colour Sort

An automated robotic arm system that uses **computer vision and OpenCV** to detect the colour of an object, pick it up, and place it in the corresponding sorting location.

The project combines **robotics, computer vision, image processing, and embedded control** to create an automated colour-based sorting system.

---

## 📌 Project Overview

Manual sorting of objects based on colour is repetitive and time-consuming.

This project aims to automate the process using:

* 📷 Camera for real-time image acquisition
* 👁️ OpenCV for colour detection
* 🎨 HSV colour segmentation
* 🤖 Robotic arm for object manipulation
* ⚙️ Servo motors for arm movement
* 🧠 Python for computer vision and control logic

### Basic Workflow

```text
             Camera
                │
                ▼
        ┌─────────────────┐
        │  Capture Image  │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Convert to HSV  │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Colour Detection│
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Object Detection│
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Robotic Arm     │
        │ Pick Object     │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Sort by Colour  │
        └─────────────────┘
```

---

## 🎯 Objectives

1. Detect objects using a camera.
2. Identify the colour of each object.
3. Locate the object in the camera frame.
4. Determine the required robotic arm movement.
5. Pick the detected object.
6. Move the object to its corresponding colour zone.
7. Release the object.
8. Repeat the process automatically.

---

## 🛠️ Technologies Used

| Technology           | Purpose                       |
| -------------------- | ----------------------------- |
| Python               | Main programming language     |
| OpenCV               | Computer vision               |
| NumPy                | Image/matrix processing       |
| HSV                  | Colour segmentation           |
| Arduino/ESP32        | Robotic arm control           |
| Servo Motors         | Arm movement                  |
| Camera               | Object detection              |
| Serial Communication | PC ↔ Controller communication |

---

## 🔍 Computer Vision

The camera continuously captures frames of the workspace.

The image is converted from **BGR to HSV** because HSV makes colour segmentation easier than directly working with RGB/BGR values.

```python
hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
```

A colour mask is then generated using HSV thresholds.

For example:

```python
mask = cv2.inRange(hsv, lower_color, upper_color)
```

The mask isolates the required colour from the background.

### Example Processing Pipeline

```text
Camera Frame
     ↓
BGR Image
     ↓
HSV Conversion
     ↓
Colour Threshold
     ↓
Binary Mask
     ↓
Contour Detection
     ↓
Object Centre
     ↓
Robotic Arm Command
```

---

## 🎨 Colour Detection

The system can be configured to detect multiple colours such as:

* 🔴 Red
* 🟢 Green
* 🔵 Blue
* 🟡 Yellow

Each colour has its own HSV range.

Example:

```python
lower_red = np.array([0, 100, 100])
upper_red = np.array([10, 255, 255])

mask = cv2.inRange(hsv, lower_red, upper_red)
```

The thresholds can be adjusted depending on:

* Lighting conditions
* Camera
* Object colour
* Background colour
* Camera exposure

---

## 📷 Camera Setup

The project can use a camera stream as the computer vision input.

Example:

```python
url = "http://192.168.1.7:8080/video"

cap = cv2.VideoCapture(url)
```

The program continuously reads frames:

```python
while True:

    ret, frame = cap.read()

    if not ret:
        break
```

This allows a phone camera or network camera stream to be used as the vision sensor.

---

## 🧩 Object Detection

After generating the colour mask, contours can be detected.

```python
contours, _ = cv2.findContours(
    mask,
    cv2.RETR_EXTERNAL,
    cv2.CHAIN_APPROX_SIMPLE
)
```

The largest valid contour can be selected as the detected object.

The object's centre can then be calculated:

```python
M = cv2.moments(contour)

cx = int(M["m10"] / M["m00"])
cy = int(M["m01"] / M["m00"])
```

The `(cx, cy)` coordinates represent the object's position in the camera image.

---

## 🤖 Robotic Arm

The robotic arm consists of multiple degrees of freedom controlled using servo motors.

A typical configuration can include:

```text
        Gripper
           │
        Wrist
           │
          Arm
           │
         Elbow
           │
         Base
```

Possible servo configuration:

| Servo   | Function      |
| ------- | ------------- |
| Servo 1 | Base rotation |
| Servo 2 | Shoulder      |
| Servo 3 | Elbow         |
| Servo 4 | Wrist         |
| Servo 5 | Gripper       |

The exact number of servos depends on the arm design.

---

## 🔄 Pick-and-Sort Process

The complete operation follows these steps:

### 1. Detect object

The camera scans the workspace.

### 2. Identify colour

OpenCV determines the object's colour using HSV segmentation.

### 3. Locate object

The centre coordinates of the object are calculated.

### 4. Calculate arm position

The image coordinates are converted into the corresponding robotic-arm position.

### 5. Move to object

The arm moves towards the detected object.

### 6. Pick

The gripper closes around the object.

### 7. Move to sorting area

The arm moves to the location assigned to that colour.

### 8. Release

The gripper opens.

### 9. Repeat

The system returns to the detection position and searches for the next object.

---

## 🧠 System Architecture

```text
             ┌─────────────┐
             │   Camera    │
             └──────┬──────┘
                    │
                    ▼
          ┌──────────────────┐
          │ Python + OpenCV  │
          │                  │
          │ HSV Detection     │
          │ Object Detection  │
          │ Position Tracking │
          └────────┬─────────┘
                   │
             Serial / Wi-Fi
                   │
                   ▼
          ┌──────────────────┐
          │ Arduino / ESP32  │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │ Servo Controllers│
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │  Robotic Arm     │
          └────────┬─────────┘
                   │
                   ▼
             Pick & Sort
```

---

## 📁 Project Structure

```text
robotic-arm-colour-sort/
│
├── python/
│   ├── color_detection.py
│   ├── object_detection.py
│   └── main.py
│
├── arduino/
│   └── robotic_arm.ino
│
├── images/
│   └── mask_example.png
│
├── README.md
│
└── requirements.txt
```

---

## 📦 Requirements

Install the required Python libraries:

```bash
pip install opencv-python numpy
```

Or:

```bash
pip install -r requirements.txt
```

Example `requirements.txt`:

```text
opencv-python
numpy
```

---

## ▶️ Running the Project

### Step 1 – Clone the repository

```bash
git clone https://github.com/yourusername/robotic-arm-colour-sort.git
```

### Step 2 – Enter the project directory

```bash
cd robotic-arm-colour-sort
```

### Step 3 – Install dependencies

```bash
pip install -r requirements.txt
```

### Step 4 – Configure the camera

Update the camera URL inside the Python program:

```python
url = "YOUR_CAMERA_STREAM_URL"
```

### Step 5 – Run the vision system

```bash
python main.py
```

### Step 6 – Start the robotic arm controller

Upload the Arduino/ESP32 code and connect the controller.

---

## ⚙️ Current Development Status

### ✅ Completed

* Camera stream acquisition
* OpenCV image processing
* BGR → HSV conversion
* Colour masking
* Initial colour detection
* Mask visualization
* Object detection development

### 🚧 In Progress

* Reliable contour detection
* Object centre calculation
* Camera-to-arm coordinate mapping
* Servo movement control
* Pick mechanism
* Colour-specific sorting positions
* Complete automation

### 🔮 Future Improvements

* Multiple colour classification
* Automatic camera calibration
* Inverse kinematics
* Object tracking
* Improved lighting compensation
* Multiple object detection
* Conveyor-belt integration
* Real-time GUI
* AI-based object classification
* Autonomous calibration

---

## ⚠️ Challenges

### Lighting

Different lighting conditions can change the detected HSV values.

**Solution:** Use controlled lighting and tune HSV thresholds.

### Camera Perspective

The camera coordinates do not directly correspond to robotic-arm coordinates.

**Solution:** Perform camera calibration and coordinate transformation.

### Servo Accuracy

Servo motors may have mechanical errors and backlash.

**Solution:** Calibrate servo angles and use controlled movement.

### Object Position

Objects may appear at different locations in the workspace.

**Solution:** Use object-centre detection and coordinate mapping.

---

## 📊 Expected Result

The final system should be capable of performing:

```text
Detect → Identify → Locate → Pick → Move → Sort → Repeat
```

For example:

```text
🔴 Red Object  → Red Bin
🟢 Green Object → Green Bin
🔵 Blue Object  → Blue Bin
🟡 Yellow Object → Yellow Bin
```

---

## 🎓 Project Applications

This system demonstrates concepts used in industrial automation and can be extended to applications such as:

* Automated manufacturing
* Warehouse automation
* Recycling systems
* Quality inspection
* Industrial sorting
* Pick-and-place robots
* Smart conveyor systems

---

## 👨‍💻 Project

**Robotic Arm – Pick & Colour Sort**

Developed using:

**Python + OpenCV + Arduino/ESP32 + Servo Motors**

---

## 📜 License

This project is intended for educational and research purposes.
