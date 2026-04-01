import 'dart:convert';

import 'package:dart_quill_delta/dart_quill_delta.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_tiptap_converter.dart';

void main() {
  group('task description TipTap converter', () {
    test('round-trips formatted text to TipTap-compatible JSON', () {
      final delta = Delta()
        ..insert('Hello', {'bold': true})
        ..insert('\n', {'header': 1})
        ..insert('Item one')
        ..insert('\n', {'list': 'bullet'})
        ..insert('Item two')
        ..insert('\n', {'list': 'bullet'});
      final document = Document.fromDelta(delta);

      final serialized = quillDocumentToTipTapJson(document);
      expect(serialized, isNotNull);

      final decoded = jsonDecode(serialized!) as Map<String, dynamic>;
      expect(decoded['type'], 'doc');
      final content = (decoded['content'] as List).cast<Map<String, dynamic>>();

      expect(content.first['type'], 'heading');
      expect(content.first['attrs'], {'level': 1});
      expect(content.first['content'], isA<List<dynamic>>());

      final listNode = content[1];
      expect(listNode['type'], 'bulletList');
      final listContent = (listNode['content'] as List)
          .cast<Map<String, dynamic>>();
      expect(listContent.length, 2);
    });

    test('treats empty quill document as null payload', () {
      final document = Document();
      final serialized = quillDocumentToTipTapJson(document);
      expect(serialized, isNull);
    });

    test('converts TipTap JSON to editable quill document', () {
      const tiptap =
          '{"type":"doc","content":['
          '{"type":"paragraph","content":[{"type":"text","text":"Lorem"}]},'
          '{"type":"paragraph","content":[{"type":"text","text":"Ipsum"}]}'
          ']}';

      final document = tipTapJsonToQuillDocument(tiptap);
      final plainText = document.toPlainText();
      expect(plainText, contains('Lorem'));
      expect(plainText, contains('Ipsum'));
    });

    test('falls back to plain text when payload is not JSON', () {
      final document = tipTapJsonToQuillDocument('plain text payload');
      expect(document.toPlainText(), contains('plain text payload'));
    });

    test('converts quill checklist items to TipTap taskList/taskItem', () {
      final delta = Delta()
        ..insert('First item')
        ..insert('\n', {'list': 'unchecked'})
        ..insert('Second item')
        ..insert('\n', {'list': 'checked'});
      final document = Document.fromDelta(delta);

      final serialized = quillDocumentToTipTapJson(document);
      expect(serialized, isNotNull);

      final decoded = jsonDecode(serialized!) as Map<String, dynamic>;
      final content = (decoded['content'] as List).cast<Map<String, dynamic>>();
      expect(content.first['type'], 'taskList');

      final taskItems = (content.first['content'] as List)
          .cast<Map<String, dynamic>>();
      expect(taskItems.length, 2);
      expect((taskItems.first['attrs'] as Map)['checked'], isFalse);
      expect((taskItems.last['attrs'] as Map)['checked'], isTrue);
    });

    test('converts TipTap taskList/taskItem to quill checklist lines', () {
      const tiptap =
          '{"type":"doc","content":[{"type":"taskList","content":['
          '{"type":"taskItem","attrs":{"checked":false},'
          '"content":[{"type":"paragraph","content":['
          '{"type":"text","text":"Unchecked"}]}]},'
          '{"type":"taskItem","attrs":{"checked":true},'
          '"content":[{"type":"paragraph","content":['
          '{"type":"text","text":"Checked"}]}]}'
          ']}]}';

      final document = tipTapJsonToQuillDocument(tiptap);
      final ops = document.toDelta().toJson();
      expect(
        ops.any(
          (op) =>
              op['insert'] == '\n' &&
              (op['attributes'] as Map?)?['list'] == 'unchecked',
        ),
        isTrue,
      );
      expect(
        ops.any(
          (op) =>
              op['insert'] == '\n' &&
              (op['attributes'] as Map?)?['list'] == 'checked',
        ),
        isTrue,
      );
    });
  });
}
