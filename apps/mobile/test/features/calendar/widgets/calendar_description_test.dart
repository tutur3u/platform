import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_description_content.dart';
import 'package:mobile/features/calendar/widgets/agenda_view.dart';
import 'package:mobile/features/calendar/widgets/calendar_description_body.dart';
import 'package:mobile/features/calendar/widgets/event_detail_sheet.dart';

import '../../../helpers/helpers.dart';

final date = DateTime(2030, 1, 1, 12);
CalendarEvent event(String description) => CalendarEvent(
  id: 'description-fixture',
  title: 'Fixture event',
  description: description,
  startAt: date,
  endAt: date.add(const Duration(hours: 1)),
);

Iterable<InlineSpan> descendants(InlineSpan span) sync* {
  yield span;
  if (span is TextSpan) {
    for (final child in span.children ?? <InlineSpan>[]) {
      yield* descendants(child);
    }
  }
}

void main() {
  testWidgets('captures synthetic raw Text control and formatted description', (
    tester,
  ) async {
    final fonts = FontLoader('NotoSans')
      ..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'));
    await fonts.load();
    const description =
        '<h2>Meeting notes</h2><p>First <strong>bold</strong><br>Next line</p><ul><li>Prepare slides</li><li>Review agenda</li></ul><p><a href="https://example.test">Reference</a></p>';
    const key = ValueKey('description-capture');
    for (final formatted in [false, true]) {
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData(fontFamily: 'NotoSans'),
          home: Scaffold(
            body: Center(
              child: RepaintBoundary(
                key: key,
                child: Container(
                  width: 320,
                  height: 420,
                  color: Colors.white,
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        formatted
                            ? 'Formatted description fixture'
                            : 'Raw Text control fixture',
                      ),
                      const SizedBox(height: 16),
                      if (formatted)
                        const CalendarDescriptionBody(description: description)
                      else
                        const Text(description),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      if (formatted) {
        expect(find.text('Meeting notes', findRichText: true), findsOneWidget);
        expect(find.text('Prepare slides', findRichText: true), findsOneWidget);
      } else {
        expect(find.text(description), findsOneWidget);
      }
      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(key),
      );
      await tester.runAsync(() async {
        final image = await boundary.toImage();
        try {
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          expect(bytes, isNotNull);
          final output =
              Platform.environment['CALENDAR_DESCRIPTION_SCREENSHOT_DIR'];
          if (output != null) {
            await Directory(output).create(recursive: true);
            await File(
              '$output/calendar-description-${formatted ? 'after' : 'before'}.png',
            ).writeAsBytes(bytes!.buffer.asUint8List());
          }
        } finally {
          image.dispose();
        }
      });
    }
  });

  testWidgets(
    'HTML inline code collapses blank lines without parsing emphasis',
    (tester) async {
      await tester.pumpApp(
        const CalendarDescriptionBody(
          description: '<p><code>first\n\n**literal**\nlast</code></p>',
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('first **literal** last', findRichText: true),
        findsOneWidget,
      );
      final spans = tester
          .widgetList<SelectableText>(find.byType(SelectableText))
          .expand((widget) => descendants(widget.textSpan!));
      expect(
        spans.any(
          (span) =>
              span.toPlainText().contains('**literal**') &&
              span.style?.fontWeight != FontWeight.bold,
        ),
        isTrue,
      );
    },
  );

  testWidgets('HTML preformatted code preserves multiline content', (
    tester,
  ) async {
    await tester.pumpApp(
      const CalendarDescriptionBody(
        description: '<pre><code>first\n\n**literal**\nlast</code></pre>',
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('first\n\n**literal**\nlast', findRichText: true),
      findsOneWidget,
    );
  });

  test('nested tilde fences retain literal HTML code', () {
    expect(
      calendarDescriptionPreview('> ~~~html\n> <p>Example</p>\n> ~~~'),
      '<p>Example</p>',
    );
    expect(
      calendarDescriptionPreview('- Item\n  ~~~html\n  <p>Example</p>\n  ~~~'),
      'Item\n<p>Example</p>',
    );
  });

  testWidgets('escaped Markdown stays literal alongside HTML formatting', (
    tester,
  ) async {
    await tester.pumpApp(
      const CalendarDescriptionBody(
        description: r'Escaped \*literal\* <b>bold</b>',
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Escaped *literal* bold', findRichText: true),
      findsOneWidget,
    );
    final spans = tester
        .widgetList<SelectableText>(find.byType(SelectableText))
        .expand((widget) => descendants(widget.textSpan!));
    expect(
      spans.any(
        (span) =>
            span.toPlainText().contains('*literal*') &&
            span.style?.fontStyle != FontStyle.italic,
      ),
      isTrue,
    );
    expect(
      spans.any(
        (span) =>
            span.toPlainText() == 'bold' &&
            span.style?.fontWeight == FontWeight.bold,
      ),
      isTrue,
    );
  });

  test(
    'literal HTML in Markdown code and escaped angle text stays visible',
    () {
      expect(
        calendarDescriptionPreview('Use `<p>example</p>` literally.'),
        'Use <p>example</p> literally.',
      );
      expect(
        calendarDescriptionPreview('```html\n<p>Example</p>\n```'),
        '<p>Example</p>',
      );
      expect(
        calendarDescriptionPreview('<p>Use &lt;person&gt; here &amp;copy;</p>'),
        'Use <person> here &copy;',
      );
    },
  );

  testWidgets('code literals and escaped HTML render as actual visible spans', (
    tester,
  ) async {
    await tester.pumpApp(
      const CalendarDescriptionBody(
        description:
            'Use `<p>example</p>` literally.\n\n```html\n<p>Example</p>\n```\n\n<p>Use &lt;person&gt; here</p>',
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Use <p>example</p> literally.', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('<p>Example</p>', findRichText: true), findsOneWidget);
    expect(find.text('Use <person> here', findRichText: true), findsOneWidget);
  });

  test('HTML retains paragraphs, headings, lists and inline formatting', () {
    expect(
      calendarDescriptionMarkdown(
        '<h2>Plan</h2><p>A <strong>bold</strong> and <em>italic</em><br>next</p><ul><li>One</li><li>Two</li></ul><p><a href="https://example.test/path">Link</a></p>',
      ),
      '## Plan\n\n\n\nA **bold** and *italic*  \nnext\n\n\n\n- One\n- Two\n\n\n\n[Link](<https://example.test/path>)',
    );
    expect(
      calendarDescriptionPreview(
        '<ol start="3"><li>First</li><li>Second</li></ol>',
      ),
      'First\nSecond',
    );
  });

  test('plain, malformed and mixed content excludes executable markup', () {
    expect(calendarDescriptionMarkdown('Plain\nNext < 5'), 'Plain\nNext < 5');
    expect(calendarDescriptionPreview('<p>Unclosed <b>bold'), 'Unclosed bold');
    expect(
      calendarDescriptionPreview('<p>HTML **Markdown**</p>\n# Heading'),
      'HTML Markdown\nHeading',
    );
    expect(
      calendarDescriptionPreview(
        '<script>alert(1)</script><style>bad</style><iframe>hidden</iframe><p onclick="bad()">Visible</p><img src="https://tracker.test/pixel" alt="Diagram">',
      ),
      'Visible\nDiagram',
    );
  });

  test('links use the mobile launcher URL policy', () {
    for (final href in [
      'javascript:alert(1)',
      'data:text/html,test',
      'file:///tmp/test',
      '//example.test',
      'https://user:password@example.test',
      'https:/missing-host',
    ]) {
      expect(calendarDescriptionLink(href), isNull, reason: href);
    }
    for (final href in [
      'https://example.test',
      'http://example.test',
      'mailto:guest@example.test',
      'tel:123',
      'sms:123',
    ]) {
      expect(calendarDescriptionLink(href), Uri.parse(href), reason: href);
    }
    expect(
      calendarDescriptionPreview(
        '<a href="javascript:alert(1)">Readable label</a>',
      ),
      'Readable label',
    );
  });

  testWidgets('Markdown has actual heading, list, emphasis and link spans', (
    tester,
  ) async {
    await tester.pumpApp(
      const CalendarDescriptionBody(
        description:
            '# Heading\n\n- **Bold**\n- *Italic*\n\n[Safe link](https://example.test)\n\n![Diagram](https://tracker.test/image)',
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Heading', findRichText: true), findsOneWidget);
    expect(find.text('Diagram'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    final spans = tester
        .widgetList<SelectableText>(find.byType(SelectableText))
        .expand(
          (widget) => widget.textSpan == null
              ? <InlineSpan>[]
              : descendants(widget.textSpan!),
        );
    expect(
      spans.any(
        (span) =>
            span.toPlainText() == 'Bold' &&
            span.style?.fontWeight == FontWeight.bold,
      ),
      isTrue,
    );
    expect(
      spans.any(
        (span) =>
            span.toPlainText() == 'Italic' &&
            span.style?.fontStyle == FontStyle.italic,
      ),
      isTrue,
    );
    expect(
      spans.any(
        (span) =>
            span is TextSpan &&
            span.text == 'Safe link' &&
            span.recognizer != null,
      ),
      isTrue,
    );
    expect(find.text('•'), findsNWidgets(2));
  });

  for (final brightness in Brightness.values) {
    testWidgets('enlarged description wraps and is accessible in $brightness', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(320, 640);
      addTearDown(() {
        tester.view.resetDevicePixelRatio();
        tester.view.resetPhysicalSize();
      });
      final semantics = tester.ensureSemantics();
      try {
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData(brightness: brightness),
            home: MediaQuery(
              data: const MediaQueryData(
                size: Size(320, 640),
                textScaler: TextScaler.linear(2),
              ),
              child: Scaffold(
                body: SingleChildScrollView(
                  child: CalendarDescriptionBody(
                    description:
                        '<h2>Readable heading</h2><p>Long paragraph ${'content ' * 50}</p><p>Last paragraph</p>',
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(
          find.text('Readable heading', findRichText: true),
          findsOneWidget,
        );
        expect(
          tester
              .getSemantics(find.byType(EditableText).first)
              .getSemanticsData()
              .value,
          'Readable heading',
        );
        await tester.drag(
          find.byType(SingleChildScrollView).first,
          const Offset(0, -600),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      } finally {
        semantics.dispose();
      }
    });
  }

  testWidgets('detail renders literal HTML paragraphs instead of tag source', (
    tester,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () => unawaited(
            showEventDetailSheet(
              context,
              event: event('<p>First paragraph</p><p>Second paragraph</p>'),
              readOnly: true,
            ),
          ),
          child: const Text('Open'),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('First paragraph', findRichText: true), findsOneWidget);
    expect(find.text('Second paragraph', findRichText: true), findsOneWidget);
    expect(find.textContaining('<p>'), findsNothing);
  });

  testWidgets('agenda previews HTML and Markdown as readable text', (
    tester,
  ) async {
    await tester.pumpApp(
      AgendaView(
        selectedDate: date,
        events: [event('<p>First **bold**</p><p>Second</p>')],
        onEventTap: (_) {},
        onDaySelected: (_) {},
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('First bold\nSecond'), findsOneWidget);
    expect(find.textContaining('<p>'), findsNothing);
  });
}
