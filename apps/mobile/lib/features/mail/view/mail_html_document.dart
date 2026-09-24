import 'package:html/dom.dart' as dom;
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
  final fragment = html_parser.parseFragment(body);
  _fitNewsletterForMobile(fragment);
  final dark = appearance == MailMessageAppearance.dark;
  final scheme = dark ? 'dark' : 'light';
  final background =
      backgroundArgb == null || appearance == MailMessageAppearance.original
      ? (dark ? '#121212' : '#fff')
      : '#${(backgroundArgb & 0xffffff).toRadixString(16).padLeft(6, '0')}';
  final foreground = dark ? '#e7e7e7' : '#171717';
  if (appearance != MailMessageAppearance.original) {
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
  }
  body = fragment.outerHtml;
  final themeStyles = appearance == MailMessageAppearance.original
      ? ''
      : '''
body,body *:not(img):not(svg):not(path){color:$foreground!important;background-color:transparent!important}
html,body{background:$background!important}
body a{color:${dark ? '#8ab4ff' : '#2458b8'}!important}
''';
  const responsiveStyles = '''
#mail-content>div{margin-inline:auto}
#mail-content table{max-width:100%!important}
#mail-content img,#mail-content video,#mail-content svg{max-width:100%!important}
@media(max-width:600px){
#mail-content *{min-width:0!important;box-sizing:border-box}
#mail-content>*,#mail-content :is(table,thead,tbody,tr,td,th){max-width:100%!important}
#mail-content .mail-fluid-image{width:100%!important;height:auto!important;object-fit:contain}
#mail-content :is(p,div,span,td,th,h1,h2,h3){overflow-wrap:anywhere!important}
#mail-content :is([nowrap],[style*="nowrap" i]){white-space:normal!important}
#mail-content .mail-compact-icon{display:block;max-width:min(100%,220px)!important;max-height:220px!important;margin-inline:auto!important}
#mail-content .mail-fluid-table{width:100%!important;max-width:100%!important;table-layout:fixed;margin-inline:auto!important}
#mail-content .mail-fluid-container{width:100%!important;max-width:100%!important;overflow:visible!important;margin-inline:auto!important}
#mail-content .mail-fluid-table td,#mail-content .mail-fluid-table th{overflow-wrap:anywhere;word-break:break-word}
#mail-content :is(h1,h2){font-size:clamp(22px,7vw,28px)!important;line-height:1.25!important}
}
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

void _fitNewsletterForMobile(dom.DocumentFragment fragment) {
  for (final element in fragment.querySelectorAll('*')) {
    if (element.localName == 'style') continue;
    final tag = element.localName;
    final width = element.attributes['width'];
    if (tag == 'img') {
      final alt = element.attributes['alt'] ?? '';
      final src = element.attributes['src'] ?? '';
      final description = '$alt $src'.toLowerCase();
      if (description.contains('logo') || description.contains('icon')) {
        element.classes.add('mail-compact-icon');
      }
      final imageWidth = double.tryParse(
        (width ?? '').replaceAll(RegExp(r'[^\d.]'), ''),
      );
      if (imageWidth != null && imageWidth > 420) {
        element
          ..attributes.remove('width')
          ..attributes.remove('height')
          ..classes.add('mail-fluid-image');
      }
    }
    final isWideTable =
        tag == 'table' &&
        width != null &&
        (double.tryParse(width.replaceAll(RegExp(r'[^\d.]'), '')) ?? 0) > 420 &&
        !width.contains('%');
    if (isWideTable) {
      element.attributes.remove('width');
      element.classes.add('mail-fluid-table');
    }
    if ({'td', 'th', 'div', 'section', 'center'}.contains(tag) &&
        width != null &&
        (double.tryParse(width.replaceAll(RegExp(r'[^\d.]'), '')) ?? 0) > 420 &&
        !width.contains('%')) {
      element.attributes.remove('width');
      element.classes.add('mail-fluid-container');
    }
    final style = element.attributes['style'];
    if (style == null) continue;
    final updated = style.replaceAllMapped(
      RegExp(
        r'(^|;)(\s*)(width|min-width|max-width|padding(?:-(?:left|right))?|margin(?:-(?:left|right))?|font-size)\s*:\s*([^;]+)',
        caseSensitive: false,
      ),
      (match) {
        final property = match.group(3)!.toLowerCase();
        final value = match.group(4)!;
        final pixels = RegExp(
          r'(?<![\w.-])(\d+(?:\.\d+)?)px\b',
          caseSensitive: false,
        );
        final numbers = pixels
            .allMatches(value)
            .map((m) => double.parse(m.group(1)!));
        final limit = property == 'font-size'
            ? 28.0
            : property == 'width' ||
                  property == 'min-width' ||
                  property == 'max-width'
            ? 420.0
            : 24.0;
        if (!numbers.any((number) => number > limit)) return match.group(0)!;
        if (property == 'width' ||
            property == 'min-width' ||
            property == 'max-width') {
          if (tag == 'table') {
            element.classes.add('mail-fluid-table');
          } else if (const {
            'div',
            'section',
            'center',
            'td',
            'th',
          }.contains(tag)) {
            element.classes.add('mail-fluid-container');
          } else {
            return match.group(0)!;
          }
          final fitted = property == 'min-width' ? '0' : '100%';
          return '${match.group(1)}${match.group(2)}'
              '$property:$fitted!important';
        }
        if (property == 'font-size') {
          return '${match.group(1)}${match.group(2)}'
              'font-size:clamp(20px,7vw,28px)!important';
        }
        if (property.startsWith('padding') || property.startsWith('margin')) {
          final compact = value.replaceAllMapped(pixels, (pixel) {
            final size = double.parse(pixel.group(1)!);
            return size > 24 ? '16px' : pixel.group(0)!;
          });
          return '${match.group(1)}${match.group(2)}$property:$compact';
        }
        return match.group(0)!;
      },
    );
    if (updated != style) element.attributes['style'] = updated;
  }
}
