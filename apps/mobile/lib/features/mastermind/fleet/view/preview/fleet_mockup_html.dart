import 'dart:convert';
import 'dart:typed_data';

/// The policy every mockup document renders under: nothing loads from the
/// network. Inline styles and `data:`/`blob:` images, media and fonts
/// render; scripts, fetches, frames, objects, forms and base URLs are
/// refused. The viewer also runs with JavaScript off, so no script, and no
/// script bridge, ever runs.
final String fleetMockupCsp = [
  "default-src 'none';",
  'img-src data: blob:;',
  'media-src data: blob:;',
  "style-src 'unsafe-inline';",
  'font-src data:;',
  "script-src 'none';",
  "connect-src 'none';",
  "frame-src 'none';",
  "child-src 'none';",
  "object-src 'none';",
  "form-action 'none';",
  "base-uri 'none'",
].join(' ');

/// A `<link` tag, in any letter case. Resource hints such as preconnect open
/// connections that [fleetMockupCsp] does not govern, and under the policy
/// a link has no other use: styles, fonts and icons must be inline.
final _linkTag = RegExp(r'<link(?=[\s/>]|$)', caseSensitive: false);

/// [html] behind a trusted prefix that opens the document and closes its
/// head with [fleetMockupCsp], DNS prefetching off, a no-referrer policy
/// and a viewport inside. The policy is in force before the parser reads a
/// single supplied byte, whatever those bytes start with; the document's
/// own doctype, html and head tags then parse as harmless errors, and its
/// styles still apply. The supplied bytes follow unchanged.
String fleetSandboxMockup(String html) => [
  '<!doctype html><html><head>',
  '<meta http-equiv="Content-Security-Policy" content="$fleetMockupCsp">',
  '<meta http-equiv="x-dns-prefetch-control" content="off">',
  '<meta name="referrer" content="no-referrer">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '</head>',
  html,
].join();

/// The document's text when [bytes] are UTF-8 HTML, as Web stores them,
/// with no `<link` anywhere in it; null for anything else. A document that
/// names a link is refused whole rather than edited: no rewrite can tell a
/// tag from the same characters in text without the WebView's own parser.
String? fleetDecodeMockup(Uint8List bytes) {
  try {
    final text = utf8.decode(bytes);
    final head = text.replaceFirst('\uFEFF', '').trimLeft().toLowerCase();
    final html = head.startsWith('<!doctype html') || head.startsWith('<html');
    return html && !_linkTag.hasMatch(text) ? text : null;
  } on FormatException {
    return null;
  }
}

/// Main-frame navigation the viewer allows: only the loaded document itself
/// and its in-page anchors. Every link out is refused.
bool fleetMockupNavigationAllowed(Uri? url) =>
    url != null && url.scheme == 'about' && url.path == 'blank';
