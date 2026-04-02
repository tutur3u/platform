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

    test(
      'maps TipTap mention into a Quill inline embed '
      'and table into a block embed',
      () {
        final tiptap = jsonEncode({
          'type': 'doc',
          'content': [
            {
              'type': 'paragraph',
              'content': [
                {
                  'type': 'mention',
                  'attrs': {'displayName': 'Sam'},
                },
              ],
            },
            {
              'type': 'table',
              'content': [
                {
                  'type': 'tableRow',
                  'content': [
                    {
                      'type': 'tableHeader',
                      'content': [
                        {
                          'type': 'paragraph',
                          'content': [
                            {'type': 'text', 'text': 'A'},
                          ],
                        },
                      ],
                    },
                    {
                      'type': 'tableHeader',
                      'content': [
                        {
                          'type': 'paragraph',
                          'content': [
                            {'type': 'text', 'text': 'B'},
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        });

        final document = tipTapJsonToQuillDocument(tiptap);
        final ops = document.toDelta().toJson();

        // Mention must be a Quill embed with the attrs JSON, not plain @Sam.
        final hasMentionEmbed = ops.any(
          (op) =>
              op['insert'] is Map &&
              (op['insert'] as Map).containsKey('mention'),
        );
        expect(hasMentionEmbed, isTrue);
        // The mention embed must carry the original displayName.
        final mentionOp = ops.firstWhere(
          (op) =>
              op['insert'] is Map &&
              (op['insert'] as Map).containsKey('mention'),
        );
        final mentionJson =
            jsonDecode((mentionOp['insert'] as Map)['mention'] as String)
                as Map<String, dynamic>;
        expect(mentionJson['displayName'], equals('Sam'));

        // Table must be a Quill block embed, not pipe-delimited plain text.
        final hasTableEmbed = ops.any(
          (op) =>
              op['insert'] is Map && (op['insert'] as Map).containsKey('table'),
        );
        expect(hasTableEmbed, isTrue);
      },
    );

    test('maps TipTap video blocks into a Quill video embed', () {
      final tiptap = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'video',
            'attrs': {'src': 'https://cdn.example.com/demo.mp4'},
          },
        ],
      });

      final document = tipTapJsonToQuillDocument(tiptap);
      final ops = document.toDelta().toJson();

      // The video should be stored as a Quill block embed, not plain text.
      final hasVideoEmbed = ops.any(
        (op) =>
            op['insert'] is Map &&
            (op['insert'] as Map)['video'] ==
                'https://cdn.example.com/demo.mp4',
      );
      expect(hasVideoEmbed, isTrue);
    });

    test('maps TipTap image blocks into a Quill image embed', () {
      final tiptap = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'imageResize',
            'attrs': {'src': 'https://cdn.example.com/photo.jpg'},
          },
        ],
      });

      final document = tipTapJsonToQuillDocument(tiptap);
      final ops = document.toDelta().toJson();

      final hasImageEmbed = ops.any(
        (op) =>
            op['insert'] is Map &&
            (op['insert'] as Map)['image'] ==
                'https://cdn.example.com/photo.jpg',
      );
      expect(hasImageEmbed, isTrue);
    });

    test('converts Quill image embed to TipTap imageResize node', () {
      final delta = Delta()
        ..insert({'image': 'https://cdn.example.com/photo.jpg'})
        ..insert('\n');
      final document = Document.fromDelta(delta);

      final serialized = quillDocumentToTipTapJson(document);
      expect(serialized, isNotNull);

      final decoded = jsonDecode(serialized!) as Map<String, dynamic>;
      final content = (decoded['content'] as List).cast<Map<String, dynamic>>();
      final imageNode = content.firstWhere(
        (n) => n['type'] == 'imageResize',
        orElse: () => <String, dynamic>{},
      );
      expect(imageNode['type'], 'imageResize');
      final attrs = imageNode['attrs'] as Map<String, dynamic>;
      expect(attrs['src'], 'https://cdn.example.com/photo.jpg');
      expect(attrs['alt'], isNull);
      expect(attrs['title'], isNull);
      expect(attrs['width'], isNull);
      expect(attrs['height'], isNull);
      expect(attrs['containerStyle'], '');
      expect(attrs['wrapperStyle'], '');
    });

    test('converts indented Quill list to nested TipTap list', () {
      final delta = Delta()
        ..insert('Parent')
        ..insert('\n', {'list': 'bullet'})
        ..insert('Child')
        ..insert('\n', {'list': 'bullet', 'indent': 1})
        ..insert('Grandchild')
        ..insert('\n', {'list': 'bullet', 'indent': 2});
      final document = Document.fromDelta(delta);

      final serialized = quillDocumentToTipTapJson(document);
      expect(serialized, isNotNull);

      final decoded = jsonDecode(serialized!) as Map<String, dynamic>;
      final content = (decoded['content'] as List).cast<Map<String, dynamic>>();

      // There should be a single top-level bulletList.
      expect(content.length, 1);
      expect(content.first['type'], 'bulletList');

      // The parent item's content should include a nested bulletList.
      final parentItems = (content.first['content'] as List)
          .cast<Map<String, dynamic>>();
      expect(parentItems.length, 1);
      final parentItemContent = (parentItems.first['content'] as List)
          .cast<Map<String, dynamic>>();
      expect(
        parentItemContent.any((n) => n['type'] == 'bulletList'),
        isTrue,
      );
    });

    test('converts nested TipTap list to indented Quill delta ops', () {
      final tiptap = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'bulletList',
            'content': [
              {
                'type': 'listItem',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': 'Parent'},
                    ],
                  },
                  {
                    'type': 'bulletList',
                    'content': [
                      {
                        'type': 'listItem',
                        'content': [
                          {
                            'type': 'paragraph',
                            'content': [
                              {'type': 'text', 'text': 'Child'},
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      final document = tipTapJsonToQuillDocument(tiptap);
      final ops = document.toDelta().toJson();

      // The "Child" item should have indent: 1.
      final hasIndentedChild = ops.any(
        (op) =>
            op['insert'] == '\n' &&
            (op['attributes'] as Map?)?['list'] == 'bullet' &&
            (op['attributes'] as Map?)?['indent'] == 1,
      );
      expect(hasIndentedChild, isTrue);
    });

    test('preserves underline/script/highlight marks when serializing', () {
      final delta = Delta()
        ..insert(
          'Rich',
          {
            'underline': true,
            'script': 'super',
            'background': '#ff0',
          },
        )
        ..insert('\n');
      final document = Document.fromDelta(delta);

      final serialized = quillDocumentToTipTapJson(document);
      expect(serialized, isNotNull);

      final decoded = jsonDecode(serialized!) as Map<String, dynamic>;
      final paragraph =
          (decoded['content'] as List).first as Map<String, dynamic>;
      final textNode =
          (paragraph['content'] as List).first as Map<String, dynamic>;
      final marks = (textNode['marks'] as List).cast<Map<String, dynamic>>();

      expect(marks.any((mark) => mark['type'] == 'underline'), isTrue);
      expect(marks.any((mark) => mark['type'] == 'superscript'), isTrue);
      expect(marks.any((mark) => mark['type'] == 'highlight'), isTrue);
    });

    test('converts mixed TipTap content into a valid Quill document', () {
      // Verifies that heading, mention embed, image, video, and table embeds
      // are all present in the document delta without throwing. Widget
      // rendering is skipped because embed builders live in app part files.
      final tiptap = jsonEncode({
        'type': 'doc',
        'content': [
          {
            'type': 'heading',
            'attrs': {'level': 1},
            'content': [
              {'type': 'text', 'text': 'Heading'},
            ],
          },
          {
            'type': 'paragraph',
            'content': [
              {
                'type': 'mention',
                'attrs': {'displayName': 'Sam'},
              },
            ],
          },
          {
            'type': 'imageResize',
            'attrs': {'src': 'https://cdn.example.com/image.jpg'},
          },
          {
            'type': 'video',
            'attrs': {'src': 'https://cdn.example.com/video.mp4'},
          },
          {
            'type': 'table',
            'content': [
              {
                'type': 'tableRow',
                'content': [
                  {
                    'type': 'tableHeader',
                    'content': [
                      {
                        'type': 'paragraph',
                        'content': [
                          {'type': 'text', 'text': 'A'},
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      final document = tipTapJsonToQuillDocument(tiptap);
      final ops = document.toDelta().toJson();

      // Heading text survives.
      expect(ops.any((op) => op['insert'] == 'Heading'), isTrue);
      // Image embed is present.
      expect(
        ops.any(
          (op) =>
              op['insert'] is Map &&
              (op['insert'] as Map)['image'] ==
                  'https://cdn.example.com/image.jpg',
        ),
        isTrue,
      );
      // Video embed is present.
      expect(
        ops.any(
          (op) =>
              op['insert'] is Map &&
              (op['insert'] as Map)['video'] ==
                  'https://cdn.example.com/video.mp4',
        ),
        isTrue,
      );
      // Mention embed is present.
      expect(
        ops.any(
          (op) =>
              op['insert'] is Map &&
              (op['insert'] as Map).containsKey('mention'),
        ),
        isTrue,
      );
      // Table embed is present.
      expect(
        ops.any(
          (op) =>
              op['insert'] is Map && (op['insert'] as Map).containsKey('table'),
        ),
        isTrue,
      );
    });
  });
}
