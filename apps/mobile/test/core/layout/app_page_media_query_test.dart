import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';

const _clearance = 102.0;
const _safeArea = EdgeInsets.only(left: 44, right: 30);

/// Pumps [build] with dock clearance and horizontal safe areas published the
/// way the shell publishes them, and returns the padding a child observed.
Future<EdgeInsets> _observedPadding(
  WidgetTester tester,
  Widget Function(Widget probe) build,
) async {
  late EdgeInsets observed;
  final probe = Builder(
    builder: (context) {
      observed = MediaQuery.paddingOf(context);
      return const SizedBox(height: 40);
    },
  );
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 844);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(padding: _safeArea.copyWith(bottom: _clearance)),
          child: Material(child: build(probe)),
        ),
      ),
    ),
  );
  return observed;
}

void main() {
  group('consumed insets are removed from children', () {
    testWidgets('AppPageListView', (tester) async {
      final padding = await _observedPadding(
        tester,
        (probe) => AppPageListView(children: [probe]),
      );
      expect(padding.left, 0);
      expect(padding.right, 0);
      expect(padding.bottom, 0);
    });

    testWidgets('AppPageListView.builder', (tester) async {
      final padding = await _observedPadding(
        tester,
        (probe) =>
            AppPageListView.builder(itemCount: 1, itemBuilder: (_, _) => probe),
      );
      expect(padding, EdgeInsets.zero);
    });

    testWidgets('AppPageScrollView', (tester) async {
      final padding = await _observedPadding(
        tester,
        (probe) =>
            AppPageScrollView(slivers: [SliverToBoxAdapter(child: probe)]),
      );
      expect(padding, EdgeInsets.zero);
    });

    testWidgets('SliverAppPage keeps clearance it did not consume', (
      tester,
    ) async {
      final padding = await _observedPadding(
        tester,
        (probe) => CustomScrollView(
          slivers: [
            SliverAppPage(
              includeBottom: false,
              sliver: SliverToBoxAdapter(child: probe),
            ),
          ],
        ),
      );
      expect(padding.left, 0);
      expect(padding.right, 0);
      expect(padding.bottom, _clearance);
    });

    testWidgets('a legacy SafeArea inside an item adds nothing', (
      tester,
    ) async {
      const key = ValueKey('legacy');
      await _observedPadding(
        tester,
        (probe) => AppPageListView(
          children: [
            probe,
            const SafeArea(child: SizedBox(key: key, height: 40)),
          ],
        ),
      );
      final rect = tester.getRect(find.byKey(key));
      expect(rect.left, 16 + _safeArea.left);
      expect(rect.right, 390 - 16 - _safeArea.right);
      expect(rect.height, 40);
    });
  });
}
