import 'package:html/parser.dart' as html_parser;
import 'package:mobile/features/mail/view/mail_html_sanitizer.dart';

enum MailMessageAppearance { original, light, dark }

class MailDocumentRequest {
  const MailDocumentRequest({
    required this.html,
    required this.loadImages,
    this.inlineImages = const {},
    this.appearance = MailMessageAppearance.original,
    this.backgroundArgb,
  });
  final String html;
  final bool loadImages;
  final Map<String, String> inlineImages;
  final MailMessageAppearance appearance;
  final int? backgroundArgb;
}

String renderMailDocument(MailDocumentRequest request) => buildMailHtmlDocument(
  request.html,
  loadImages: request.loadImages,
  inlineImages: request.inlineImages,
  appearance: request.appearance,
  backgroundArgb: request.backgroundArgb,
);

/// Builds an isolated document, preserving the original email's safe styling.
/// Keep layout rules aligned with apps/mail's mail-message-preview-utils.ts.
String buildMailHtmlDocument(
  String html, {
  required bool loadImages,
  Map<String, String> inlineImages = const {},
  MailMessageAppearance appearance = MailMessageAppearance.original,
  int? backgroundArgb,
}) {
  final images = loadImages ? 'https: data:' : 'data:';
  var body = sanitizeIsolatedMailHtml(html, inlineImages: inlineImages);
  final dark = appearance == MailMessageAppearance.dark;
  final scheme = dark ? 'dark' : 'light';
  final background =
      backgroundArgb == null || appearance == MailMessageAppearance.original
      ? (dark ? '#121212' : '#fff')
      : '#${(backgroundArgb & 0xffffff).toRadixString(16).padLeft(6, '0')}';
  final foreground = dark ? '#e7e7e7' : '#171717';
  if (appearance != MailMessageAppearance.original) {
    final fragment = html_parser.parseFragment(body);
    for (final element in fragment.querySelectorAll('*')) {
      if (['style', 'img', 'svg', 'path'].contains(element.localName)) continue;
      element.attributes.remove('bgcolor');
      element.attributes.remove('background');
      final color = element.localName == 'a'
          ? (dark ? '#8ab4ff' : '#2458b8')
          : foreground;
      // Inline important wins over sender selectors and inline important rules.
      // Reset the shorthand too: background images/gradients can hide text.
      element.attributes['style'] =
          '${element.attributes['style'] ?? ''};'
          'color:$color!important;-webkit-text-fill-color:$color!important;'
          'background:transparent!important;';
    }
    body = fragment.outerHtml;
  }
  final themeStyles = appearance == MailMessageAppearance.original
      ? ''
      : '''
body,body *:not(img):not(svg):not(path){color:$foreground!important;background-color:transparent!important}
html,body{background:$background!important}
body a{color:${dark ? '#8ab4ff' : '#2458b8'}!important}
''';
  const responsiveStyles = '''
#mail-content>div{max-width:100%!important;margin-inline:auto}
#mail-content table{max-width:100%!important}
#mail-content img,#mail-content video,#mail-content svg{max-width:100%!important}
''';
  return '''
<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src $images; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="$scheme">
<style>
*{box-sizing:border-box}
html,body{margin:0;width:100%;min-width:0;color-scheme:$scheme;background:$background;color:$foreground}
body{padding:12px;font:14px/1.6 ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere;word-break:break-word}
#mail-scroll{width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch}
#mail-content{width:100%;min-width:0}
#mail-content>table{margin-inline:auto}
img,video,svg,canvas{max-width:100%;object-fit:contain}
img:not([height]){height:auto}table{max-width:100%!important}
td,th{word-break:normal;overflow-wrap:anywhere}
pre{max-width:100%;white-space:pre-wrap;word-break:break-word}
blockquote{margin-inline:0;padding-inline-start:12px;border-inline-start:3px solid #737373}
a[href^="mailto:"]{color:${dark ? '#8ab4ff' : '#2458b8'}!important;text-decoration:none!important}
</style></head><body data-mail-preview="${appearance.name}"><div id="mail-scroll"><div id="mail-content">$body</div></div><style>$themeStyles$responsiveStyles</style></body></html>''';
}
