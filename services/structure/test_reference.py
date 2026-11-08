import io
import json
from pathlib import Path
import struct
import unittest
from unittest.mock import patch
import zlib
from PIL import Image
import reference

PARENT = '11111111-1111-4111-8111-111111111111'
VERSION = '22222222-2222-4222-8222-222222222222'


def png():
    output = io.BytesIO()
    Image.new('RGB', (2, 2), 'red').save(output, format='PNG')
    return output.getvalue()


def chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)


class StructureTests(unittest.TestCase):
    def test_real_pillow_isolated_png_and_binding(self):
        data = png()
        result = reference.run_isolated(data, 'image/png', PARENT, VERSION, approved=True)
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['size'], len(data))
        self.assertEqual(result['digest'], reference.hashlib.sha256(data).hexdigest())
        self.assertEqual((result['parent_id'], result['version_id']), (PARENT, VERSION))
        self.assertEqual(result['delivery'], 'disabled')

    def test_real_decoder_rejects_malformed_truncated_crc_trailing_polyglot(self):
        data = png()
        cases = [data[:-1], data[:20], data + b'<html>test</html>', data + data,
                 data + b'junk' + chunk(b'IEND', b''), data[:29] + b'\0\0\0\0' + data[33:]]
        for sample in cases:
            with self.subTest(size=len(sample)):
                self.assertEqual(reference.inspect_bytes(sample, 'image/png')['status'], 'rejected')

    def test_dimensions_expansion_metadata_and_deflate_tail(self):
        signature = b'\x89PNG\r\n\x1a\n'
        def sample(width, height, content, extra=b''):
            return signature + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + extra + chunk(b'IDAT', content) + chunk(b'IEND', b'')
        for data in [sample(8193, 1, zlib.compress(b'x')), sample(8192, 8192, zlib.compress(b'x')),
                     sample(1, 1, zlib.compress(b'\0\0\0\0') + b'extra'),
                     sample(1, 1, zlib.compress(b'x' * 10000)),
                     sample(1, 1, zlib.compress(b'\0\0\0\0'), chunk(b'zTXt', b'a\0\0' + zlib.compress(b'x' * 10000)))]:
            self.assertEqual(reference.inspect_bytes(data, 'image/png')['status'], 'rejected')

    def test_pdf_jpeg_explicitly_unsupported_even_valid(self):
        output = io.BytesIO()
        Image.new('RGB', (1, 1)).save(output, format='JPEG')
        for media, data in [('image/jpeg', output.getvalue()), ('application/pdf', b'%PDF-1.7\n%%EOF')]:
            self.assertEqual(reference.inspect_bytes(data, media)['status'], 'unsupported')

    def test_default_disabled_size_uuid_and_missing_dependency(self):
        self.assertEqual(reference.run_isolated(png(), 'image/png', PARENT, VERSION)['status'], 'unavailable')
        self.assertEqual(reference.run_isolated(b'x' * (reference.MAX_INPUT + 1), 'image/png', PARENT, VERSION, approved=True)['status'], 'rejected')
        with self.assertRaises(ValueError):
            reference.run_isolated(png(), 'image/png', 'not-uuid', VERSION, approved=True)
        with patch('PIL.__version__', 'missing'):
            self.assertEqual(reference.inspect_bytes(png(), 'image/png')['status'], 'unavailable')

    def test_mock_timeout_kills_process_group_and_never_passes(self):
        # Process mock, NOT evidence of OS timeout behavior or a real parser.
        with patch.object(reference.subprocess, 'Popen') as start, patch.object(reference.os, 'killpg') as kill:
            process = start.return_value
            process.wait.side_effect = [reference.subprocess.TimeoutExpired('worker', 5), None]
            process.poll.return_value = None
            process.pid = 123
            self.assertEqual(reference.run_isolated(png(), 'image/png', PARENT, VERSION, approved=True)['status'], 'unavailable')
            kill.assert_called_once_with(123, reference.signal.SIGKILL)

    def test_real_source_removed_trailing_guard_is_killed(self):
        # Load the actual source with the exact trailing guard removed; decoder still accepts it.
        source = Path(reference.__file__).read_text()
        guard = "            if end != len(data):\n                raise ValueError('trailing bytes')"
        self.assertEqual(source.count(guard), 1)
        namespace = {'__name__': 'structural_mutant'}
        exec(compile(source.replace(guard, '            pass'), '<removed-trailing-guard>', 'exec'), namespace)
        data = png() + chunk(b'IEND', b'')
        self.assertEqual(reference.inspect_bytes(data, 'image/png')['status'], 'rejected')
        self.assertEqual(namespace['inspect_bytes'](data, 'image/png')['status'], 'passed')


if __name__ == '__main__':
    unittest.main()
