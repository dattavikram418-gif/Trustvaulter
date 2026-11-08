"""Protocol simulations only, NOT real antivirus integration."""
import datetime as dt
import hashlib
import hmac
import http.client
import json
import threading
import unittest
from unittest.mock import patch
import reference

class ReferenceContracts(unittest.TestCase):
    def test_definitions_missing(self):
        with self.assertRaises(ValueError): reference.identity('ClamAV 1.4.0/0/unknown')
    def test_definitions_stale(self):
        with self.assertRaises(ValueError): reference.identity('ClamAV 1.4.0/123/Thu Jan 01 00:00:00 2026',dt.datetime(2026,11,1,tzinfo=dt.timezone.utc))
    def test_engine_error_never_clean(self):
        version='ClamAV 1.4.0/123/'+dt.datetime.now(dt.timezone.utc).strftime('%a %b %d %H:%M:%S %Y')
        with patch('reference.daemon_reply',side_effect=[version,'stream: ERROR',version]),self.assertRaises(ValueError): reference.real_scan(b'synthetic')
    def test_definition_reload_never_clean(self):
        version='ClamAV 1.4.0/123/'+dt.datetime.now(dt.timezone.utc).strftime('%a %b %d %H:%M:%S %Y')
        with patch('reference.daemon_reply',side_effect=[version,'stream: OK','changed']),self.assertRaises(ValueError): reference.real_scan(b'synthetic')
    def test_http_auth_digest_and_signed_contract_mock(self):
        secret='test-only-not-a-working-credential-0000'
        server=reference.BoundedServer(('127.0.0.1',0),secret)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        data=b'synthetic';digest=hashlib.sha256(data).hexdigest()
        headers={'Authorization':'Bearer '+secret,'Content-Type':'application/octet-stream','X-Content-SHA256':digest,'X-Content-Size':str(len(data)),'X-Scan-Nonce':'10000000-0000-4000-8000-000000000001'}
        try:
            with patch('reference.real_scan',return_value=('malicious','MOCK','MOCK')):
                conn=http.client.HTTPConnection('127.0.0.1',server.server_port);conn.request('POST','/scan',data,headers);result=conn.getresponse();body=result.read()
                self.assertEqual(result.status,200);self.assertEqual(json.loads(body)['verdict'],'malicious');self.assertEqual(result.getheader('X-Scan-Signature'),hmac.new(secret.encode(),body,hashlib.sha256).hexdigest());conn.close()
            for changed,status in [({'Authorization':'Bearer wrong'},401),({'X-Content-SHA256':'0'*64},400),({'X-Content-Size':'10485761','Content-Length':'10485761'},400)]:
                conn=http.client.HTTPConnection('127.0.0.1',server.server_port);conn.request('POST','/scan',data,{**headers,**changed});result=conn.getresponse();self.assertEqual(result.status,status);result.read();conn.close()
        finally: server.shutdown();server.server_close()

if __name__=='__main__': unittest.main()
