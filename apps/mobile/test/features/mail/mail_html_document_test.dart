import 'package:flutter_test/flutter_test.dart';
import 'package:html/parser.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_html_sanitizer.dart';

void main() {
  test('fits a wide newsletter table and oversized spacing on mobile', () {
    final document = parse(
      buildMailHtmlDocument('''
<table width="640" style="width:640px;max-width:640px;margin:0 80px">
<tr><td style="padding:48px 72px">
<h1 style="font-size:48px">Meetings Hub, Clone ZoomInfo MCP</h1>
<img src="https://example.com/banner.png" width="640">
</td></tr></table>
''', loadImages: true),
    );
    final table = document.querySelector('table')!;
    expect(table.attributes['width'], isNull);
    expect(table.classes, contains('mail-fluid-table'));
    expect(table.attributes['style'], contains('width:100%!important'));
    expect(table.attributes['style'], contains('margin:0 16px'));
    expect(
      document.querySelector('td')!.attributes['style'],
      contains('padding:16px 16px'),
    );
    expect(
      document.querySelector('h1')!.attributes['style'],
      contains('clamp(20px,7vw,28px)'),
    );
    expect(
      document.querySelectorAll('style').last.text,
      contains('table-layout:fixed'),
    );
    expect(document.querySelector('#mail-scroll'), isNotNull);
  });

  test('keeps compact newsletter spacing and button tables intact', () {
    final document = parse(
      buildMailHtmlDocument('''
<table width="320" style="width:320px"><tr><td style="padding:12px 16px">
<table width="160" style="width:160px"><tr><td>Open</td></tr></table>
</td></tr></table>
''', loadImages: false),
    );
    final tables = document.querySelectorAll('table');
    expect(
      tables.every((table) => !table.classes.contains('mail-fluid-table')),
      isTrue,
    );
    expect(tables.first.attributes['width'], '320');
    expect(tables.last.attributes['style'], 'width:160px');
  });

  test('fits wide newsletter content with horizontal fallback', () {
    final document = buildMailHtmlDocument(
      '<table width="900"><tr><td>Wide newsletter</td></tr></table>',
      loadImages: true,
    );
    final parsed = parse(document);
    expect(parsed.querySelector('#mail-scroll #mail-content table'), isNotNull);
    expect(
      document,
      contains('#mail-scroll{width:100%;max-width:100%;overflow-x:auto'),
    );
    expect(document, contains('#mail-content>table{margin-inline:auto}'));
    expect(document, contains('#mail-content>div{margin-inline:auto}'));
    expect(document, contains('#mail-content table{max-width:100%!important}'));
    expect(parsed.querySelector('table')?.attributes['width'], isNull);
    expect(
      parsed.querySelector('table')?.classes,
      contains('mail-fluid-table'),
    );
  });

  test('reflows clipped fixed-width containers', () {
    final document = buildMailHtmlDocument(
      '<div style="width:900px;overflow:hidden"><div style="width:900px">Content</div></div>',
      loadImages: false,
    );
    final parsed = parse(document);
    expect(
      parsed
          .querySelector('#mail-scroll #mail-content div')
          ?.attributes['style'],
      contains('width:100%!important'),
    );
    expect(
      parsed.querySelector('#mail-scroll #mail-content div')?.classes,
      contains('mail-fluid-container'),
    );
    expect(document, contains('overflow:visible!important'));
  });

  test('preserves newsletter CSS while removing executable content', () {
    final result = sanitizeIsolatedMailHtml('''
<html><head><style>.newsletter { padding: 24px }</style></head><body>
<table class="newsletter"><tr><td style="color: red" onclick="steal()">
Hello<script>steal()</script><iframe src="https://evil.test"></iframe>
<a href="java&#x73;cript:steal()">Bad</a>
<a href="https://example.com">Good</a>
</td></tr></table></body></html>
''');
    final document = parse(result);
    expect(document.querySelector('style')?.text, contains('padding: 24px'));
    expect(document.querySelector('table')?.classes, contains('newsletter'));
    expect(document.querySelector('td')?.attributes['style'], 'color: red');
    expect(document.querySelectorAll('script, iframe, [onclick]'), isEmpty);
    expect(document.querySelectorAll('a').first.attributes['href'], isNull);
    expect(
      document.querySelectorAll('a').last.attributes['rel'],
      'noopener noreferrer',
    );
  });

  test('forced appearance overrides sender important colors and gradients', () {
    for (final mode in [
      MailMessageAppearance.dark,
      MailMessageAppearance.light,
    ]) {
      final document = parse(
        buildMailHtmlDocument(
          '''
<style>#offer {background:white!important;color:white!important}</style>
<table bgcolor="white"><tr><td id="offer"
style="background:linear-gradient(white,white)!important;color:white!important">
<a href="https://example.com">Offer</a>
<img src="https://example.com/logo.png"></td></tr></table>
''',
          loadImages: false,
          appearance: mode,
        ),
      );
      final cell = document.querySelector('#offer')!;
      final style = cell.attributes['style']!;
      expect(style, endsWith('background:transparent!important;'));
      expect(
        style,
        contains(
          mode == MailMessageAppearance.dark
              ? 'color:#e7e7e7!important'
              : 'color:#171717!important',
        ),
      );
      expect(document.querySelector('table')!.attributes['bgcolor'], isNull);
      expect(document.querySelector('img')!.attributes['style'], isNull);
      expect(
        document.querySelector('a')!.attributes['style'],
        contains('color:'),
      );
    }
  });

  test('inline images accept only authenticated raster replacements', () {
    final result = sanitizeIsolatedMailHtml(
      '<img src="cid:logo"><img src="data:image/svg+xml,bad"> '
      '<img src="file:///private/test"><img src="cid:unsafe">',
      inlineImages: {
        'logo': 'data:image/png;base64,aGVsbG8=',
        'unsafe': 'https://untrusted.test/track',
      },
    );
    final images = parse(result).querySelectorAll('img');
    expect(images[0].attributes['src'], 'data:image/png;base64,aGVsbG8=');
    expect(images[1].attributes['src'], isNull);
    expect(images[2].attributes['src'], isNull);
    expect(images[3].attributes['src'], 'cid:unsafe');
  });

  test('remote images require opt-in and scripts are always forbidden', () {
    for (final loadImages in [false, true]) {
      final document = parse(
        buildMailHtmlDocument(
          '<p>Hello</p><meta http-equiv="refresh" content="0;url=https://evil">',
          loadImages: loadImages,
        ),
      );
      final policy = document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')!
          .attributes['content']!;
      expect(policy, contains("script-src 'none'"));
      expect(policy, contains("connect-src 'none'"));
      expect(
        policy,
        contains(loadImages ? 'img-src https: data:' : 'img-src data:'),
      );
      expect(document.querySelector('meta[http-equiv="refresh"]'), isNull);
    }
  });
}
