import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/sliver_responsive_cards.dart';

void main() {
  test('root destinations share tablet and desktop width limits', () {
    expect(ResponsivePadding.rootContentWidth(DeviceClass.compact), isNull);
    expect(ResponsivePadding.rootContentWidth(DeviceClass.medium), 1120);
    expect(ResponsivePadding.rootContentWidth(DeviceClass.expanded), 1600);
  });

  for (final (width, expectedColumns) in [
    (390.0, 1),
    (600.0, 2),
    (1200.0, 3),
  ]) {
    testWidgets('dashboard shows $expectedColumns columns at $width', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = Size(width, 900);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpWidget(
        const Directionality(
          textDirection: TextDirection.ltr,
          child: CustomScrollView(
            slivers: [
              SliverResponsiveCards(
                children: [
                  SizedBox(key: ValueKey('first'), height: 90),
                  SizedBox(key: ValueKey('second'), height: 90),
                  SizedBox(key: ValueKey('third'), height: 90),
                ],
              ),
            ],
          ),
        ),
      );
      final first = tester.getRect(find.byKey(const ValueKey('first')));
      final second = tester.getRect(find.byKey(const ValueKey('second')));
      final third = tester.getRect(find.byKey(const ValueKey('third')));
      expect(second.left > first.left, expectedColumns >= 2);
      expect(third.left > second.left, expectedColumns >= 3);
    });
  }

  testWidgets('short cards fill the shortest column first', (tester) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(1200, 900);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      const Directionality(
        textDirection: TextDirection.ltr,
        child: CustomScrollView(
          slivers: [
            SliverResponsiveCards(
              children: [
                SizedBox(key: ValueKey('tall'), height: 400),
                SizedBox(key: ValueKey('a'), height: 100),
                SizedBox(key: ValueKey('b'), height: 100),
                SizedBox(key: ValueKey('c'), height: 100),
                SizedBox(key: ValueKey('d'), height: 100),
              ],
            ),
          ],
        ),
      ),
    );
    Rect rect(String key) => tester.getRect(find.byKey(ValueKey(key)));
    // a and b open columns 2 and 3; c and d stack under them instead of
    // under the tall card, as an index-based flow would place d.
    expect(rect('a').left, greaterThan(rect('tall').left));
    expect(rect('b').left, greaterThan(rect('a').left));
    expect(rect('c').left, rect('a').left);
    expect(rect('c').top, rect('a').bottom + 14);
    expect(rect('d').left, rect('b').left);
    expect(rect('d').top, rect('b').bottom + 14);
    expect(tester.takeException(), isNull);
  });

  test('columns count the gap between them', () {
    int columns(double width) => SliverResponsiveCards.columnsFor(
      width,
      minColumnWidth: 320,
      spacing: 24,
      maxColumns: 4,
    );
    expect(columns(358), 1);
    expect(columns(772), 2);
    // A landscape iPad beside the rail and a 13-inch laptop beside the
    // sidebar both fit three Home columns; a wide desktop fits four.
    expect(columns(1036), 3);
    expect(columns(1150), 3);
    expect(columns(1536), 4);
  });

  for (final size in [const Size(1032, 1376), const Size(1376, 1032)]) {
    testWidgets('dashboard cards flow without empty rows at $size', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = size;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpWidget(
        const Directionality(
          textDirection: TextDirection.ltr,
          child: CustomScrollView(
            slivers: [
              SliverResponsiveCards(
                maxColumns: 2,
                leading: SizedBox(key: ValueKey('workspace'), height: 48),
                children: [
                  SizedBox(key: ValueKey('summary'), height: 100),
                  SizedBox(key: ValueKey('tasks'), height: 300),
                  SizedBox(key: ValueKey('events'), height: 100),
                ],
              ),
            ],
          ),
        ),
      );
      final workspace = tester.getRect(find.byKey(const ValueKey('workspace')));
      final summary = tester.getRect(find.byKey(const ValueKey('summary')));
      final events = tester.getRect(find.byKey(const ValueKey('events')));
      expect(workspace.width, size.width);
      expect(summary.top, workspace.bottom + 14);
      expect(events.top, summary.bottom + 14);
      expect(tester.takeException(), isNull);
    });
  }
}
