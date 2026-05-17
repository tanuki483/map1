"""
ローカルHTTPサーバー (Python標準ライブラリのみ)
WASMファイルの正しいMIMEタイプを設定します。
"""
import http.server
import socketserver
import os
import webbrowser
import sys

PORT = 8080

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.wasm': 'application/wasm',
        '.mjs': 'application/javascript',
    }

    def log_message(self, format, *args):
        # Suppress noisy logs, only show errors
        if args and str(args[0]).startswith('4') or str(args[0]).startswith('5'):
            super().log_message(format, *args)

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            url = f"http://localhost:{PORT}"
            print(f"Serving at {url}")
            print("Press Ctrl+C to stop.")
            webbrowser.open(url)
            httpd.serve_forever()
    except OSError as e:
        if "address already in use" in str(e).lower() or e.errno == 10048:
            print(f"ERROR: Port {PORT} is already in use.")
            print(f"Try: python serve.py  (after stopping the other server)")
        else:
            raise
    except KeyboardInterrupt:
        print("\nServer stopped.")
        sys.exit(0)
