import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_render_cache.dart';
import 'package:mobile/features/tasks_boards/utils/task_description_tiptap_converter.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_colors.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_to_quill_converter.dart';
import 'package:mobile/features/tasks_boards/widgets/task_description_viewer.dart';

import '../../../helpers/helpers.dart';

/// The web editor's swatches: a highlight sets both of these.
Map<String, dynamic> _swatchHighlight(String hue) => {
  'type': 'highlight',
  'attrs': {'color': 'var(--calendar-bg-$hue)', 'textColor': 'var(--$hue)'},
};

String _doc(String text, List<Map<String, dynamic>> marks) => jsonEncode({
  'type': 'doc',
  'content': [
    {
      'type': 'paragraph',
      'content': [
        {'type': 'text', 'text': text, 'marks': marks},
      ],
    },
  ],
});

/// The first text run's marks after tipTap -> Quill (editor) -> tipTap.
List<Object?> _roundTripMarks(String json, {void Function(Document)? edit}) {
  final document = tipTapJsonToQuillDocument(json);
  edit?.call(document);
  final back = jsonDecode(quillDocumentToTipTapJson(document)!) as Map;
  final paragraph = (back['content'] as List).first as Map;
  final run = (paragraph['content'] as List).first as Map;
  return run['marks'] as List<Object?>? ?? const [];
}

Map<String, dynamic> _firstRunAttrs(String json, {bool themeKeys = false}) {
  final ops = tipTapJsonToQuillDelta(json, themeColorKeys: themeKeys).toJson();
  return Map<String, dynamic>.from(
    (ops.first as Map)['attributes'] as Map? ?? const {},
  );
}

const _swatchHues = [
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'green',
  'gray',
];

