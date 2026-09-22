import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';

import '../../helpers/helpers.dart';

void main() {
  testWidgets('tablet drawer closes through its adaptive dismiss helper', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1032, 1376);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () => showAdaptiveDrawer(
            context: context,
            builder: (overlayContext) => SizedBox(
              height: 200,
              child: TextButton(
                onPressed: () => dismissAdaptiveDrawerOverlay(overlayContext),
                child: const Text('Cancel form'),
              ),
            ),
          ),
          child: const Text('Open'),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    final surfaces = tester.widgetList<Material>(
      find.ancestor(
        of: find.text('Cancel form'),
        matching: find.byType(Material),
      ),
    );
    final surface = surfaces.singleWhere((item) => item.borderRadius != null);
    expect(surface.color?.a, 1);
    await tester.tap(find.text('Cancel form'));
    await tester.pumpAndSettle();
    expect(find.text('Cancel form'), findsNothing);
    expect(find.text('Open'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  for (final width in [390.0, 1032.0]) {
    testWidgets('sheet is translucent at width $width', (tester) async {
      tester.view.physicalSize = Size(width, 1376);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpApp(
        Builder(
          builder: (context) => TextButton(
            onPressed: () => showAdaptiveSheet<void>(
              context: context,
              builder: (_) =>
                  const SizedBox(height: 200, child: Text('Task form')),
            ),
            child: const Text('Open'),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      final materials = tester.widgetList<Material>(
        find.ancestor(
          of: find.text('Task form'),
          matching: find.byType(Material),
        ),
      );
      expect(materials.first.color?.a, closeTo(0.88, 0.01));
      expect(find.byType(BackdropFilter), findsWidgets);
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
      expect(find.text('Task form'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
