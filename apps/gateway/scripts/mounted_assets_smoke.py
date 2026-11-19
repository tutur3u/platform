#!/usr/bin/env python3
"""Check HTTP assets declared by both HTML documents of a pinned app version."""

import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


VERSION_OVERRIDES = "Cloudflare-Workers-Version-Overrides"
HTML_TYPES = {"text/html", "application/xhtml+xml"}
LINK_KINDS = {
    "stylesheet": "stylesheet",
    "modulepreload": "modulepreload",
    "manifest": "manifest",
    "icon": "icon",
    "apple-touch-icon": "icon",
    "apple-touch-icon-precomposed": "icon",
    "mask-icon": "icon",
    "fluid-icon": "icon",
    "image_src": "image",
}
PRELOAD_KINDS = {"style": "stylesheet", "script": "script", "image": "image", "font": "font"}
HTML_LIMIT = 16 * 1024 * 1024
ASSET_LIMIT = 1000


def srcset_urls(value):
    # URLs can contain commas (including data: URLs). A comma after a URL
    # or after its optional descriptors separates the next candidate.
    remaining = value
    while remaining := remaining.lstrip(" ,\t\n\r\f"):
        parts = re.split(r"[\t\n\r\f ]+", remaining, maxsplit=1)
        url = parts[0]
        yield url.rstrip(",")
        remaining = parts[1] if len(parts) == 2 else ""
        if not url.endswith(","):
            # A comma inside a parenthesized descriptor is not a separator.
            descriptors = re.match(r"(?:[^,()]|\([^)]*\))*", remaining)
            remaining = remaining[descriptors.end() + 1:]


class AssetLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.base = None
        self.links = []

    def add(self, kind, url):
        if url and (url := url.strip()) and not url.startswith("#"):
            self.links.append((kind, url))

    def add_srcset(self, srcset):
        for url in srcset_urls(srcset or ""):
            self.add("image", url)

    def handle_starttag(self, tag, pairs):
        attrs = dict(reversed(pairs))  # HTML uses the first repeated attribute.
        if tag == "base" and self.base is None:
            self.base = attrs.get("href")
        elif tag == "link":
            rel = (attrs.get("rel") or "").lower().split()
            for token in rel:
                if token in LINK_KINDS:
                    self.add(LINK_KINDS[token], attrs.get("href"))
            if "preload" in rel and (kind := PRELOAD_KINDS.get((attrs.get("as") or "").lower())):
                self.add(kind, attrs.get("href"))
                if kind == "image":
                    self.add_srcset(attrs.get("imagesrcset"))
        elif tag == "script":
            self.add("script", attrs.get("src"))
        elif tag in {"img", "source"}:
            if tag == "img":
                self.add("image", attrs.get("src"))
            self.add_srcset(attrs.get("srcset"))
        elif tag == "input" and (attrs.get("type") or "").lower() == "image":
            self.add("image", attrs.get("src"))
        elif tag == "video":
            self.add("image", attrs.get("poster"))
        elif tag in {"image", "use", "font-face-uri"}:
            self.add(
                "font" if tag == "font-face-uri" else "image",
                attrs.get("href") or attrs.get("xlink:href"),
            )


def collect_assets(html, page_url):
    parser = AssetLinks()
    parser.feed(html)
    parser.close()
    base = urljoin(page_url, parser.base or "")
    assets = defaultdict(set)
    for kind, ref in parser.links:
        url = urldefrag(urljoin(base, ref)).url
        if urlsplit(url).scheme in {"http", "https"}:
            assets[url].add(kind)
    return dict(assets)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def origin(url):
    parts = urlsplit(url)
    if not parts.hostname or parts.username is not None or parts.password is not None:
        raise ValueError("Expected a network URL without credentials")
    if parts.scheme not in {"http", "https"}:
        raise ValueError("Expected an HTTP or HTTPS URL")
    return parts.scheme, parts.hostname, parts.port or (443 if parts.scheme == "https" else 80)


def display_url(url):
    parts = urlsplit(url)
    # The GET uses the exact URL. Receipts omit credentials and query values.
    return parts._replace(netloc=parts.netloc.rsplit("@", 1)[-1], query="", fragment="").geturl()


def check_url(url, pins, pinned_origins, *, document=False):
    row = {"url": display_url(url), "passed": False}
    try:
        headers = {"Cache-Control": "no-cache", "User-Agent": "Tuturuuu-Gateway-Smoke/1.0"}
        if origin(url) in pinned_origins:
            headers[VERSION_OVERRIDES] = pins
        request = Request(url, headers=headers, method="GET")
        with build_opener(NoRedirect()).open(request, timeout=12) as response:
            content_type = response.headers.get_content_type()
            row.update(status=response.status, contentType=content_type)
            if response.status != 200:
                return row, None
            if document != (content_type in HTML_TYPES):
                row["error"] = "expected HTML document" if document else "asset returned HTML"
                return row, None
            if document:
                body = response.read(HTML_LIMIT + 1)
                if len(body) > HTML_LIMIT:
                    row["error"] = "HTML exceeded the size limit"
                    return row, None
                charset = response.headers.get_content_charset() or "utf-8"
                html = body.decode(charset, errors="replace")
                row["passed"] = True
                return row, html
            row["passed"] = True
            return row, None
    except HTTPError as error:
        try:
            row["status"] = error.code
        finally:
            error.close()
    except (URLError, OSError, ValueError, LookupError) as error:
        row["error"] = type(error).__name__
    return row, None


def smoke(url, pins, pinned_origins):
    page, html = check_url(url, pins, pinned_origins, document=True)
    receipt = {**page, "assets": []}
    if html is None:
        return receipt
    try:
        assets = collect_assets(html, url)
    except ValueError:
        return {**receipt, "passed": False, "error": "invalid asset or base URL"}
    if len(assets) > ASSET_LIMIT:
        return {**receipt, "passed": False, "error": "HTML exceeded the asset count limit"}
    with ThreadPoolExecutor(max_workers=8) as pool:
        def probe(asset):
            row, _ = check_url(asset, pins, pinned_origins)
            return {**row, "kinds": sorted(assets[asset])}

        receipt["assets"] = list(pool.map(probe, assets))
    receipt["passed"] = all(asset["passed"] for asset in receipt["assets"])
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subdomain-url", required=True)
    parser.add_argument("--apex-url", required=True)
    parser.add_argument("--app-worker", required=True)
    parser.add_argument("--app-version", required=True, type=UUID)
    parser.add_argument("--gateway-version", type=UUID)
    args = parser.parse_args()
    urls = [args.subdomain_url, args.apex_url]
    try:
        pinned_origins = {origin(url) for url in urls}
    except ValueError:
        parser.error("Expected two HTTP(S) document URLs without credentials")
    if len(pinned_origins) != 2:
        parser.error("Subdomain and apex URLs must have different origins")
    if not re.fullmatch(r"[a-z][a-z0-9-]*", args.app_worker) or args.app_worker == "tuturuuu-gateway":
        parser.error("Expected an app Worker name")
    pins = [f'{args.app_worker}="{args.app_version}"']
    if args.gateway_version:
        pins.insert(0, f'tuturuuu-gateway="{args.gateway_version}"')
    receipts = [smoke(url, ", ".join(pins), pinned_origins) for url in urls]
    print(json.dumps(receipts, indent=2))
    return 0 if all(receipt["passed"] for receipt in receipts) else 1


if __name__ == "__main__":
    raise SystemExit(main())
