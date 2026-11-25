import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/documents/documents_content.dart';
import 'package:mobile/features/documents/view/document_format_actions.dart';
import 'package:mobile/features/documents/view/document_input_rules.dart';

import 'document_round_trip_fixtures.dart';

Map<String, dynamic> _plainParagraph(String value) => {
  'type': 'paragraph',
  'attrs': {'textAlign': null},
  'content': [text(value)],
};

Map<String, dynamic> _list(String type, List<String> items) => {
  'type': type,
  if (type == 'orderedList') 'attrs': {'start': 4, 'type': null},
  'content': [
    for (final value in items) item([_plainParagraph(value)]),
  ],
};

List<String> _saved(Map<String, dynamic> doc, String after, String typed) {
  final snapshot = DocumentContentSnapshot.parse(jsonEncode(doc));
  final document = snapshot.toQuill();
  final index = document.toPlainText().indexOf(after);
  expect(index, isNonNegative);
  document.insert(index + after.length, typed);
  return [
    for (final node in snapshot.payloadFor(document)['content'] as List)
      jsonEncode(node),
  ];
}

void main() {
  group('Edited documents keep their neighbours', () {
    test('editing one of two adjacent lists keeps them separate', () {
      final first = _list('bulletList', ['a1', 'a2']);
      final second = _list('bulletList', ['b1']);
      final saved = _saved(
        {
          'type': 'doc',
          'content': [first, second],
        },
        'a2',
        '!',
      );
      expect(saved, hasLength(2));
      expect(saved.last, jsonEncode(second));
      expect(saved.first, contains('a2!'));
      expect(saved.first, isNot(contains('b1')));
    });

    test('a new item joins the list it extends', () {
      final list = _list('bulletList', ['a1']);
      final saved = _saved(
        {
          'type': 'doc',
          'content': [list, _plainParagraph('After')],
        },
        'a1',
        '\na2',
      );
      expect(saved, hasLength(2));
      expect(saved.first, allOf(contains('a1'), contains('a2')));
    });

    test('an edited code block keeps its language', () {
      final saved = _saved(
        {
          'type': 'doc',
          'content': [
            {
              'type': 'codeBlock',
              'attrs': {'language': 'typescript'},
              'content': [text('const a = 1;')],
            },
          ],
        },
        'const a',
        'b',
      );
      expect(saved.single, contains('"language":"typescript"'));
      expect(saved.single, contains('const ab = 1;'));
    });

    test('an edited ordered list keeps its start', () {
      final saved = _saved(
        {
          'type': 'doc',
          'content': [
            _list('orderedList', ['four']),
          ],
        },
        'four',
        '!',
      );
      expect(saved.single, contains('"start":4'));
    });

    test('a block with nothing to show keeps its place', () {
      final hidden = {
        'type': 'imageResize',
        'attrs': {'src': ''},
      };
      final saved = _saved(
        {
          'type': 'doc',
          'content': [hidden, _plainParagraph('Body')],
        },
        'Body',
        '!',
      );
      expect(saved, hasLength(2));
      expect(saved.first, jsonEncode(hidden));
    });
  });

  group('Clearing a highlight matches the web', () {
    test('a separate text colour stays', () {
      final editor = QuillController.basic();
      addTearDown(editor.dispose);
      editor.document.insert(0, 'Plan');
      editor.updateSelection(
        const TextSelection(baseOffset: 0, extentOffset: 4),
        ChangeSource.local,
      );
      applyDocumentSwatch(editor, DocumentColorChannel.highlight, 'red');
      applyDocumentSwatch(editor, DocumentColorChannel.text, 'blue');
      applyDocumentSwatch(editor, DocumentColorChannel.highlight, null);
      final saved = jsonEncode(documentContentPayload(editor.document));
      expect(saved, isNot(contains('highlight')));
      expect(saved, contains('"color":"var(--blue)"'));
    });

    test("the highlight's own text colour goes with it", () {
      final editor = QuillController.basic();
      addTearDown(editor.dispose);
      editor.document.insert(0, 'Plan');
      editor.updateSelection(
        const TextSelection(baseOffset: 0, extentOffset: 4),
        ChangeSource.local,
      );
      applyDocumentSwatch(editor, DocumentColorChannel.highlight, 'red');
      applyDocumentSwatch(editor, DocumentColorChannel.highlight, null);
      final saved = jsonEncode(documentContentPayload(editor.document));
      expect(saved, isNot(contains('var(--')));
    });
  });

  group('Divider input rules match the web', () {
    for (final trigger in documentDividerTriggers) {
      test('"$trigger" on its own line becomes a divider', () {
        final editor = QuillController.basic();
        addTearDown(editor.dispose);
        for (final char in 'Plan\n$trigger'.split('')) {
          final offset = editor.selection.baseOffset;
          editor.replaceText(
            offset,
            0,
            char,
            TextSelection.collapsed(offset: offset + 1),
          );
          applyDocumentInputRules(editor, offset: offset, typed: char);
        }
        final saved = jsonEncode(documentContentPayload(editor.document));
        expect(saved, contains('horizontalRule'));
        expect(saved, isNot(contains(trigger.trim())));
      });
    }
  });

  group('Dividers survive what follows them', () {
    List<Object?> typesAfter(void Function(QuillController editor) edit) {
      final editor = QuillController.basic();
      addTearDown(editor.dispose);
      edit(editor);
      return [
        for (final node
            in (documentContentPayload(editor.document) as Map)['content']
                as List)
          (node as Map)['type'],
      ];
    }

    void type(QuillController editor, String value) {
      for (final char in value.split('')) {
        final offset = editor.selection.baseOffset;
        editor.replaceText(
          offset,
          0,
          char,
          TextSelection.collapsed(offset: offset + 1),
        );
        applyDocumentInputRules(editor, offset: offset, typed: char);
      }
    }

    test('typing after --- starts a paragraph below the rule', () {
      expect(typesAfter((editor) => type(editor, 'Plan\n---Section 2')), [
        'paragraph',
        'horizontalRule',
        'paragraph',
      ]);
    });

    test('a divider at the start of a line keeps that line', () {
      expect(
        typesAfter((editor) {
          editor.document.insert(0, 'Plan');
          editor.updateSelection(
            const TextSelection.collapsed(offset: 0),
            ChangeSource.local,
          );
          insertDocumentDivider(editor);
        }),
        ['horizontalRule', 'paragraph'],
      );
    });

    test('a divider typed in a list item is a rule, not a list item', () {
      final types = typesAfter((editor) {
        editor.formatSelection(Attribute.ul);
        type(editor, '---');
      });
      expect(types.first, 'horizontalRule');
    });
  });

  test('aligning an edited heading back to the left is saved', () {
    final doc = {
      'type': 'doc',
      'content': [
        {
          'type': 'heading',
          'attrs': {'level': 2, 'textAlign': 'center'},
          'content': [text('Title')],
        },
      ],
    };
    final snapshot = DocumentContentSnapshot.parse(jsonEncode(doc));
    final document = snapshot.toQuill()
      ..format(0, 5, Attribute.clone(Attribute.align, null));
    final saved = jsonEncode(snapshot.payloadFor(document));
    expect(saved, isNot(contains('center')));
  });
}
