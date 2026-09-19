import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';

void registerShellViewportChecks(
  Future<void> Function(WidgetTester tester) pumpShell,
) {
  for (final size in [
    const Size(768, 1024),
    const Size(1024, 768),
    const Size(1366, 1024),
    const Size(1032, 1376),
    const Size(1376, 1032),
    const Size(744, 500),
    const Size(874, 402),
  ]) {
    testWidgets(
      'tablet shell reserves content space and keeps a compact dock at $size',
      (tester) async {
        tester.view
          ..devicePixelRatio = 1
          ..physicalSize = size;
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
        });
        await pumpShell(tester);
        final dock = tester.getRect(find.byType(CustomNavigationBar));
        expect(dock.height, lessThan(100));
        if (size.height < 600) {
          expect(
            find.byKey(const ValueKey('compact-shell-footer')),
            findsOneWidget,
          );
        }
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
        expect(tester.takeException(), isNull);
      },
    );
  }
}
