import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';

/// Pumps [child] in a window of [width] with [bottomClearance] published the
/// way the shell's floating dock publishes it (MediaQuery bottom padding).
Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  required double width,
  double bottomClearance = 0,
  EdgeInsets safeArea = EdgeInsets.zero,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = Size(width, 900);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(padding: safeArea.copyWith(bottom: bottomClearance)),
          child: Material(child: child),
        ),
      ),
    ),
  );
}

const ValueKey<String> _first = ValueKey('first');
const ValueKey<String> _last = ValueKey('last');

Widget _list({AppPageKind kind = AppPageKind.detail}) => AppPageListView(
  kind: kind,
  children: const [
    SizedBox(key: _first, height: 40),
    SizedBox(key: _last, height: 40),
  ],
);

void main() {
  group('AppPageListView gutters per device class', () {
    for (final (width, left) in [
      (390.0, 16.0),
      (700.0, 24.0 + 50),
      (1200.0, 32.0 + 240),
    ]) {
      testWidgets('width $width starts content at $left', (tester) async {
        await _pump(tester, _list(), width: width);
        final rect = tester.getRect(find.byKey(_first));
        expect(rect.left, left);
        expect(rect.right, width - left);
        expect(rect.top, AppLayout.pageTop);
        // The scrollable stays full width; only padding centres content.
        expect(tester.getSize(find.byType(ListView)).width, width);
      });
    }

    testWidgets('root pages use the wide canvas', (tester) async {
      await _pump(tester, _list(kind: AppPageKind.root), width: 1200);
      expect(tester.getRect(find.byKey(_first)).left, 32);
    });
  });

  testWidgets('scroll end reserves dock clearance plus the end gap', (
    tester,
  ) async {
    await _pump(
      tester,
      AppPageListView(
        children: [
          for (var i = 0; i < 30; i++) SizedBox(height: 60, key: ValueKey(i)),
        ],
      ),
      width: 390,
      bottomClearance: 102,
    );
    await tester.drag(find.byType(ListView), const Offset(0, -5000));
    await tester.pumpAndSettle();
    final last = tester.getRect(find.byKey(const ValueKey(29)));
    expect(last.bottom, 900 - 102 - AppLayout.scrollEndGap);
  });

  group('AppPageBody', () {
    testWidgets('box body consumes clearance and strips it for children', (
      tester,
    ) async {
      late EdgeInsets inner;
      await _pump(
        tester,
        AppPageBody(
          kind: AppPageKind.form,
          child: Builder(
            builder: (context) {
              inner = MediaQuery.paddingOf(context);
              return const SizedBox.expand(key: _first);
            },
          ),
        ),
        width: 1000,
        bottomClearance: 80,
      );
      final rect = tester.getRect(find.byKey(_first));
      expect(rect.width, 480 - 64);
      expect(rect.center.dx, 500);
      expect(rect.bottom, 900 - 80 - AppLayout.boxEndGap);
      expect(inner.bottom, 0);
    });

    testWidgets('pass-through keeps clearance for an inner scrollable', (
      tester,
    ) async {
      late EdgeInsets inner;
      await _pump(
        tester,
        AppPageBody(
          consumeBottomClearance: false,
          child: Builder(
            builder: (context) {
              inner = MediaQuery.paddingOf(context);
              return const SizedBox.expand(key: _first);
            },
          ),
        ),
        width: 390,
        bottomClearance: 80,
      );
      expect(tester.getRect(find.byKey(_first)).bottom, 900);
      expect(inner.bottom, 80);
    });

    testWidgets('fullBleed opts out of gutters and max width', (tester) async {
      late EdgeInsets inner;
      await _pump(
        tester,
        AppPageBody.fullBleed(
          consumeBottomClearance: false,
          child: Builder(
            builder: (context) {
              inner = MediaQuery.paddingOf(context);
              return const SizedBox.expand(key: _first);
            },
          ),
        ),
        width: 1200,
        bottomClearance: 90,
      );
      expect(
        tester.getRect(find.byKey(_first)),
        const Rect.fromLTWH(0, 0, 1200, 900),
      );
      expect(inner.bottom, 90);
    });

    testWidgets('fullBleed still honours safe areas and dock clearance', (
      tester,
    ) async {
      await _pump(
        tester,
        const AppPageBody.fullBleed(child: SizedBox.expand(key: _first)),
        width: 900,
        bottomClearance: 90,
        safeArea: const EdgeInsets.only(left: 44, right: 30),
      );
      expect(
        tester.getRect(find.byKey(_first)),
        const Rect.fromLTRB(44, 0, 870, 810),
      );
    });
  });

  testWidgets('SliverAppPage and AppPageScrollView share page insets', (
    tester,
  ) async {
    await _pump(
      tester,
      const AppPageScrollView(
        topInset: 100,
        slivers: [
          SliverToBoxAdapter(child: SizedBox(key: _first, height: 40)),
          SliverToBoxAdapter(child: SizedBox(key: _last, height: 40)),
        ],
      ),
      width: 700,
    );
    final first = tester.getRect(find.byKey(_first));
    final last = tester.getRect(find.byKey(_last));
    expect(first.left, 74);
    expect(first.top, AppLayout.pageTop + 100);
    expect(last.left, 74);
    expect(last.top, first.bottom);
  });

  group('AppGroupedSection', () {
    testWidgets('renders caption, card and inset dividers between rows', (
      tester,
    ) async {
      await _pump(
        tester,
        const Padding(
          padding: EdgeInsets.all(16),
          child: AppGroupedSection(
            caption: 'General',
            footer: 'Footer',
            children: [
              SizedBox(height: 56, key: ValueKey('a')),
              SizedBox(height: 56, key: ValueKey('b')),
              SizedBox(height: 56, key: ValueKey('c')),
            ],
          ),
        ),
        width: 390,
      );
      expect(find.text('General'), findsOneWidget);
      expect(find.text('Footer'), findsOneWidget);
      final dividers = tester.widgetList<Divider>(find.byType(Divider));
      expect(dividers, hasLength(2));
      expect(
        dividers.every((d) => d.indent == AppLayout.rowDividerInset),
        isTrue,
      );
      final card = tester.widget<DecoratedBox>(
        find
            .descendant(
              of: find.byType(AppGroupedCard),
              matching: find.byType(DecoratedBox),
            )
            .first,
      );
      final decoration = card.decoration as BoxDecoration;
      expect(decoration.borderRadius, BorderRadius.circular(AppRadius.card));
      final caption = tester.getRect(find.text('General'));
      final first = tester.getRect(find.byKey(const ValueKey('a')));
      expect(caption.left, 16 + AppLayout.sectionCaptionInset);
      expect(first.top - caption.bottom, AppLayout.sectionCaptionGap);
    });

    testWidgets('spaced sections add the section gap', (tester) async {
      await _pump(
        tester,
        const Column(
          children: [
            AppGroupedSection.spaced(
              children: [SizedBox(height: 40, key: _first)],
            ),
            SizedBox(height: 10, key: _last),
          ],
        ),
        width: 390,
      );
      final first = tester.getRect(find.byKey(_first));
      final last = tester.getRect(find.byKey(_last));
      expect(last.top - first.bottom, AppLayout.sectionGap);
    });
  });
}
