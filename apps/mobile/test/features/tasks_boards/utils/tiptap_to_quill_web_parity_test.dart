import 'dart:convert';

import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_render_cache.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_tiptap_converter.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_marks.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_models.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_to_quill_converter.dart';

String _doc(List<Map<String, dynamic>> content) =>
    jsonEncode({'type': 'doc', 'content': content});

Map<String, dynamic> _text(String text, [List<Map<String, dynamic>>? marks]) =>
    {'type': 'text', 'text': text, if (marks != null) 'marks': marks};

Map<String, dynamic> _paragraph(List<Map<String, dynamic>> content) => {
  'type': 'paragraph',
  'content': content,
};

List<Map<String, dynamic>> _ops(String json, {bool dividerEmbeds = false}) =>
    tipTapJsonToQuillDelta(
      json,
      dividerEmbeds: dividerEmbeds,
    ).toJson().cast<Map<String, dynamic>>();

void main() {
  group('TipTap to Quill web parity', () {
    test('toggle blocks keep their summary and content', () {
      final json = _doc([
        {
          'type': 'details',
          'content': [
            {
              'type': 'detailsSummary',
              'content': [_text('Steps')],
            },
            {
              'type': 'detailsContent',
              'content': [
                _paragraph([_text('Open the board')]),
                {
                  'type': 'bulletList',
                  'content': [
                    {
                      'type': 'listItem',
                      'content': [
                        _paragraph([_text('Pick a task')]),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          'type': 'details',
          'content': [
            {
              'type': 'detailsSummary',
              'attrs': {'level': 2},
              'content': [_text('Heading toggle')],
            },
          ],
        },
      ]);

      final document = tipTapJsonToQuillDocument(json);
      final plain = document.toPlainText();
      expect(plain, contains('Steps'));
      expect(plain, contains('Open the board'));
      expect(plain, contains('Pick a task'));

      final ops = _ops(json);
      expect(ops.firstWhere((op) => op['insert'] == 'Steps')['attributes'], {
        'bold': true,
      });
      expect(
        ops.any(
          (op) =>
              op['insert'] == '\n' &&
              (op['attributes'] as Map?)?['list'] == 'bullet',
        ),
        isTrue,
      );
      final headingIndex = ops.indexWhere(
        (op) => op['insert'] == 'Heading toggle',
      );
      expect(ops[headingIndex + 1]['attributes'], {'header': 2});
    });

    test('unknown containers keep their nested blocks', () {
      final json = _doc([
        {
          'type': 'callout',
          'content': [
            _paragraph([_text('Inside a callout')]),
            _paragraph([_text('Second line')]),
          ],
        },
      ]);

      final plain = tipTapJsonToQuillDocument(json).toPlainText();
      expect(plain, contains('Inside a callout\nSecond line'));
    });

    test('a horizontal rule is a divider embed only when asked', () {
      final json = _doc([
        _paragraph([_text('Above')]),
        {'type': 'horizontalRule'},
        _paragraph([_text('Below')]),
      ]);

      // Surfaces without a divider builder read the rule as text.
      expect(
        tipTapJsonToQuillDocument(json).toPlainText(),
        'Above\n---\nBelow\n',
      );

      final ops = _ops(json, dividerEmbeds: true);
      expect(
        ops.any(
          (op) => op['insert'] is String && '${op['insert']}'.contains('---'),
        ),
        isFalse,
      );
      expect(
        ops.where(
          (op) =>
              op['insert'] is Map &&
              (op['insert'] as Map).containsKey(
                taskDescriptionDividerEmbedType,
              ),
        ),
        hasLength(1),
      );
      // The divider converts back to a horizontal rule.
      final document = tipTapJsonToQuillDocument(json, dividerEmbeds: true);
      final back = jsonDecode(quillDocumentToTipTapJson(document)!) as Map;
      final types = [
        for (final node in back['content'] as List) (node as Map)['type'],
      ];
      expect(types, ['paragraph', 'horizontalRule', 'paragraph']);
    });

    test('text colour marks render and round-trip', () {
      final json = _doc([
        _paragraph([
          _text('red', [
            {
              'type': 'textStyle',
              'attrs': {'color': '#EF4444'},
            },
          ]),
          _text('tinted', [
            {
              'type': 'textStyle',
              'attrs': {'backgroundColor': 'rgb(34, 197, 94)'},
            },
          ]),
        ]),
      ]);

      final ops = _ops(json);
      expect(ops.firstWhere((op) => op['insert'] == 'red')['attributes'], {
        'color': '#ef4444',
      });
      expect(ops.firstWhere((op) => op['insert'] == 'tinted')['attributes'], {
        'background': '#22c55e',
      });

      final document = Document.fromDelta(tipTapJsonToQuillDelta(json));
      final back = jsonDecode(quillDocumentToTipTapJson(document)!) as Map;
      final runs = ((back['content'] as List).first as Map)['content'] as List;
      expect((runs.first as Map)['marks'], [
        {
          'type': 'textStyle',
          'attrs': {'color': '#ef4444'},
        },
      ]);
    });

    test('colours Quill cannot paint are dropped, not thrown', () {
      final json = _doc([
        _paragraph([
          _text('themed', [
            {
              'type': 'highlight',
              'attrs': {'color': 'var(--highlight-yellow)'},
            },
            {
              'type': 'textStyle',
              'attrs': {'color': 'currentColor'},
            },
          ]),
        ]),
      ]);

      final attrs = _ops(
        json,
      ).firstWhere((op) => op['insert'] == 'themed')['attributes'];
      expect(attrs, {'background': tipTapDefaultHighlightColor});
    });

    test('colour parsing accepts hex and rgb only', () {
      expect(quillColorOrNull('#abc'), '#aabbcc');
      expect(quillColorOrNull('#AABBCCDD'), '#aabbcc');
      expect(quillColorOrNull('rgba(255, 0, 0, 0.5)'), '#ff0000');
      expect(quillColorOrNull('rgba(255, 0, 0, 0.1)'), isNull);
      expect(quillColorOrNull('hsl(0 100% 50%)'), isNull);
      expect(quillColorOrNull('red'), isNull);
      expect(quillColorOrNull(42), isNull);
    });

    test('links keep a trimmed href', () {
      final attrs = quillAttrsFromTipTapMarks([
        {
          'type': 'link',
          'attrs': {'href': '  https://tuturuuu.com/docs  '},
        },
      ]);
      expect(attrs, {'link': 'https://tuturuuu.com/docs'});
    });
  });

  group('task description render cache', () {
    tearDown(clearTaskDescriptionRenderCaches);

    test('reuses one conversion per payload', () {
      final json = _doc([
        _paragraph([_text('Cached')]),
      ]);

      expect(hasTaskDescriptionViewerDelta(json), isFalse);
      final first = taskDescriptionViewerDelta(json);
      expect(hasTaskDescriptionViewerDelta(json), isTrue);
      expect(identical(taskDescriptionViewerDelta(json), first), isTrue);

      final parsed = parseTipTapTaskDescriptionCached(json);
      expect(parsed?.plainText, contains('Cached'));
      expect(identical(parseTipTapTaskDescriptionCached(json), parsed), isTrue);
      expect(parseTipTapTaskDescriptionCached(null), isNull);
    });

    test('an edited payload converts fresh and old entries age out', () {
      final payloads = [
        for (var i = 0; i < 30; i++)
          _doc([
            _paragraph([_text('Revision $i')]),
          ]),
      ]..forEach(taskDescriptionViewerDelta);
      expect(hasTaskDescriptionViewerDelta(payloads.first), isFalse);
      expect(hasTaskDescriptionViewerDelta(payloads.last), isTrue);
    });
  });
}
