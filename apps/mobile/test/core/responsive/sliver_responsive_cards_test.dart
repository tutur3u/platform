import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/sliver_responsive_cards.dart';

void main() {
  test('root destinations share tablet and desktop width limits', () {
    expect(ResponsivePadding.rootContentWidth(DeviceClass.compact), isNull);
    expect(ResponsivePadding.rootContentWidth(DeviceClass.medium), 1120);
    expect(ResponsivePadding.rootContentWidth(DeviceClass.expanded), 1440);
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
