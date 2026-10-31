import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/tiptap_document_codec.dart';

Map<String, dynamic> _doc(List<Object?> content) => {
  'type': 'doc',
  'content': content,
};

Map<String, dynamic> _paragraph(String? text) => {
  'type': 'paragraph',
  'content': [
    if (text != null) {'type': 'text', 'text': text},
  ],
};

void main() {
  group('decodeTipTapDescription', () {
    test('treats null, empty and whitespace as empty', () {
      for (final raw in <String?>[null, '', '   \n\t']) {
        final decoded = decodeTipTapDescription(raw);
        expect(decoded.trimmed, isEmpty);
        expect(decoded.isEmpty, isTrue);
        expect(decoded.isTipTapDocument, isFalse);
        expect(decoded.document, isNull);
      }
    });

    test('keeps plain text trimmed and not a document', () {
      final decoded = decodeTipTapDescription('  hello world \n');

      expect(decoded.trimmed, 'hello world');
      expect(decoded.isEmpty, isFalse);
      expect(decoded.isTipTapDocument, isFalse);
    });

    test('decodes a JSON object whose type is doc', () {
      final raw = jsonEncode(_doc([_paragraph('hi')]));
      final decoded = decodeTipTapDescription('  $raw  ');

      expect(decoded.isTipTapDocument, isTrue);
      expect(decoded.trimmed, raw);
      expect(decoded.document?['type'], 'doc');
    });

    test('falls back to text for JSON objects that are not docs', () {
      final decoded = decodeTipTapDescription('{"type":"paragraph"}');

      expect(decoded.isTipTapDocument, isFalse);
      expect(decoded.trimmed, '{"type":"paragraph"}');
    });

    test('falls back to text for malformed JSON', () {
      final decoded = decodeTipTapDescription('{"type":"doc",');

      expect(decoded.isTipTapDocument, isFalse);
      expect(decoded.trimmed, '{"type":"doc",');
    });

    test('does not attempt to decode text that is not an object', () {
      final decoded = decodeTipTapDescription('["doc"]');

      expect(decoded.isTipTapDocument, isFalse);
      expect(decoded.trimmed, '["doc"]');
    });
  });

  group('normalizeTipTapDescriptionPayload', () {
    test('returns null for blank input', () {
      expect(normalizeTipTapDescriptionPayload(''), isNull);
      expect(normalizeTipTapDescriptionPayload('  \n '), isNull);
    });

    test('returns trimmed plain text unchanged', () {
      expect(normalizeTipTapDescriptionPayload('  note  '), 'note');
    });

    test('re-encodes a document that has visible content', () {
      final doc = _doc([_paragraph('hello')]);

      expect(
        normalizeTipTapDescriptionPayload('  ${jsonEncode(doc)}  '),
        jsonEncode(doc),
      );
    });

    test('returns null for a document with only blank paragraphs', () {
      final raw = jsonEncode(_doc([_paragraph(null), _paragraph('   ')]));

      expect(normalizeTipTapDescriptionPayload(raw), isNull);
    });

    test('returns null for a doc without content', () {
      expect(normalizeTipTapDescriptionPayload('{"type":"doc"}'), isNull);
    });

    test('returns the trimmed original for a malformed document', () {
      const raw = ' {"type":"doc","content":"oops"} ';

      expect(
        normalizeTipTapDescriptionPayload(raw),
        '{"type":"doc","content":"oops"}',
      );
    });

    test('returns the trimmed original when JSON is not valid', () {
      expect(normalizeTipTapDescriptionPayload(' {nope '), '{nope');
    });
  });

  group('tipTapNodeHasContent', () {
    test('is true for non-blank text nodes', () {
      expect(tipTapNodeHasContent({'type': 'text', 'text': 'x'}), isTrue);
    });

    test('is false for blank or missing text', () {
      expect(tipTapNodeHasContent({'type': 'text', 'text': '  '}), isFalse);
      expect(tipTapNodeHasContent({'type': 'text'}), isFalse);
    });

    test('is false for text that is not a string', () {
      expect(tipTapNodeHasContent({'type': 'text', 'text': 4}), isFalse);
    });

    test('is true for embed and divider nodes without content', () {
      for (final type in [
        'image',
        'imageResize',
        'video',
        'youtube',
        'mention',
        'horizontalRule',
      ]) {
        expect(tipTapNodeHasContent({'type': type}), isTrue, reason: type);
      }
    });

    test('is false for container nodes with no content or empty content', () {
      expect(tipTapNodeHasContent({'type': 'paragraph'}), isFalse);
      expect(
        tipTapNodeHasContent({'type': 'paragraph', 'content': <Object?>[]}),
        isFalse,
      );
    });

    test('is true when any nested child has content', () {
      final node = _doc([
        _paragraph(null),
        {
          'type': 'bulletList',
          'content': [
            {
              'type': 'listItem',
              'content': [_paragraph('deep')],
            },
          ],
        },
      ]);

      expect(tipTapNodeHasContent(node), isTrue);
    });

    test('counts an embed nested in a paragraph as content', () {
      final node = {
        'type': 'paragraph',
        'content': [
          {'type': 'image'},
        ],
      };

      expect(tipTapNodeHasContent(node), isTrue);
    });

    test('is false for malformed nodes', () {
      expect(tipTapNodeHasContent(null), isFalse);
      expect(tipTapNodeHasContent('text'), isFalse);
      expect(tipTapNodeHasContent({'content': <Object?>[]}), isFalse);
      expect(tipTapNodeHasContent({'type': 3}), isFalse);
      expect(
        tipTapNodeHasContent({'type': 'paragraph', 'content': 'x'}),
        isFalse,
      );
    });

    test('a malformed child makes the whole tree not content', () {
      final node = _doc([_paragraph('real text'), 'garbage']);

      expect(tipTapNodeHasContent(node), isFalse);
    });

    test('accepts maps with non-string keys by ignoring those keys', () {
      final node = <Object?, Object?>{'type': 'text', 'text': 'ok', 1: 'x'};

      expect(tipTapNodeHasContent(node), isTrue);
    });
  });
}
