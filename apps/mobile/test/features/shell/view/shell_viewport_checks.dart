import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';

void registerShellViewportChecks(
  Future<void> Function(WidgetTester tester) pumpShell,
) {
  for (final size in [
    const Size(320, 720),
    const Size(390, 844),
    const Size(844, 390),
    const Size(768, 1024),
    const Size(1024, 768),
    const Size(1366, 1024),
    const Size(1032, 1376),
    const Size(1376, 1032),
    const Size(744, 500),
    const Size(874, 402),
  ]) {
    testWidgets(
      'shell reserves content space and keeps a compact dock at $size',
      (tester) async {
        tester.view
          ..devicePixelRatio = 1
          ..physicalSize = size
          ..padding = const FakeViewPadding(bottom: 34)
          ..viewPadding = const FakeViewPadding(bottom: 34);
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
          tester.view.resetViewInsets();
          tester.view.resetPadding();
          tester.view.resetViewPadding();
        });
        if (size.width == 390) {
          tester.platformDispatcher.textScaleFactorTestValue = 2;
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        }
        await pumpShell(tester);
        expect(
          find.descendant(
            of: find.byType(CustomNavigationBar),
            matching: find.byType(Text),
          ),
          findsNothing,
        );
        expect(find.byTooltip('Home'), findsOneWidget);
        expect(find.byTooltip('Assistant'), findsOneWidget);
        final dock = tester.getRect(find.byType(CustomNavigationBar));
        expect(dock.height, lessThan(100));
        expect(
          find.byKey(const ValueKey('compact-shell-footer')),
          findsNothing,
        );
        expect(dock.top, greaterThan(size.height - 180));
        expect(dock.width, lessThan(size.width));
        expect(
          find.byWidgetPredicate(
            (widget) =>
                widget is Image &&
                widget.image ==
                    const AssetImage('assets/logos/nova-transparent.png'),
          ),
          findsOneWidget,
        );
        if (size.height >= 600) {
          expect(
            MediaQuery.paddingOf(
              tester.element(find.byType(AppsHubPage)),
            ).bottom,
            greaterThan(dock.height),
          );
        }
        final body = tester.getRect(find.byType(AppsHubPage));
        final contentInset = MediaQuery.paddingOf(
          tester.element(find.byType(AppsHubPage)),
        ).bottom;
        expect(dock.top - (body.bottom - contentInset), closeTo(8, 1));
        final bodyState = tester.state(find.byType(AppsHubPage));
        tester.view.viewInsets = const FakeViewPadding(bottom: 300);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.state(find.byType(AppsHubPage)), same(bodyState));
        tester.view.resetViewInsets();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.state(find.byType(AppsHubPage)), same(bodyState));
        expect(tester.takeException(), isNull);
      },
    );
  }
}
