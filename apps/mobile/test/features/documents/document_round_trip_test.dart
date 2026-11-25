import 'dart:convert';

import 'package:dart_quill_delta/dart_quill_delta.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/documents/documents_content.dart';
import 'package:mobile/features/tasks_boards/utils/quill_to_tiptap_converter.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_models.dart';

import 'document_round_trip_fixtures.dart';

DocumentContentSnapshot _load(Map<String, dynamic> doc) =>
    DocumentContentSnapshot.parse(jsonEncode(doc));

List<String> _encoded(Object payload) => [
  for (final node in (payload as Map)['content'] as List) jsonEncode(node),
];

List<String> _original(Map<String, dynamic> doc) => [
  for (final node in doc['content'] as List) jsonEncode(node),
];

/// The offset just after [needle] in the editor's text.
int _offsetAfter(Document document, String needle) {
  final index = document.toPlainText().indexOf(needle);
  expect(index, isNonNegative, reason: 'missing "$needle"');
  return index + needle.length;
}

/// The first text run inside [node], or null when it has none.
String? _firstText(Object? node) {
  if (node is! Map) return null;
  final text = node['text'];
  if (text is String && text.trim().isNotEmpty) return text.split('\n').first;
  final content = node['content'];
  if (content is! List) return null;
  for (final child in content) {
    final found = _firstText(child);
    if (found != null) return found;
  }
  return null;
}

void main() {
  group('Document content round-trips with the web', () {
    for (final MapEntry(key: name, value: doc) in roundTripFixtures.entries) {
      final original = _original(doc);

      test('$name: an unedited document saves byte-identical JSON', () {
        final snapshot = _load(doc);
        final payload = snapshot.payloadFor(snapshot.toQuill());
        expect(jsonEncode(payload), jsonEncode(doc));
      });

      test('$name: a new first line keeps every block verbatim', () {
        final snapshot = _load(doc);
        // A plain line of its own, not a continuation of the first block.
        final document = Document.fromDelta(
          (Delta()..insert('Intro\n')).concat(snapshot.delta),
        );
        final saved = _encoded(snapshot.payloadFor(document));
        expect(saved.skip(1).toList(), original);
        expect(saved.first, contains('Intro'));
      });

      test('$name: editing one block keeps the others in place', () {
        var edited = 0;
        for (var target = 0; target < original.length; target++) {
          final snapshot = _load(doc);
          final document = snapshot.toQuill();
          final needle = _firstText(jsonDecode(original[target]));
          // Text inside an embed (a table cell, a toggle) is not editable.
          if (needle == null || !document.toPlainText().contains(needle)) {
            continue;
          }
          document.insert(_offsetAfter(document, needle), ' edited');
          edited++;
          final saved = _encoded(snapshot.payloadFor(document));
          final reason = '$name: editing block $target';
          // Every block before and after the edited one is unchanged and
          // in order; the edited block's own conversion sits between.
          final before = original.take(target).toList();
          final after = original.skip(target + 1).toList();
          expect(saved.take(before.length).toList(), before, reason: reason);
          expect(
            saved.skip(saved.length - after.length).toList(),
            after,
            reason: reason,
          );
          final middle = saved
              .skip(before.length)
              .take(saved.length - before.length - after.length)
              .join();
          expect(middle, contains(' edited'), reason: reason);
          expect(saved, isNot(contains(original[target])), reason: reason);
        }
        expect(edited, greaterThan(0), reason: '$name edited no blocks');
      });
    }

    test('empty blocks are never duplicated', () {
      final doc = roundTripFixtures['headings and marks']!;
      final snapshot = _load(doc);
      final document = snapshot.toQuill();
      document.insert(_offsetAfter(document, 'Heading 1'), '!');
      final saved = _encoded(snapshot.payloadFor(document));
      expect(saved, hasLength(_original(doc).length));
      expect(saved.last, _original(doc).last);
    });

    test('adjacent code blocks keep their languages', () {
      final doc = roundTripFixtures['adjacent blocks of one kind']!;
      final snapshot = _load(doc);
      final document = snapshot.toQuill();
      document.insert(_offsetAfter(document, 'Closing'), '!');
      final saved = _encoded(snapshot.payloadFor(document));
      final original = _original(doc);
      expect(saved.take(5).toList(), original.take(5).toList());
      expect(saved, hasLength(original.length));
    });

    test('a new list item joins the list it continues', () {
      final doc = {
        'type': 'doc',
        'content': [
          {
            'type': 'bulletList',
            'content': [
              item([
                {
                  'type': 'paragraph',
                  'attrs': {'textAlign': null},
                  'content': [text('One')],
                },
              ]),
            ],
          },
        ],
      };
      final snapshot = _load(doc);
      final document = snapshot.toQuill();
      document.insert(_offsetAfter(document, 'One'), '\nTwo');
      final content = snapshot.payloadFor(document)['content'] as List;
      expect(content, hasLength(1));
      expect(jsonEncode(content), allOf(contains('One'), contains('Two')));
    });

    test('a deleted web-only card is gone', () {
      final doc = roundTripFixtures['media, tables and atoms']!;
      final snapshot = _load(doc);
      final document = snapshot.toQuill();
      var offset = 0;
      for (final op in document.toDelta().toList()) {
        final data = op.data;
        if (data is Map && jsonEncode(data).contains('citationBibliography')) {
          break;
        }
        offset += op.length!;
      }
      document.delete(offset, 1);
      final saved = jsonEncode(snapshot.payloadFor(document));
      expect(saved, isNot(contains('citationBibliography')));
      expect(saved, contains('futureWebNode'));
    });

    test('a cleared document saves no blocks', () {
      final doc = roundTripFixtures['media, tables and atoms']!;
      final snapshot = _load(doc);
      final document = snapshot.toQuill();
      document.delete(0, document.length - 1);
      expect(snapshot.payloadFor(document)['content'], isEmpty);
    });

    test('a new blank line in the middle saves as an empty paragraph', () {
      final doc = roundTripFixtures['quotes, code and rules']!;
      final snapshot = _load(doc);
      final document = snapshot.toQuill();
      document.insert(document.toPlainText().indexOf('Closing'), '\n');
      final saved = _encoded(snapshot.payloadFor(document));
      final original = _original(doc);
      expect(saved, hasLength(original.length + 1));
      expect(saved.last, original.last);
    });

    test('text typed beside a web-only block keeps both', () {
      final document = Document.fromJson([
        {'insert': 'Before'},
        {
          'insert': {
            tipTapBlockEmbedType: jsonEncode({
              'type': 'details',
              'content': <Object>[],
            }),
          },
        },
        {
          'insert': '\n',
          'attributes': {'header': 2},
        },
        {'insert': 'After\n'},
      ]);
      final json = jsonDecode(quillDocumentToTipTapJson(document)!) as Map;
      final nodes = (json['content'] as List).cast<Map<String, dynamic>>();
      expect(nodes.map((node) => node['type']), [
        'heading',
        'details',
        'paragraph',
      ]);
      expect(jsonEncode(json), allOf(contains('Before'), contains('After')));
    });

    test('plain-text content saves as a TipTap document', () {
      final snapshot = DocumentContentSnapshot.parse('Quarterly plan');
      final payload = snapshot.payloadFor(snapshot.toQuill());
      expect(payload['type'], 'doc');
      expect(jsonEncode(payload), contains('Quarterly plan'));
    });
  });
}
