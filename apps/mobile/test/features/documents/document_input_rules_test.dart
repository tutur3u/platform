import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/documents/documents_content.dart';
import 'package:mobile/features/documents/view/document_input_rules.dart';

/// Types [text] one character at a time, running the input rules after
/// each keystroke as the editor does.
QuillController _type(String text, {QuillController? into}) {
  final editor = into ?? QuillController.basic();
  for (final char in text.split('')) {
    final offset = editor.selection.baseOffset;
    editor.replaceText(
      offset,
      0,
      char,
      TextSelection.collapsed(offset: offset + 1),
    );
    applyDocumentInputRules(editor, offset: offset, typed: char);
  }
  return editor;
}

String _text(QuillController editor) =>
    editor.document.toPlainText().replaceAll('\n', '');

void main() {
  group('Document input rules match the web', () {
    for (final (typed, expected) in [
      ('a -> b', 'a → b'),
      ('x => y', 'x ⇒ y'),
      ('1 != 2', '1 ≠ 2'),
      ('wait...', 'wait…'),
      ('(c) 2026', '© 2026'),
      ('a <-> b', 'a ↔ b'),
      ('a --> b', 'a ⟶ b'),
      ('back <- here', 'back ← here'),
      ('range -- end', 'range – end'),
    ]) {
      test('"$typed" becomes "$expected"', () {
        final editor = _type(typed);
        addTearDown(editor.dispose);
        expect(_text(editor), expected);
        expect(editor.selection.baseOffset, expected.length);
      });
    }

    test('ambiguous triggers wait for a space', () {
      final editor = _type('a <-');
      addTearDown(editor.dispose);
      expect(_text(editor), 'a <-');
    });

    test('code keeps the typed characters', () {
      final editor = QuillController.basic();
      addTearDown(editor.dispose);
      editor.formatSelection(Attribute.codeBlock);
      _type('a -> b', into: editor);
      expect(_text(editor), 'a -> b');
    });

    test('--- on an empty line becomes a divider', () {
      final editor = _type('Plan\n---');
      addTearDown(editor.dispose);
      final payload = documentContentPayload(editor.document) as Map;
      final types = [
        for (final node in payload['content'] as List) (node as Map)['type'],
      ];
      expect(types, contains('horizontalRule'));
      expect(jsonEncode(payload), isNot(contains('---')));
    });

    test('a typed character is read from a local change', () async {
      final editor = QuillController.basic();
      addTearDown(editor.dispose);
      DocChange? last;
      final subscription = editor.document.changes.listen((c) => last = c);
      addTearDown(subscription.cancel);
      editor
        ..replaceText(0, 0, 'ab', const TextSelection.collapsed(offset: 2))
        ..replaceText(2, 0, 'c', const TextSelection.collapsed(offset: 3));
      // The change stream delivers asynchronously.
      await Future<void>.delayed(Duration.zero);
      expect(documentTypedCharacter(last!), (offset: 2, typed: 'c'));
    });
  });
}
