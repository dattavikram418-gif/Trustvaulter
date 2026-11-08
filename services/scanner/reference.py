"""Optional operator-owned scanner bridge. Never imported by the web application.
Python is transport only; a separate isolated real clamd performs scanning.
"""
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import socket
import struct
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

MAX_BYTES = 10485760
TIMEOUT = 12

def daemon_reply(command, data=None, socket_path=None):
    deadline = time.monotonic() + TIMEOUT
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
        conn.settimeout(TIMEOUT)
        conn.connect(socket_path or os.environ['CLAMD_SOCKET'])
        conn.sendall(command)
        if data is not None:
            for offset in range(0, len(data), 65536):
                conn.settimeout(max(0.001, deadline-time.monotonic()))
                chunk = data[offset:offset+65536]
                conn.sendall(struct.pack('!I', len(chunk))+chunk)
            conn.sendall(b'\0\0\0\0')
        response = bytearray()
        while b'\0' not in response:
            if time.monotonic() >= deadline:
                raise TimeoutError('engine timeout')
            conn.settimeout(max(0.001, deadline-time.monotonic()))
            part = conn.recv(512)
            if not part:
                raise ValueError('incomplete engine reply')
            response.extend(part)
            if len(response) > 1024:
                raise ValueError('engine reply bound')
        if response.count(0) != 1 or response[-1] != 0:
            raise ValueError('ambiguous engine reply')
        return response[:-1].decode('ascii', errors='strict')

def identity(version, now=None, max_age=86400):
    # clamd VERSION: ClamAV engine/database serial/database build date.
    # Require the running database's parseable date AND serial, never file mtime.
    match = re.fullmatch(r'ClamAV ([A-Za-z0-9.\-]+)/([0-9]+)/(.+)', version)
    if not match or int(match[2]) <= 0:
        raise ValueError('missing database identity')
    date = dt.datetime.strptime(match[3], '%a %b %d %H:%M:%S %Y').replace(tzinfo=dt.timezone.utc)
    age = ((now or dt.datetime.now(dt.timezone.utc))-date).total_seconds()
    if age < -300 or age > max_age:
        raise ValueError('stale or future database')
    return 'ClamAV '+match[1], match[2]+'/'+date.isoformat()

def real_scan(data):
    before = daemon_reply(b'zVERSION\0')
    engine, definitions = identity(before)
    answer = daemon_reply(b'zINSTREAM\0', data)
    # A concurrent definition reload invalidates this evidence rather than guessing.
    if daemon_reply(b'zVERSION\0') != before:
        raise ValueError('database changed during scan')
    if answer == 'stream: OK':
        return 'clean', engine, definitions
    if re.fullmatch(r'stream: [A-Za-z0-9_.()\- ]{1,200} FOUND', answer):
        return 'malicious', engine, definitions
    raise ValueError('engine error or malformed result')

class BoundedServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    request_queue_size = 8
    def __init__(self, address, secret):
        self.secret = secret
        self.slots = threading.BoundedSemaphore(2)
        super().__init__(address, Handler)
    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.slots.release()
            raise
    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'
    def setup(self):
        super().setup()
        self.connection.settimeout(12)
    def log_message(self, *_):
        pass  # Never log request headers, filenames, endpoint credentials or content.
    def reject(self, status):
        self.send_response(status)
        self.send_header('Content-Length', '0')
        self.end_headers()
    def do_POST(self):
        try:
            required = ['Authorization', 'Content-Length', 'Content-Type', 'X-Content-SHA256', 'X-Content-Size', 'X-Scan-Nonce']
            if self.path != '/scan' or any(len(self.headers.get_all(k) or []) != 1 for k in required):
                return self.reject(400)
            if not hmac.compare_digest(self.headers['Authorization'], 'Bearer '+self.server.secret):
                return self.reject(401)
            if self.headers.get('Transfer-Encoding') or self.headers['Content-Type'] != 'application/octet-stream':
                return self.reject(400)
            size_text = self.headers['Content-Length']
            if not re.fullmatch(r'[0-9]{1,8}', size_text) or size_text != self.headers['X-Content-Size']:
                return self.reject(400)
            size = int(size_text)
            digest = self.headers['X-Content-SHA256']
            nonce = self.headers['X-Scan-Nonce']
            if not 1 <= size <= MAX_BYTES or not re.fullmatch(r'[a-f0-9]{64}', digest) or str(uuid.UUID(nonce)) != nonce:
                return self.reject(400)
            deadline = time.monotonic()+12
            data = bytearray()
            while len(data) < size:
                remaining = deadline-time.monotonic()
                if remaining <= 0:
                    raise TimeoutError()
                self.connection.settimeout(remaining)
                chunk = self.rfile.read1(min(65536, size-len(data)))
                if not chunk:
                    return self.reject(400)
                data.extend(chunk)
            if hashlib.sha256(data).hexdigest() != digest:
                return self.reject(400)
            verdict, engine, definitions = real_scan(data)
            body = json.dumps(dict(digest=digest,size=size,nonce=nonce,verdict=verdict,engine=engine,signature_version=definitions), separators=(',', ':')).encode()
            if len(body) > 4096:
                raise ValueError('response bound')
            signature = hmac.new(self.server.secret.encode(), body, hashlib.sha256).hexdigest()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('X-Scan-Signature', signature)
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
        except (ValueError, OSError, TimeoutError, KeyError):
            self.reject(503)  # No signed clean/error substitute when engine fails.

if __name__ == '__main__':
    secret = os.environ.get('TV_SCANNER_SECRET', '')
    if len(secret) < 32 or not os.environ.get('CLAMD_SOCKET'):
        raise SystemExit('Operator secret and isolated clamd socket required')
    # TLS terminator must be operator-owned; loopback transport never publicly exposed.
    BoundedServer(('127.0.0.1', 8091), secret).serve_forever()
