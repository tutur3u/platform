import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
from threading import Thread
import unittest

from mounted_assets_smoke import collect_assets


class AssetSmokeTest(unittest.TestCase):
    def test_extracts_declared_resources_and_resolves_browser_urls(self):
        assets = collect_assets(
            """
            <base href="/tools/">
            <link rel="StyleSheet alternate" href="theme.css?a=1&amp;b=2">
            <link rel="modulepreload" href="bundle.js">
            <script type="module" src="bundle.js"></script>
            <link rel="preload" as="font" href="font.woff2" crossorigin>
            <link rel="preload" as="image" imagesrcset="wide.png 2x, thin.png 1x">
            <link rel="manifest" href="app.webmanifest">
            <link rel="apple-touch-icon-precomposed" href="/icon.png">
            <link rel="mask-icon" href="/mask.svg">
            <picture><source srcset="data:image/svg+xml,x 1x, image.webp 2x">
              <img src="image.png" srcset="image.png 1x, image@2x.png 2x">
            </picture>
            <video poster="poster.jpg"></video>
            <svg><image xlink:href="svg.png"/><use href="#local"/></svg>
            <script>const ignored = '<img src="not-a-resource">';</script>
            <!-- <script src="not-a-resource"></script> -->
            <a href="/account">An ordinary link</a>
            """,
            "https://tuturuuu.com/tools",
        )
        self.assertEqual(
            assets,
            {
                "https://tuturuuu.com/tools/theme.css?a=1&b=2": {"stylesheet"},
                "https://tuturuuu.com/tools/bundle.js": {"modulepreload", "script"},
                "https://tuturuuu.com/tools/font.woff2": {"font"},
                "https://tuturuuu.com/tools/wide.png": {"image"},
                "https://tuturuuu.com/tools/thin.png": {"image"},
                "https://tuturuuu.com/tools/app.webmanifest": {"manifest"},
                "https://tuturuuu.com/icon.png": {"icon"},
                "https://tuturuuu.com/mask.svg": {"icon"},
                "https://tuturuuu.com/tools/image.webp": {"image"},
                "https://tuturuuu.com/tools/image.png": {"image"},
                "https://tuturuuu.com/tools/image@2x.png": {"image"},
                "https://tuturuuu.com/tools/poster.jpg": {"image"},
                "https://tuturuuu.com/tools/svg.png": {"image"},
            },
        )

    def test_cli_fails_on_real_apex_stylesheet_href(self):
        with Fixture("subdomain") as subdomain, Fixture("apex") as apex, Fixture("external") as external:
            apex.external = external.origin
            args = [
                sys.executable, "-B", str(Path(__file__).with_name("mounted_assets_smoke.py")),
                "--subdomain-url", subdomain.origin + "/",
                "--apex-url", apex.origin + "/tools",
                "--app-worker", "tuturuuu-tools",
                "--app-version", "b6382988-1679-43c7-b3fb-c68eb5498998",
                "--gateway-version", "a7ddf376-a147-45b4-80fb-c23dd1ca4eab",
            ]
            rejected = subprocess.run(args, capture_output=True, text=True, timeout=10, check=False)
            self.assertEqual(rejected.returncode, 1, rejected.stderr)
            self.assertEqual(
                [
                    (asset["url"], asset["status"])
                    for page in json.loads(rejected.stdout)
                    for asset in page["assets"]
                    if not asset["passed"]
                ],
                [(apex.origin + "/assets/layout.css", 404)],
            )

            apex.fixed = True
            accepted = subprocess.run(args, capture_output=True, text=True, timeout=10, check=False)
            self.assertEqual(accepted.returncode, 0, accepted.stdout)
            expected = (
                'tuturuuu-gateway="a7ddf376-a147-45b4-80fb-c23dd1ca4eab", '
                'tuturuuu-tools="b6382988-1679-43c7-b3fb-c68eb5498998"'
            )
            self.assertTrue(all(pin == expected for _, pin in subdomain.requests + apex.requests))
            self.assertIn(("/tools/assets/layout.css", expected), apex.requests)
            self.assertTrue(external.requests)
            self.assertTrue(all(pin is None for _, pin in external.requests))


class Fixture(ThreadingHTTPServer):
    def __init__(self, variant):
        super().__init__(("127.0.0.1", 0), FixtureHandler)
        self.origin = f"http://127.0.0.1:{self.server_port}"
        self.variant = variant
        self.requests = []
        self.fixed = False

    def __enter__(self):
        self.thread = Thread(target=self.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *error):
        self.shutdown()
        self.thread.join()
        self.server_close()


class FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        fixture = self.server
        fixture.requests.append((self.path, self.headers.get("Cloudflare-Workers-Version-Overrides")))
        if self.path in {"/", "/tools"}:
            style = "/tools/assets/layout.css" if fixture.fixed else "/assets/layout.css"
            external = f'<img src="{fixture.external}/image.png">' if fixture.variant == "apex" else ""
            script = "/tools/assets/main.js" if fixture.variant == "apex" else "/assets/main.js"
            self.respond(200, "text/html", f'<link rel="stylesheet" href="{style}"><script src="{script}"></script>{external}')
        elif fixture.variant == "apex" and self.path == "/assets/layout.css":
            self.respond(404, "text/html", "not found")
        else:
            content_type = "text/css" if self.path.endswith(".css") else "application/octet-stream"
            self.respond(200, content_type, "a resource")

    def respond(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *args):
        pass
