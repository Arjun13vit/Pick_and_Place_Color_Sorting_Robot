import sys
import time
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import serial
import serial.tools.list_ports

# ==========================================
# ESP32 PYSERIAL BRIDGE SERVER
# ==========================================
# Baud rate 115200 matches color_sort_1.ino
DEFAULT_BAUD = 115200

ser_lock = threading.Lock()
ser = None
current_port = None
serial_logs = []
is_running = True

def add_log(msg):
    global serial_logs
    timestamp = time.strftime("%H:%M:%S")
    entry = f"[{timestamp}] {msg}"
    with ser_lock:
        serial_logs.append(entry)
        if len(serial_logs) > 40:
            serial_logs.pop(0)
    print(entry)

def serial_reader_thread():
    global ser, is_running
    while is_running:
        current_ser = None
        with ser_lock:
            if ser and ser.is_open:
                current_ser = ser
        if current_ser:
            try:
                if current_ser.in_waiting:
                    line = current_ser.readline().decode('utf-8', errors='ignore').strip()
                    if line:
                        add_log(f"ESP32: {line}")
            except Exception as e:
                add_log(f"Serial read error: {e}")
                time.sleep(0.5)
        time.sleep(0.05)

def list_available_ports():
    ports = serial.tools.list_ports.comports()
    return [{"port": p.device, "desc": p.description} for p in ports]

def connect_serial(port_name, baud=DEFAULT_BAUD):
    global ser, current_port
    with ser_lock:
        if ser and ser.is_open:
            try:
                ser.close()
            except Exception:
                pass
        try:
            ser = serial.Serial(port_name, baud, timeout=1)
            current_port = port_name
            add_log(f"Connected to ESP32 on {port_name} at {baud} baud")
            return True, f"Connected to {port_name}"
        except Exception as e:
            ser = None
            current_port = None
            add_log(f"Failed to connect to {port_name}: {e}")
            return False, str(e)

def disconnect_serial():
    global ser, current_port
    with ser_lock:
        if ser and ser.is_open:
            try:
                ser.close()
            except Exception:
                pass
        ser = None
        current_port = None
        add_log("Disconnected from serial port")

def send_command(cmd):
    global ser
    clean_cmd = cmd.strip().lower()
    valid_cmds = ["start", "check", "red", "green"]
    if clean_cmd not in valid_cmds:
        return False, f"Invalid command: {clean_cmd}. Valid: {valid_cmds}"

    with ser_lock:
        if not ser or not ser.is_open:
            return False, "Serial port not connected"
        try:
            payload = (clean_cmd + "\n").encode('utf-8')
            ser.write(payload)
            add_log(f"Sent command to ESP32: '{clean_cmd}'")
            return True, f"Command '{clean_cmd}' sent"
        except Exception as e:
            add_log(f"Error sending command: {e}")
            return False, str(e)

class BridgeAPIHandler(BaseHTTPRequestHandler):
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
        if parsed.path == '/api/ports':
            ports = list_available_ports()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(ports).encode('utf-8'))

        elif parsed.path == '/api/status':
            with ser_lock:
                connected = bool(ser and ser.is_open)
                port = current_port
                logs = list(serial_logs[-15:])
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            status_data = {
                "connected": connected,
                "port": port,
                "baud": DEFAULT_BAUD,
                "logs": logs
            }
            self.wfile.write(json.dumps(status_data).encode('utf-8'))

        else:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "pyserial bridge online"}).encode('utf-8'))

    def do_POST(self):
        parsed = urlparse(self.path)
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8') if content_len > 0 else ""
        data = json.loads(body) if body else {}

        if parsed.path == '/api/connect':
            port_name = data.get("port")
            if not port_name:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "Missing port"}')
                return
            success, msg = connect_serial(port_name, DEFAULT_BAUD)
            self.send_response(200 if success else 500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": success, "message": msg}).encode('utf-8'))

        elif parsed.path == '/api/disconnect':
            disconnect_serial()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"success": true, "message": "Disconnected"}')

        elif parsed.path == '/api/command':
            cmd = data.get("command", "")
            success, msg = send_command(cmd)
            self.send_response(200 if success else 400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": success, "message": msg}).encode('utf-8'))

        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return

def run_server(port=5001):
    server = HTTPServer(('0.0.0.0', port), BridgeAPIHandler)
    print(f"\n=======================================================")
    print(f"  ESP32 PySerial Bridge Server Online on port {port}")
    print(f"  Baud rate: {DEFAULT_BAUD}")
    print(f"  Commands supported: start, check, red, green")
    print(f"  Endpoints: /api/ports, /api/connect, /api/command, /api/status")
    print(f"=======================================================\n")
    server.serve_forever()

if __name__ == '__main__':
    if len(sys.argv) > 1:
        cli_port = sys.argv[1]
        connect_serial(cli_port, DEFAULT_BAUD)

    t = threading.Thread(target=serial_reader_thread, daemon=True)
    t.start()
    run_server(5001)

