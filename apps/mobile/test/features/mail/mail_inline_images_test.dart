import 'package:flutter_test/flutter_test.dart';
import 'package:html/parser.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_inline_images.dart';

const _png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

const _base = '/mail/api/v1/workspaces/ws-1/mail/mailboxes/box-1';

Map<String, dynamic> _file({
  String id = 'att-1',
  String? contentId = '<image001@EXAMPLE.test>',
  String contentType = 'image/png; name="image.png"',
  String disposition = 'inline',
  num sizeBytes = 2048,
}) => {
  'id': id,
  'contentId': contentId,
  'contentType': contentType,
  'disposition': disposition,
  'filename': 'image.png',
  'sizeBytes': sizeBytes,
};

void main() {
  group('mailContentIdFromSource', () {
    test('matches case, angle brackets and percent-encoding like web', () {
      expect(
        mailContentIdFromSource('CID:%3CIMAGE001%40example.test%3E'),
        'image001@example.test',
      );
      expect(mailContentIdFromSource('cid:ii_abc'), 'ii_abc');
    });

    test('accepts a stored Mail draft path prefix', () {
      expect(
        mailContentIdFromSource(
          'https://mail.tuturuuu.com$_base/drafts/d-1cid:abc%40tuturuuu.mail',
        ),
        'abc@tuturuuu.mail',
      );
    });

    test("resolves only this message's attachment URLs", () {
      final ids = {'att-1': '<Inline@x>'};
      expect(
        mailContentIdFromSource(
          '$_base/messages/m-1/attachments/att-1?preview=1',
          attachmentContentIds: ids,
        ),
        'inline@x',
      );
      expect(
        mailContentIdFromSource(
          '$_base/messages/m-1/attachments/other',
          attachmentContentIds: ids,
        ),
        isNull,
      );
      expect(mailContentIdFromSource('https://example.com/a.png'), isNull);
    });
  });

  group('mailInlineImageFiles', () {
    test('selects an image whose MIME type carries parameters', () {
      final selected = mailInlineImageFiles(
        '<p>helppp</p><img src="CID:%3CIMAGE001%40example.test%3E">',
        [_file()],
      );
      expect(selected, hasLength(1));
      expect(selected.single.contentId, 'image001@example.test');
      expect(selected.single.contentType, 'image/png');
    });

    test('selects an image referenced by its attachment URL', () {
      final html = rewriteMailInlineAttachmentUrls(
        '<img src="https://mail.tuturuuu.com$_base/messages/m-1/attachments/att-1">',
        mailAttachmentContentIds([_file()]),
      );
      expect(html, contains('cid:image001%40EXAMPLE.test'));
      expect(mailInlineImageFiles(html, [_file()]), hasLength(1));
    });

    test('skips unreferenced, unsupported and oversized attachments', () {
      const html = '<img src="cid:image001@example.test">';
      expect(mailInlineImageFiles('<p>none</p>', [_file()]), isEmpty);
      expect(
        mailInlineImageFiles(html, [_file(contentType: 'image/svg+xml')]),
        isEmpty,
      );
      expect(
        mailInlineImageFiles(html, [_file(sizeBytes: 5 * 1024 * 1024)]),
        isEmpty,
      );
      expect(mailInlineImageFiles(html, [_file(contentId: null)]), isEmpty);
    });
  });

  group('rendered document', () {
    test('embeds a resolved image and links it to the full viewer', () {
      final document = parse(
        buildMailHtmlDocument(
          '<img src="CID:%3CIMAGE001%40example.test%3E" alt="Inline">',
          loadImages: false,
          inlineImages: const {'image001@example.test': _png},
        ),
      );
      final image = document.querySelector('#mail-content img')!;
      expect(image.attributes['src'], _png);
      expect(
        image.attributes[mailInlineImageAttribute],
        'image001@example.test',
      );
      expect(
        image.parent!.attributes['href'],
        '$mailInlineImageScheme:image001%40example.test',
      );
    });

    test('keeps an existing link around a resolved image', () {
      final document = parse(
        buildMailHtmlDocument(
          '<a href="https://example.com"><img src="cid:image001@example.test"></a>',
          loadImages: false,
          inlineImages: const {'image001@example.test': _png},
        ),
      );
      expect(
        document.querySelector('#mail-content img')!.parent!.attributes['href'],
        'https://example.com',
      );
    });

    test('shows a placeholder until the bytes arrive', () {
      final html = buildMailHtmlDocument(
        '<img src="$_base/drafts/d-1cid:abc%40tuturuuu.mail">',
        loadImages: false,
      );
      final document = parse(html);
      expect(
        document.querySelector('#mail-content img')!.attributes['src'],
        'cid:abc%40tuturuuu.mail',
      );
      expect(html, contains('img[src^="cid:"]'));
    });
  });
}
