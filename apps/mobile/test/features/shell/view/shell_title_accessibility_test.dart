import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/readable_shell_title.dart';
import 'package:mobile/features/shell/view/shell_title_text_style.dart';

import '../../../helpers/helpers.dart';

void main() {
  Future<void> mount(
    WidgetTester tester,
    Widget Function(BuildContext) build, {
    double? lineHeight,
    double? letterSpacing,
    double? wordSpacing,
    bool bold = false,
  }) => tester.pumpWidget(
    MaterialApp(
      home: Theme(
        data: ThemeData(
          textTheme: const TextTheme(
            titleLarge: TextStyle(fontSize: 20, height: 1),
          ),
        ),
        child: MediaQuery(
          data: MediaQueryData(
            boldText: bold,
            lineHeightScaleFactorOverride: lineHeight,
            letterSpacingOverride: letterSpacing,
            wordSpacingOverride: wordSpacing,
          ),
          child: DefaultTextStyle(
            style: const TextStyle(
              fontSize: 20,
              height: 1,
              color: Colors.black,
            ),
            child: Align(
              alignment: Alignment.topLeft,
              child: Builder(builder: build),
            ),
          ),
        ),
      ),
    ),
  );

  testWidgets(
    'normal-scale header reserves the rendered line-height override',
    (tester) async {
      await mount(
        tester,
        (context) => SizedBox(
          key: const ValueKey('header'),
          height: mobileSectionAppBarHeightFor(context),
          child: Text(
            'Ag',
            maxLines: 1,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        lineHeight: 4,
        bold: true,
      );
      final paragraph = tester.renderObject<RenderParagraph>(
        find.byType(RichText).last,
      );
      expect(
        tester.getSize(find.byKey(const ValueKey('header'))).height,
        greaterThanOrEqualTo(
          paragraph.getMaxIntrinsicHeight(double.infinity) + 16,
        ),
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('spacing overrides retain an original glyph in a narrow title', (
    tester,
  ) async {
    await mount(
      tester,
      (_) => const SizedBox(width: 50, child: ReadableShellTitle('Project')),
      letterSpacing: 40,
      wordSpacing: 30,
      bold: true,
    );
    final text = tester.widget<Text>(find.text('Project'));
    final paragraph = tester.renderObject<RenderParagraph>(
      find.byType(RichText).last,
    );
    expect(text.overflow, TextOverflow.clip);
    expect(
      paragraph.getBoxesForSelection(
        const TextSelection(baseOffset: 0, extentOffset: 1),
      ),
      isNotEmpty,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('measurement style matches rendered accessibility overrides', (
    tester,
  ) async {
    const style = TextStyle(
      inherit: false,
      fontSize: 16,
      fontWeight: FontWeight.w300,
      height: 5,
      letterSpacing: 9,
      wordSpacing: 3,
    );
    late TextStyle measured;
    await mount(
      tester,
      (context) {
        measured = effectiveShellTitleStyle(context, style: style);
        return const Text('A B', style: style);
      },
      lineHeight: 2,
      letterSpacing: 3,
      wordSpacing: 7,
      bold: true,
    );
    final span = tester.widget<RichText>(find.byType(RichText).last).text;
    expect(measured, span.style);
    expect(measured.fontWeight, FontWeight.bold);
    expect(measured.height, 2);
    expect(measured.letterSpacing, 3);
    expect(measured.wordSpacing, 7);
    expect(tester.takeException(), isNull);
  });

  testWidgets('actual section title fits the accessibility heading override', (
    tester,
  ) async {
    await tester.pumpApp(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(boldText: true)
              .applyTextStyleOverrides(
                lineHeightScaleFactorOverride: 4,
                letterSpacingOverride: null,
                wordSpacingOverride: null,
                paragraphSpacingOverride: null,
              ),
          child: const MobileSectionAppBar(title: 'Ag'),
        ),
      ),
    );
    final paragraph = tester.renderObject<RenderParagraph>(
      find.descendant(of: find.text('Ag'), matching: find.byType(RichText)),
    );
    final bar = tester.getSize(find.byType(MobileSectionAppBar));
    expect(
      bar.height,
      greaterThanOrEqualTo(
        paragraph.getMaxIntrinsicHeight(double.infinity) + 16,
      ),
    );
    expect(tester.takeException(), isNull);
  });

  for (final title in ['😀 Project', '👨‍👩‍👧‍👦 Project']) {
    testWidgets('ellipsis retains the complete first grapheme of $title', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await mount(
        tester,
        (_) => SizedBox(width: 180, child: ReadableShellTitle(title)),
      );
      final text = tester.widget<Text>(find.text(title));
      final paragraph = tester.renderObject<RenderParagraph>(
        find.byType(RichText).last,
      );
      expect(text.overflow, TextOverflow.ellipsis);
      expect(
        paragraph.getBoxesForSelection(
          TextSelection(
            baseOffset: 0,
            extentOffset: title.characters.first.length,
          ),
        ),
        isNotEmpty,
      );
      expect(tester.getSemantics(find.text(title)).label, title);
      semantics.dispose();
      expect(tester.takeException(), isNull);
    });
  }
}
