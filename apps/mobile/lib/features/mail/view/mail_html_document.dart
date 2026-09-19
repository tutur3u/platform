import 'package:mobile/features/mail/view/mail_html_sanitizer.dart';

class MailDocumentRequest {
  const MailDocumentRequest({
    required this.html,
    required this.loadImages,
    this.inlineImages = const {},
  });
  final String html;
  final bool loadImages;
  final Map<String, String> inlineImages;
}

String renderMailDocument(MailDocumentRequest request) => buildMailHtmlDocument(
  request.html,
  loadImages: request.loadImages,
  inlineImages: request.inlineImages,
);

/// Builds an isolated document, preserving the original email's safe styling.
/// Keep layout rules aligned with apps/mail's mail-message-preview-utils.ts.
String buildMailHtmlDocument(
  String html, {
  required bool loadImages,
  Map<String, String> inlineImages = const {},
}) {
  final images = loadImages ? 'https: data:' : 'data:';
  final body = sanitizeIsolatedMailHtml(html, inlineImages: inlineImages);
  return '''
<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src $images; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<style>
*{box-sizing:border-box}
html,body{margin:0;max-width:100%;overflow-x:auto;color-scheme:light;background:#fff;color:#171717}
body{padding:12px;font:14px/1.6 ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere;word-break:break-word}
img,video,svg,canvas{max-width:100%;object-fit:contain}
img:not([height]){height:auto}table{max-width:100%}
pre{max-width:100%;white-space:pre-wrap;word-break:break-word}
blockquote{margin-inline:0;padding-inline-start:12px;border-inline-start:3px solid #737373}
a[href^="mailto:"]{color:#2458b8!important;text-decoration:none!important}
</style></head><body>$body</body></html>''';
}