void main() {
  group('web swatch colours', () {
    test('every swatch resolves to its hue in light and dark', () {
      for (final colors in [DynamicColors.light, DynamicColors.dark]) {
        final palette = taskDescriptionThemePalette(colors);
        final expected = <String, (Color, Color)>{
          'yellow': (colors.yellow, colors.calendarYellow),
          'orange': (colors.orange, colors.calendarOrange),
          'red': (colors.red, colors.calendarRed),
          'pink': (colors.pink, colors.calendarPink),
          'purple': (colors.purple, colors.calendarPurple),
          'blue': (colors.blue, colors.calendarBlue),
          'green': (colors.green, colors.calendarGreen),
          'gray': (colors.gray, colors.calendarGray),
        };
        for (final hue in _swatchHues) {
          final (text, background) = expected[hue]!;
          expect(palette['var(--$hue)'], text, reason: hue);
          expect(palette['var(--calendar-bg-$hue)'], background, reason: hue);
        }
      }
    });

    test('the viewer keeps swatches as theme keys', () {
      for (final hue in _swatchHues) {
        final attrs = _firstRunAttrs(
          _doc('Note', [_swatchHighlight(hue)]),
          themeKeys: true,
        );
        expect(attrs['background'], 'var(--calendar-bg-$hue)');
        expect(attrs['color'], 'var(--$hue)');
      }
    });

    test('editors get the light hex pair, readable in either theme', () {
      final attrs = _firstRunAttrs(_doc('Note', [_swatchHighlight('red')]));
      expect(attrs['background'], '#fce8e8');
      expect(attrs['color'], '#dc2626');

      // A swatch background alone pins a dark text colour on its tint.
      final tint = _firstRunAttrs(
        _doc('Note', [
          {
            'type': 'textStyle',
            'attrs': {'backgroundColor': 'var(--calendar-bg-blue)'},
          },
        ]),
      );
      expect(tint['background'], '#e8f0fe');
      expect(tint['color'], '#18181b');
    });

    test('an unknown colour falls back with a readable text colour', () {
      final attrs = _firstRunAttrs(
        _doc('Note', [
          {
            'type': 'highlight',
            'attrs': {'color': 'var(--brand-accent)'},
          },
        ]),
        themeKeys: true,
      );
      expect(attrs['background'], tipTapDefaultHighlightColor);
      expect(attrs['color'], '#18181b');

      final dark = _firstRunAttrs(
        _doc('Note', [
          {
            'type': 'highlight',
            'attrs': {'color': '#111111'},
          },
        ]),
      );
      expect(dark['color'], '#fafafa');
    });
  });

  group('colour round-trip', () {
    test('web swatch highlights survive an untouched save verbatim', () {
      for (final hue in _swatchHues) {
        final marks = [
          {'type': 'bold'},
          _swatchHighlight(hue),
        ];
        expect(_roundTripMarks(_doc('Note', marks)), [
          {'type': 'bold'},
          _swatchHighlight(hue),
        ], reason: hue);
      }
    });

    test('text style colours keep their original values and attributes', () {
      final textStyle = {
        'type': 'textStyle',
        'attrs': {
          'color': 'var(--purple)',
          'backgroundColor': 'var(--calendar-bg-green)',
          'fontFamily': 'Inter',
        },
      };
      expect(_roundTripMarks(_doc('Note', [textStyle])), [textStyle]);

      final hex = {
        'type': 'textStyle',
        'attrs': {'color': '#EF4444'},
      };
      expect(_roundTripMarks(_doc('Note', [hex])), [hex]);
    });

    test('recolouring the background keeps the untouched text colour', () {
      final marks = _roundTripMarks(
        _doc('Note', [_swatchHighlight('red')]),
        edit: (document) =>
            document.format(0, 4, const BackgroundAttribute('#ffff00')),
      );
      expect(marks, [
        {
          'type': 'highlight',
          'attrs': {'color': '#ffff00', 'textColor': 'var(--red)'},
        },
      ]);
    });

    test('clearing the colours drops the marks', () {
      final marks = _roundTripMarks(
        _doc('Note', [_swatchHighlight('red')]),
        edit: (document) => document
          ..format(0, 4, const BackgroundAttribute(null))
          ..format(0, 4, const ColorAttribute(null)),
      );
      expect(marks, isEmpty);
    });
  });

  group('colour parsing', () {
    test('accepts hex and rgb, drops mostly transparent colours', () {
      expect(quillColorOrNull('#abc'), '#aabbcc');
      expect(quillColorOrNull('#AABBCCDD'), '#aabbcc');
      expect(quillColorOrNull('#ff000010'), isNull);
      expect(quillColorOrNull('#f001'), isNull);
      expect(quillColorOrNull('rgba(255, 0, 0, 0.5)'), '#ff0000');
      expect(quillColorOrNull('rgba(255, 0, 0, 0.1)'), isNull);
      expect(quillColorOrNull('hsl(0 100% 50%)'), isNull);
      expect(quillColorOrNull('red'), isNull);
      expect(quillColorOrNull(42), isNull);
    });

    test('theme keys are canonical and limited to known hues', () {
      expect(taskDescriptionThemeColorKey(' var( --RED ) '), 'var(--red)');
      expect(
        taskDescriptionThemeColorKey('var(--calendar-bg-gray)'),
        'var(--calendar-bg-gray)',
      );
      expect(taskDescriptionThemeColorKey('var(--brand-accent)'), isNull);
      expect(taskDescriptionThemeColorKey('#ff0000'), isNull);
    });
  });

  group('viewer colours', () {
    tearDown(clearTaskDescriptionRenderCaches);

    TextStyle? spanStyle(WidgetTester tester, String text) {
      TextStyle? found;
      for (final richText in tester.widgetList<RichText>(
        find.byType(RichText),
      )) {
        richText.text.visitChildren((span) {
          if (span is TextSpan && span.text == text) {
            found = span.style;
            return false;
          }
          return true;
        });
        if (found != null) break;
      }
      return found;
    }

    for (final brightness in Brightness.values) {
      testWidgets('swatches paint their hue in ${brightness.name}', (
        tester,
      ) async {
        final colors = DynamicColors.forBrightness(brightness);
        await tester.pumpWidget(
          appearanceTestApp(
            brightness: brightness,
            home: TaskDescriptionViewer(
              descriptionJson: jsonEncode({
                'type': 'doc',
                'content': [
                  for (final hue in _swatchHues)
                    {
                      'type': 'paragraph',
                      'content': [
                        {
                          'type': 'text',
                          'text': '$hue note',
                          'marks': [_swatchHighlight(hue)],
                        },
                      ],
                    },
                ],
              }),
            ),
          ),
        );
        await tester.pumpAndSettle();

        final palette = taskDescriptionThemePalette(colors);
        for (final hue in _swatchHues) {
          final style = spanStyle(tester, '$hue note');
          expect(style, isNotNull, reason: hue);
          expect(
            style!.backgroundColor,
            palette['var(--calendar-bg-$hue)'],
            reason: hue,
          );
          expect(style.color, palette['var(--$hue)'], reason: hue);
        }
        expect(tester.takeException(), isNull);
      });
    }
  });
}
