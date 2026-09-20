import { useState, useEffect, useRef } from "react";
import "./App.css";

// ==========================================
// FAST RGB TO HSV CONVERSION ALGORITHM
// ==========================================
function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, v * 100];
}

function App() {
  // IP Camera Address
  const [ipUrl, setIpUrl] = useState("http://100.109.243.57:8080/video");
  const [activeStreamUrl, setActiveStreamUrl] = useState("");
  const [cameraConnected, setCameraConnected] = useState(false);
  const [testMode, setTestMode] = useState(false);

  // Live Detection Telemetry
  const [detectedData, setDetectedData] = useState({
    color: null,
    confidence: 0,
    x: 0,
    y: 0,
    area: 0,
  });

  // Functional Counters (RED, GREEN, BLUE ONLY - NO YELLOW)
  const [counts, setCounts] = useState({
    red: 0,
    green: 0,
    blue: 0,
  });

  // ==========================================
  // SERIAL COMMUNICATION (ESP32 via PySerial / Web Serial)
  // ==========================================
  const [bridgeUrl] = useState("http://localhost:5001");
  const [availablePorts, setAvailablePorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [isSerialConnected, setIsSerialConnected] = useState(false);
  const [activeCommand, setActiveCommand] = useState(null);
  const [serialLogs, setSerialLogs] = useState([
    "Ready. Connect ESP32 to send serial commands.",
  ]);
  const [autoSerialTrigger, setAutoSerialTrigger] = useState(false);

  // Web Serial API Reference
  const webSerialPortRef = useRef(null);
  const webSerialWriterRef = useRef(null);
  const lastAutoSendTimeRef = useRef(0);

  // References for Canvas & Tracking
  const hiddenImgRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const procCanvasRef = useRef(null);
  const animFrameId = useRef(null);

  // Object Tracking Debounce State
  const trackingRef = useRef({
    color: null,
    consecutiveFrames: 0,
    cooldownFrames: 0,
    counted: false,
  });

  // Synthetic Test Item generator
  const testItemRef = useRef({
    x: -50,
    y: 220,
    r: 32,
    color: "RED",
    speed: 3,
  });

  // Append a serial log
  const pushSerialLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setSerialLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // Connect / Update IP Camera
  const handleConnectCamera = (urlToUse) => {
    const target = urlToUse || ipUrl;
    if (!target) return;
    const proxyUrl = `/camera-proxy?url=${encodeURIComponent(target)}`;
    setActiveStreamUrl(proxyUrl);
    setCameraConnected(true);
    setTestMode(false);
  };

  // Connect on initial load
  useEffect(() => {
    handleConnectCamera(ipUrl);
  }, []);

  // Reset Counters
  const handleResetCounts = () => {
    setCounts({ red: 0, green: 0, blue: 0 });
    trackingRef.current = {
      color: null,
      consecutiveFrames: 0,
      cooldownFrames: 0,
      counted: false,
    };
  };

  // ==========================================
  // PYSERIAL BRIDGE: REFRESH & POLL STATUS
  // ==========================================
  const refreshPorts = async () => {
    try {
      const res = await fetch(`${bridgeUrl}/api/ports`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        const ports = await res.json();
        setAvailablePorts(ports);
        if (ports.length > 0 && !selectedPort) {
          setSelectedPort(ports[0].port);
        }
      }
    } catch {
      // Bridge not running yet
    }
  };

  const connectBridgeSerial = async () => {
    if (!selectedPort) {
      alert("Please select or enter a COM port (e.g. COM3)");
      return;
    }
    try {
      const res = await fetch(`${bridgeUrl}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: selectedPort }),
      });
      const data = await res.json();
      if (data.success) {
        setIsSerialConnected(true);
        pushSerialLog(`PySerial connected to ${selectedPort} @ 115200 baud`);
      } else {
        pushSerialLog(`PySerial error: ${data.message}`);
      }
    } catch {
      pushSerialLog("Could not reach serial_bridge.py on localhost:5001. Run 'python serial_bridge.py'");
    }
  };

  const disconnectBridgeSerial = async () => {
    // If Web Serial connected
    if (webSerialPortRef.current) {
      try {
        if (webSerialWriterRef.current) {
          await webSerialWriterRef.current.close();
        }
        await webSerialPortRef.current.close();
      } catch (err) {
        console.error(err);
      }
      webSerialPortRef.current = null;
      webSerialWriterRef.current = null;
      setIsSerialConnected(false);
      pushSerialLog("Web Serial disconnected");
      return;
    }

    try {
      await fetch(`${bridgeUrl}/api/disconnect`, { method: "POST" });
      setIsSerialConnected(false);
      pushSerialLog("PySerial disconnected");
    } catch {
      setIsSerialConnected(false);
    }
  };

  // Browser Direct Web Serial API Fallback
  const connectBrowserWebSerial = async () => {
    if (!("serial" in navigator)) {
      alert("Web Serial API is not supported in this browser. Use PySerial with 'python serial_bridge.py'");
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      webSerialPortRef.current = port;
      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(port.writable);
      webSerialWriterRef.current = textEncoder.writable.getWriter();
      setIsSerialConnected(true);
      pushSerialLog("Web Serial connected directly @ 115200 baud");

      // Read responses in background
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.trim()) {
              pushSerialLog(`ESP32: ${value.trim()}`);
            }
          }
        } catch (e) {
          console.log("Read complete/closed", e);
        }
      })();
    } catch (err) {
      pushSerialLog(`Web Serial error: ${err.message}`);
    }
  };

  // Send one of the 4 Commands: start, check, red, green
  const sendSerialCommand = async (cmd) => {
    const cleanCmd = cmd.toLowerCase().trim();
    setActiveCommand(cleanCmd);
    setTimeout(() => setActiveCommand(null), 800);

    pushSerialLog(`Sending command -> '${cleanCmd}'`);

    // 1. If Web Serial is active
    if (webSerialWriterRef.current) {
      try {
        await webSerialWriterRef.current.write(`${cleanCmd}\n`);
        return;
      } catch (err) {
        pushSerialLog(`Web Serial send failed: ${err.message}`);
      }
    }

    // 2. Otherwise send via PySerial Bridge
    try {
      const res = await fetch(`${bridgeUrl}/api/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cleanCmd }),
      });
      const data = await res.json();
      if (!data.success) {
        pushSerialLog(`Bridge error: ${data.message}`);
      }
    } catch {
      pushSerialLog("PySerial Bridge offline. Start it with: python serial_bridge.py");
    }
  };

  // Poll PySerial bridge for ports and incoming logs
  useEffect(() => {
    refreshPorts();
    const interval = setInterval(async () => {
      if (webSerialPortRef.current) return;
      try {
        const res = await fetch(`${bridgeUrl}/api/status`, { signal: AbortSignal.timeout(600) });
        if (res.ok) {
          const data = await res.json();
          setIsSerialConnected(data.connected);
          if (data.port) setSelectedPort(data.port);
          if (data.logs && data.logs.length > 0) {
            setSerialLogs(data.logs.slice(-10).reverse());
          }
        }
      } catch {
        // bridge offline
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [bridgeUrl]);

  // ==========================================
  // REAL-TIME ZERO-LAG HSV DETECTION ENGINE
  // ==========================================
  useEffect(() => {
    const displayCanvas = displayCanvasRef.current;
    if (!displayCanvas) return;
    const displayCtx = displayCanvas.getContext("2d");

    const procCanvas = procCanvasRef.current || document.createElement("canvas");
    procCanvas.width = 320;
    procCanvas.height = 240;
    procCanvasRef.current = procCanvas;
    const procCtx = procCanvas.getContext("2d", { willReadFrequently: true });

    const procWidth = procCanvas.width;
    const procHeight = procCanvas.height;
    const dispWidth = displayCanvas.width;
    const dispHeight = displayCanvas.height;

    const runDetection = () => {
      let frameDrawn = false;

      // SOURCE 1: TEST MODE
      if (testMode) {
        frameDrawn = true;
        setCameraConnected(true);
        procCtx.fillStyle = "#0c1218";
        procCtx.fillRect(0, 0, procWidth, procHeight);
        displayCtx.fillStyle = "#0c1218";
        displayCtx.fillRect(0, 0, dispWidth, dispHeight);

        const item = testItemRef.current;
        item.x += item.speed;
        if (item.x > dispWidth + 60) {
          item.x = -60;
          const colors = ["RED", "GREEN", "BLUE"];
          item.color = colors[Math.floor(Math.random() * colors.length)];
        }

        const drawItem = (ctx, scale) => {
          ctx.beginPath();
          ctx.arc(item.x * scale, item.y * scale, item.r * scale, 0, Math.PI * 2);
          ctx.fillStyle = item.color === "RED" ? "#ef4444" : item.color === "GREEN" ? "#22c55e" : "#3b82f6";
          ctx.fill();
        };
        drawItem(displayCtx, 1.0);
        drawItem(procCtx, procWidth / dispWidth);
      }
      // SOURCE 2: LIVE IP CAMERA
      else if (hiddenImgRef.current && hiddenImgRef.current.complete && hiddenImgRef.current.naturalWidth > 0) {
        try {
          displayCtx.drawImage(hiddenImgRef.current, 0, 0, dispWidth, dispHeight);
          procCtx.drawImage(hiddenImgRef.current, 0, 0, procWidth, procHeight);
          frameDrawn = true;
        } catch {
          // ignore
        }
      }

      if (frameDrawn) {
        const frameData = procCtx.getImageData(0, 0, procWidth, procHeight).data;

        let redSumX = 0, redSumY = 0, redCount = 0;
        let greenSumX = 0, greenSumY = 0, greenCount = 0;
        let blueSumX = 0, blueSumY = 0, blueCount = 0;

        let redMinX = procWidth, redMaxX = 0, redMinY = procHeight, redMaxY = 0;
        let greenMinX = procWidth, greenMaxX = 0, greenMinY = procHeight, greenMaxY = 0;
        let blueMinX = procWidth, blueMaxX = 0, blueMinY = procHeight, blueMaxY = 0;

        for (let y = 0; y < procHeight; y += 2) {
          for (let x = 0; x < procWidth; x += 2) {
            const idx = (y * procWidth + x) * 4;
            const r = frameData[idx];
            const g = frameData[idx + 1];
            const b = frameData[idx + 2];

            const [h, s, v] = rgbToHsv(r, g, b);

            // RED
            if (((h >= 0 && h <= 14) || (h >= 340 && h <= 360)) && s >= 45 && v >= 35) {
              redCount++;
              redSumX += x;
              redSumY += y;
              if (x < redMinX) redMinX = x;
              if (x > redMaxX) redMaxX = x;
              if (y < redMinY) redMinY = y;
              if (y > redMaxY) redMaxY = y;
            }
            // GREEN
            else if (h >= 75 && h <= 165 && s >= 35 && v >= 30) {
              greenCount++;
              greenSumX += x;
              greenSumY += y;
              if (x < greenMinX) greenMinX = x;
              if (x > greenMaxX) greenMaxX = x;
              if (y < greenMinY) greenMinY = y;
              if (y > greenMaxY) greenMaxY = y;
            }
            // BLUE
            else if (h >= 190 && h <= 255 && s >= 40 && v >= 30) {
              blueCount++;
              blueSumX += x;
              blueSumY += y;
              if (x < blueMinX) blueMinX = x;
              if (x > blueMaxX) blueMaxX = x;
              if (y < blueMinY) blueMinY = y;
              if (y > blueMaxY) blueMaxY = y;
            }
          }
        }

        const redArea = redCount * 4;
        const greenArea = greenCount * 4;
        const blueArea = blueCount * 4;

        let detected = null;
        const minPixelThreshold = 350;

        if (redArea > minPixelThreshold && redArea > greenArea && redArea > blueArea) {
          detected = {
            color: "RED",
            area: redArea,
            box: {
              x: redMinX,
              y: redMinY,
              w: Math.max(20, redMaxX - redMinX),
              h: Math.max(20, redMaxY - redMinY),
            },
            center: {
              x: Math.round(redSumX / redCount),
              y: Math.round(redSumY / redCount),
            },
          };
        } else if (greenArea > minPixelThreshold && greenArea > redArea && greenArea > blueArea) {
          detected = {
            color: "GREEN",
            area: greenArea,
            box: {
              x: greenMinX,
              y: greenMinY,
              w: Math.max(20, greenMaxX - greenMinX),
              h: Math.max(20, greenMaxY - greenMinY),
            },
            center: {
              x: Math.round(greenSumX / greenCount),
              y: Math.round(greenSumY / greenCount),
            },
          };
        } else if (blueArea > minPixelThreshold && blueArea > redArea && blueArea > greenArea) {
          detected = {
            color: "BLUE",
            area: blueArea,
            box: {
              x: blueMinX,
              y: blueMinY,
              w: Math.max(20, blueMaxX - blueMinX),
              h: Math.max(20, blueMaxY - blueMinY),
            },
            center: {
              x: Math.round(blueSumX / blueCount),
              y: Math.round(blueSumY / blueCount),
            },
          };
        }

        // DEBOUNCED COUNTING & AUTO-SERIAL TRIGGER
        const tracking = trackingRef.current;

        if (detected) {
          if (tracking.color === detected.color) {
            tracking.consecutiveFrames += 1;
          } else {
            tracking.color = detected.color;
            tracking.consecutiveFrames = 1;
            tracking.counted = false;
          }
          tracking.cooldownFrames = 0;

          if (tracking.consecutiveFrames >= 3 && !tracking.counted) {
            const key = detected.color.toLowerCase();
            setCounts((prev) => ({
              ...prev,
              [key]: prev[key] + 1,
            }));
            tracking.counted = true;

            // Auto-send command to ESP32 if enabled
            if (autoSerialTrigger) {
              const now = Date.now();
              if (now - lastAutoSendTimeRef.current > 4000) {
                if (detected.color === "RED") {
                  lastAutoSendTimeRef.current = now;
                  sendSerialCommand("red");
                } else if (detected.color === "GREEN") {
                  lastAutoSendTimeRef.current = now;
                  sendSerialCommand("green");
                }
              }
            }
          }

          const scaleX = dispWidth / procWidth;
          const scaleY = dispHeight / procHeight;
          const boxX = detected.box.x * scaleX;
          const boxY = detected.box.y * scaleY;
          const boxW = detected.box.w * scaleX;
          const boxH = detected.box.h * scaleY;
          const cx = Math.round(detected.center.x * scaleX);
          const cy = Math.round(detected.center.y * scaleY);

          displayCtx.strokeStyle =
            detected.color === "RED"
              ? "#ef4444"
              : detected.color === "GREEN"
              ? "#22c55e"
              : "#3b82f6";
          displayCtx.lineWidth = 3;
          displayCtx.strokeRect(boxX, boxY, boxW, boxH);

          displayCtx.fillStyle = "#ffffff";
          displayCtx.beginPath();
          displayCtx.arc(cx, cy, 6, 0, Math.PI * 2);
          displayCtx.fill();

          displayCtx.fillStyle = "rgba(0, 0, 0, 0.8)";
          displayCtx.fillRect(boxX, Math.max(0, boxY - 26), 170, 24);
          displayCtx.fillStyle = "#ffffff";
          displayCtx.font = "bold 13px monospace";
          displayCtx.fillText(
            `${detected.color} | X:${cx} Y:${cy}`,
            boxX + 6,
            Math.max(16, boxY - 9)
          );

          const confidence = Math.min(99, Math.max(68, Math.round((detected.area / 4000) * 100)));
          setDetectedData({
            color: detected.color,
            confidence,
            x: cx,
            y: cy,
            area: detected.area * 4,
          });
        } else {
          tracking.cooldownFrames += 1;
          if (tracking.cooldownFrames > 8) {
            tracking.color = null;
            tracking.consecutiveFrames = 0;
            tracking.counted = false;
          }

          setDetectedData({
            color: null,
            confidence: 0,
            x: 0,
            y: 0,
            area: 0,
          });
        }
      }

      animFrameId.current = requestAnimationFrame(runDetection);
    };

    animFrameId.current = requestAnimationFrame(runDetection);

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [testMode, autoSerialTrigger]);

  const getColorHex = (c) => {
    if (c === "RED") return "#ef4444";
    if (c === "GREEN") return "#22c55e";
    if (c === "BLUE") return "#3b82f6";
    return "#8b949e";
  };

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div>
          <h1>Color Sorting & Robot Controller</h1>
          <p>ESP32 Serial Command Station & Real-Time Color Tracking</p>
        </div>

        <div className="header-status-group">
          <div className="system-status">
            <span
              className={`status-dot ${cameraConnected ? "" : "disconnected"}`}
            ></span>
            {cameraConnected ? "CAMERA LIVE" : "CAMERA OFFLINE"}
          </div>

          <div className="system-status">
            <span
              className={`status-dot ${isSerialConnected ? "" : "disconnected"}`}
            ></span>
            {isSerialConnected ? "ESP32 CONNECTED" : "ESP32 OFFLINE"}
          </div>

          <button
            className={`test-toggle-btn ${testMode ? "active" : ""}`}
            onClick={() => {
              setTestMode(!testMode);
              if (!testMode) setCameraConnected(true);
            }}
          >
            {testMode ? "Exit Test Mode" : "🧪 Virtual Camera"}
          </button>
        </div>
      </header>

      {/* DASHBOARD GRID */}
      <main className="dashboard">
        {/* LEFT COLUMN: LIVE IP CAMERA FEED & PYSERIAL CONTROLS */}
        <section className="left-column">
          {/* CAMERA FEED */}
          <div className="card camera-card">
            <div className="card-header">
              <div>
                <h2>Live Camera Feed</h2>
                <p>HSV Color Segmentation (Phone IP Webcam)</p>
              </div>

              <div className="connection-status">
                <span
                  className={`status-dot ${cameraConnected ? "" : "disconnected"}`}
                ></span>
                {cameraConnected ? "STREAM ACTIVE" : "DISCONNECTED"}
              </div>
            </div>

            {/* IP CONFIGURATION BAR */}
            <div className="ip-config-bar">
              <label>IP Stream:</label>
              <input
                type="text"
                value={ipUrl}
                onChange={(e) => setIpUrl(e.target.value)}
                placeholder="http://100.109.243.57:8080/video"
              />
              <button className="connect-btn" onClick={() => handleConnectCamera(ipUrl)}>
                Connect
              </button>
            </div>

            {/* CAMERA VIEWPORT WITH CANVAS OVERLAY */}
            <div className="camera-container">
              {!testMode && activeStreamUrl && (
                <img
                  ref={hiddenImgRef}
                  src={activeStreamUrl}
                  alt="IP Camera Feed"
                  style={{ display: "none" }}
                  crossOrigin="anonymous"
                  onLoad={() => setCameraConnected(true)}
                  onError={() => setCameraConnected(false)}
                />
              )}

              <canvas
                ref={displayCanvasRef}
                width={640}
                height={420}
                className="camera-feed-canvas"
              />

              {!cameraConnected && !testMode && (
                <div className="camera-offline-overlay">
                  <h3>Camera Offline</h3>
                  <p>
                    Ensure your phone IP Webcam app is streaming at:
                    <br />
                    <code>{ipUrl}</code>
                  </p>
                  <button
                    className="retry-btn"
                    onClick={() => handleConnectCamera(ipUrl)}
                  >
                    Retry Connection
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ESP32 SERIAL COMMAND STATION (THE 4 COMMANDS) */}
          <div className="card serial-control-card">
            <div className="card-header">
              <div>
                <h2>Robotic Arm Serial Control</h2>
                <p>Sends serial commands to ESP32 (color_sort_1)</p>
              </div>

              <label className="auto-serial-toggle">
                <input
                  type="checkbox"
                  checked={autoSerialTrigger}
                  onChange={(e) => setAutoSerialTrigger(e.target.checked)}
                />
                Auto-sort on Color Detection
              </label>
            </div>

            {/* SERIAL PORT SELECTION BAR */}
            <div className="serial-port-bar">
              <label>COM Port:</label>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
              >
                {availablePorts.length === 0 && (
                  <option value={selectedPort || "COM3"}>
                    {selectedPort || "COM3 (Default)"}
                  </option>
                )}
                {availablePorts.map((p) => (
                  <option key={p.port} value={p.port}>
                    {p.port} - {p.desc}
                  </option>
                ))}
              </select>

              <button className="refresh-btn" onClick={refreshPorts} title="Refresh COM Ports">
                ↻
              </button>

              {!isSerialConnected ? (
                <>
                  <button className="connect-btn" onClick={connectBridgeSerial}>
                    Connect PySerial
                  </button>
                  <button className="webserial-btn" onClick={connectBrowserWebSerial} title="Direct browser USB serial">
                    Web Serial
                  </button>
                </>
              ) : (
                <button className="disconnect-btn" onClick={disconnectBridgeSerial}>
                  Disconnect
                </button>
              )}
            </div>

            {/* THE 4 REQUESTED BUTTONS */}
            <div className="command-buttons-grid">
              <button
                className={`cmd-btn cmd-start ${activeCommand === "start" ? "active" : ""}`}
                onClick={() => sendSerialCommand("start")}
              >
                <span className="btn-icon">🚀</span>
                <div className="btn-text">
                  <strong>START</strong>
                  <small>Home (0, 50, 0, 110)</small>
                </div>
              </button>

              <button
                className={`cmd-btn cmd-check ${activeCommand === "check" ? "active" : ""}`}
                onClick={() => sendSerialCommand("check")}
              >
                <span className="btn-icon">🔍</span>
                <div className="btn-text">
                  <strong>CHECK</strong>
                  <small>Scan (0, 5, 12, 110)</small>
                </div>
              </button>

              <button
                className={`cmd-btn cmd-red ${activeCommand === "red" ? "active" : ""}`}
                onClick={() => sendSerialCommand("red")}
              >
                <span className="btn-icon">🔴</span>
                <div className="btn-text">
                  <strong>RED</strong>
                  <small>Sort Red Sequence</small>
                </div>
              </button>

              <button
                className={`cmd-btn cmd-green ${activeCommand === "green" ? "active" : ""}`}
                onClick={() => sendSerialCommand("green")}
              >
                <span className="btn-icon">🟢</span>
                <div className="btn-text">
                  <strong>GREEN</strong>
                  <small>Sort Green Sequence</small>
                </div>
              </button>
            </div>

            {/* SERIAL CONSOLE MONITOR */}
            <div className="serial-console">
              <div className="console-header">
                <span>ESP32 Serial Feedback (115200 baud)</span>
                <button className="clear-console-btn" onClick={() => setSerialLogs([])}>
                  Clear
                </button>
              </div>
              <div className="console-body">
                {serialLogs.map((log, idx) => (
                  <div key={idx} className="console-line">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: DETECTION TELEMETRY & FUNCTIONAL COUNTER */}
        <section className="right-column">
          {/* OBJECT DETECTION CARD */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2>Object Detection</h2>
                <p>Live Color & Centroid Tracking</p>
              </div>
              {detectedData.color && (
                <span
                  className="color-indicator-chip"
                  style={{ backgroundColor: getColorHex(detectedData.color) }}
                >
                  {detectedData.color}
                </span>
              )}
            </div>

            <div className="detection-box">
              <div className="detection-item">
                <span>Detected Color</span>
                <strong style={{ color: getColorHex(detectedData.color) }}>
                  {detectedData.color || "Scanning..."}
                </strong>
              </div>

              <div className="detection-item">
                <span>Confidence</span>
                <strong>
                  {detectedData.confidence ? `${detectedData.confidence}%` : "--"}
                </strong>
              </div>

              <div className="detection-item">
                <span>Position X</span>
                <strong>
                  {detectedData.x ? `${detectedData.x} px` : "--"}
                </strong>
              </div>

              <div className="detection-item">
                <span>Position Y</span>
                <strong>
                  {detectedData.y ? `${detectedData.y} px` : "--"}
                </strong>
              </div>
            </div>
          </div>

          {/* FUNCTIONAL COLOR COUNTER (RED, GREEN, BLUE ONLY - NO YELLOW) */}
          <div className="card">
            <div className="card-header">
              <div>
                <h2>Color Counter</h2>
                <p>Real-Time Detected Item Tally</p>
              </div>
              <button
                className="reset-btn"
                onClick={handleResetCounts}
                title="Reset All Counters"
              >
                ↺ Reset Counts
              </button>
            </div>

            <div className="stats-grid">
              <div className="stat stat-red">
                <span>RED COUNT</span>
                <strong>{counts.red}</strong>
              </div>

              <div className="stat stat-green">
                <span>GREEN COUNT</span>
                <strong>{counts.green}</strong>
              </div>

              <div className="stat stat-blue">
                <span>BLUE COUNT</span>
                <strong>{counts.blue}</strong>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
