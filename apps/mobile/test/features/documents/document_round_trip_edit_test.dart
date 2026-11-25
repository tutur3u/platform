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

  group('A divider that splits a block keeps its settings', () {
    Map<String, dynamic> splitAt(Map<String, dynamic> block, String after) {
      final snapshot = DocumentContentSnapshot.parse(
        jsonEncode({
          'type': 'doc',
          'content': [block],
        }),
      );
      final editor = QuillController(
        document: snapshot.toQuill(),
        selection: const TextSelection.collapsed(offset: 0),
      );
      addTearDown(editor.dispose);
      final index = editor.document.toPlainText().indexOf(after);
      editor.updateSelection(
        TextSelection.collapsed(offset: index + after.length),
        ChangeSource.local,
      );
      insertDocumentDivider(editor);
      return snapshot.payloadFor(editor.document);
    }

    test('both halves of a code block keep its language', () {
      final saved = splitAt({
        'type': 'codeBlock',
        'attrs': {'language': 'dart'},
        'content': [text('final a = 1;\nfinal b = 2;')],
      }, 'final a = 1;');
      final nodes = (saved['content'] as List).cast<Map<String, dynamic>>();
      final code = nodes.where((node) => node['type'] == 'codeBlock');
      expect(code, hasLength(2));
      for (final node in code) {
        expect(node['attrs'], {'language': 'dart'});
      }
      expect(nodes.map((node) => node['type']), contains('horizontalRule'));
    });

    test('the second half of an ordered list continues its numbers', () {
      final saved = splitAt(_list('orderedList', ['four', 'five']), 'four');
      final lists = [
        for (final node in saved['content'] as List)
          if ((node as Map)['type'] == 'orderedList') node,
      ];
      expect(lists, hasLength(2));
      expect((lists.first['attrs'] as Map)['start'], 4);
      expect((lists.last['attrs'] as Map)['start'], 5);
    });
  });

  test('a toolbar divider on an empty line takes its place', () {
    final editor = QuillController.basic();
    addTearDown(editor.dispose);
    editor.document.insert(0, 'Plan\n\nNext');
    editor.updateSelection(
      const TextSelection.collapsed(offset: 5),
      ChangeSource.local,
    );
    insertDocumentDivider(editor);
    final types = [
      for (final node
          in (documentContentPayload(editor.document) as Map)['content']
              as List)
        (node as Map)['type'],
    ];
    expect(types, ['paragraph', 'horizontalRule', 'paragraph']);
    expect(
      editor.selection.baseOffset,
      editor.document.toPlainText().indexOf('Next'),
    );
  });

  test('a toolbar divider at the end of a line keeps a blank line below', () {
    final editor = QuillController.basic();
    addTearDown(editor.dispose);
    editor.document.insert(0, 'Plan\n\nNext');
    editor.updateSelection(
      const TextSelection.collapsed(offset: 4),
      ChangeSource.local,
    );
    insertDocumentDivider(editor);
    final types = [
      for (final node
          in (documentContentPayload(editor.document) as Map)['content']
              as List)
        (node as Map)['type'],
    ];
    expect(types, ['paragraph', 'horizontalRule', 'paragraph', 'paragraph']);
  });

  test('a divider on an empty last heading leaves a plain line', () {
    final editor = QuillController.basic();
    addTearDown(editor.dispose);
    editor.document.insert(0, 'Plan\n');
    editor
      ..updateSelection(
        const TextSelection.collapsed(offset: 5),
        ChangeSource.local,
      )
      ..formatSelection(Attribute.h1);
    insertDocumentDivider(editor);
    final types = [
      for (final node
          in (documentContentPayload(editor.document) as Map)['content']
              as List)
        (node as Map)['type'],
    ];
    expect(types, isNot(contains('heading')));
    expect(types.take(2), ['paragraph', 'horizontalRule']);
  });

  test('splitting a list with no stored start numbers on from one', () {
    final list = {
      'type': 'orderedList',
      'content': [
        item([_plainParagraph('one')]),
        item([_plainParagraph('two')]),
      ],
    };
    final snapshot = DocumentContentSnapshot.parse(
      jsonEncode({
        'type': 'doc',
        'content': [list],
      }),
    );
    final editor = QuillController(
      document: snapshot.toQuill(),
      selection: const TextSelection.collapsed(offset: 3),
    );
    addTearDown(editor.dispose);
    insertDocumentDivider(editor);
    final lists = [
      for (final node
          in snapshot.payloadFor(editor.document)['content'] as List)
        if ((node as Map)['type'] == 'orderedList') node,
    ];
    expect(lists, hasLength(2));
    expect(lists.first.containsKey('attrs'), isFalse);
    expect((lists.last['attrs'] as Map)['start'], 2);
  });
}
