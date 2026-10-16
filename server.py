"""Servidor local do Compasso. Usa somente a biblioteca padrão do Python."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import ipaddress
import socket
import sys
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent
HOST, PORT = "127.0.0.1", 8765
URL = f"http://localhost:{PORT}"


class LocalHandler(SimpleHTTPRequestHandler):
    def allowed_path(self):
        path = unquote(urlsplit(self.path).path)
        target = (ROOT / path.lstrip("/")).resolve()
        if not target.is_relative_to(ROOT):
            return False
        relative = target.relative_to(ROOT)
        allowed = str(relative) in (".", "index.html", "favicon.svg", "manifest.webmanifest") or bool(relative.parts) and relative.parts[0] in ("js", "css", "icons") and target.suffix in (".js", ".css", ".svg", ".png")
        return allowed and (not target.is_dir() or path == "/")

    def do_GET(self):
        if not self.allowed_path():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.allowed_path():
            self.send_error(404)
            return
        super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.firebaseio.com https://*.firebasedatabase.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        super().end_headers()

    def guess_type(self, path):
        if str(path).endswith(".js"):
            return "text/javascript; charset=utf-8"
        if str(path).endswith(".webmanifest"):
            return "application/manifest+json"
        return super().guess_type(path)


def main():
    parser = argparse.ArgumentParser(description="Compasso — servidor local de atividades")
    parser.add_argument("--network", action="store_true", help="Permitir acesso de outros aparelhos na rede local")
    parser.add_argument("--no-browser", action="store_true", help="Não abrir o navegador automaticamente")
    args = parser.parse_args()
    try:
        server = ThreadingHTTPServer(("0.0.0.0" if args.network else HOST, PORT), partial(LocalHandler, directory=str(ROOT)))
    except OSError as error:
        print(f"Não foi possível abrir {URL}: {error}")
        print("Verifique se o Compasso já está aberto. A porta não será alterada para proteger a origem dos dados.")
        return 1
    print(f"Compasso em execução: {URL}")
    if args.network:
        print("\nACESSO NA REDE LOCAL (outros computadores e celulares):")
        addresses = set()
        try:
            addresses = {entry[4][0] for entry in socket.getaddrinfo(socket.gethostname(), PORT, socket.AF_INET)}
        except OSError:
            pass
        for address in sorted(addresses):
            if not ipaddress.ip_address(address).is_loopback:
                print(f"  http://{address}:{PORT}")
        print("Use o IP IPv4 deste computador (ipconfig) e a porta 8765.")
        print("Mantenha os aparelhos na mesma rede. Se solicitado pelo Windows, permita o acesso em redes privadas.")
        print("Os dados ficam separados por navegador/aparelho. Não há sincronização.")
    print("Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.")
    if not args.no_browser:
        threading.Timer(0.7, lambda: webbrowser.open(URL)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado. Os dados continuam no navegador.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
