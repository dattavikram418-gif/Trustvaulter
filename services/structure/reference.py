"""Offline local reference only. No HTTP, credentials, storage or delivery integration."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import resource
import signal
import struct
import subprocess
import sys
import tempfile
import uuid
import warnings
import zlib

MAX_INPUT = 10 * 1024 * 1024
MAX_PIXELS = 16_000_000
MAX_EXPANSION = 64 * 1024 * 1024
POLICY = 'trustvault-offline-structure-v1-png-static8'


def png_frame(data):
    """Bounded envelope/CRC/expansion guard, NOT an image decoder."""
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('signature')
    offset = 8
    chunks = 0
    compressed = bytearray()
    expected = None
    ended = False
    while offset < len(data):
        chunks += 1
        if chunks > 4096 or offset + 12 > len(data):
            raise ValueError('framing')
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + length
        if length > MAX_INPUT or end > len(data):
            raise ValueError('length')
        payload = data[offset + 8:end - 4]
        crc = struct.unpack('>I', data[end - 4:end])[0]
        if zlib.crc32(kind + payload) & 0xffffffff != crc:
            raise ValueError('crc')
        if kind == b'IHDR' and chunks == 1 and length == 13:
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', payload)
            channels = {0: 1, 2: 3, 4: 2, 6: 4}.get(color)
            if not channels or depth != 8 or compression or filtering or interlace:
                raise ValueError('unsupported png profile')
            if not 1 <= width <= 8192 or not 1 <= height <= 8192 or width * height > MAX_PIXELS:
                raise ValueError('dimensions')
            expected = (width * channels + 1) * height
            if expected > MAX_EXPANSION:
                raise ValueError('expansion')
        elif kind == b'IDAT' and expected is not None:
            compressed.extend(payload)
        elif kind == b'IEND' and length == 0 and expected is not None and compressed:
            if end != len(data):
                raise ValueError('trailing bytes')
            ended = True
        else:
            # Metadata, animation, palettes and all unknown chunks refused in this narrow profile.
            raise ValueError('unsupported chunk')
        offset = end
    if not ended or expected is None:
        raise ValueError('truncated')
    decoder = zlib.decompressobj()
    expanded = decoder.decompress(compressed, expected + 1)
    if len(expanded) != expected or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
        raise ValueError('expanded stream')


def inspect_bytes(data, media):
    from PIL import Image, ImageFile, __version__, features
    if __version__ != '12.1.1':
        return {'status': 'unavailable', 'reason': 'pinned decoder unavailable'}
    if not 1 <= len(data) <= MAX_INPUT:
        return {'status': 'rejected', 'reason': 'size'}
    if media == 'application/pdf':
        # qpdf --check cannot establish exact consumption/page/aggregate expansion policy.
        return {'status': 'unsupported', 'reason': 'PDF whole-file and expansion capability absent'}
    if media == 'image/jpeg':
        # Pillow accepts trailing/concatenated JPEGs; no reviewed consumed-codestream interface.
        return {'status': 'unsupported', 'reason': 'JPEG exact-consumption capability absent'}
    if media != 'image/png':
        return {'status': 'unsupported', 'reason': 'format capability absent'}
    try:
        png_frame(data)
        Image.MAX_IMAGE_PIXELS = MAX_PIXELS
        ImageFile.LOAD_TRUNCATED_IMAGES = False
        with warnings.catch_warnings():
            warnings.simplefilter('error')
            with Image.open(io.BytesIO(data), formats=['PNG']) as image:
                if image.mode not in {'L', 'LA', 'RGB', 'RGBA'} or getattr(image, 'n_frames', 1) != 1:
                    raise ValueError('profile')
                image.verify()
            with Image.open(io.BytesIO(data), formats=['PNG']) as image:
                image.load()
        return {'status': 'passed', 'validator': f'Pillow/{__version__}', 'zlib': features.version('zlib'), 'profile': POLICY}
    except Exception:
        return {'status': 'rejected', 'reason': 'invalid or unsupported PNG structure'}


def child_limits():
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    resource.setrlimit(resource.RLIMIT_FSIZE, (4096, 4096))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def run_isolated(data, media, parent_id, version_id, *, approved=False):
    if not approved:
        return {'status': 'unavailable', 'reason': 'explicit local operator approval required'}
    if sys.platform != 'linux':
        return {'status': 'unavailable', 'reason': 'Linux resource containment required'}
    for value in (parent_id, version_id):
        if str(uuid.UUID(value)) != value:
            raise ValueError('canonical UUID required')
    if not 1 <= len(data) <= MAX_INPUT:
        return {'status': 'rejected', 'reason': 'size'}
    binding = {'digest': hashlib.sha256(data).hexdigest(), 'size': len(data), 'parent_id': parent_id,
               'version_id': version_id, 'media': media, 'policy': POLICY, 'evidence_scope': 'offline-untrusted-not-persisted'}
    with tempfile.TemporaryDirectory(prefix='tv-structure-') as root:
        path = Path(root) / 'input'
        path.write_bytes(data)
        path.chmod(0o600)
        with tempfile.TemporaryFile() as output:
            process = subprocess.Popen([sys.executable, '-I', str(Path(__file__).resolve()), '--worker', str(path), media],
                                       stdout=output, stderr=subprocess.DEVNULL, env={'PATH': '/usr/bin:/bin'},
                                       start_new_session=True, preexec_fn=child_limits)
            try:
                process.wait(timeout=5)
                output.seek(0)
                raw = output.read(4097)
                result = json.loads(raw) if process.returncode == 0 and len(raw) <= 4096 else {'status': 'unavailable'}
                if not isinstance(result, dict) or result.get('status') not in {'passed', 'rejected', 'unsupported', 'unavailable'}:
                    raise ValueError('result')
            except Exception:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                result = {'status': 'unavailable', 'reason': 'isolated validator failure or deadline'}
    return {**binding, **result, 'quarantine_state': 'unchanged', 'delivery': 'disabled'}


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--worker':
        try:
            with open(sys.argv[2], 'rb') as file:
                result = inspect_bytes(file.read(MAX_INPUT + 1), sys.argv[3])
        except Exception:
            result = {'status': 'unavailable', 'reason': 'validator capability failure'}
        print(json.dumps(result, separators=(',', ':')))
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('file', type=Path)
        parser.add_argument('--media', required=True)
        parser.add_argument('--parent-id', required=True)
        parser.add_argument('--version-id', required=True)
        parser.add_argument('--approved-local-reference', action='store_true')
        args = parser.parse_args()
        with args.file.open('rb') as file:
            result = run_isolated(file.read(MAX_INPUT + 1), args.media, args.parent_id, args.version_id,
                                  approved=args.approved_local_reference)
        print(json.dumps(result, separators=(',', ':')))
        sys.exit(0 if result['status'] == 'passed' else 2)
