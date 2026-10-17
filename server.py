#!/usr/bin/env python3
"""Threaded HTTP server for game assets."""
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    port = 8901
    server = ThreadingHTTPServer(('', port), Handler)
    print(f"Serving on http://127.0.0.1:{port}")
    server.serve_forever()