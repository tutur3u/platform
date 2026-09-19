import 'package:flutter_test/flutter_test.dart';
import 'package:html/parser.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_html_sanitizer.dart';

void main() {
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
