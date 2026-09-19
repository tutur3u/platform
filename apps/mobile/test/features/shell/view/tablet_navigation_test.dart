import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

void main() {
  for (final size in [
    const Size(768, 1024),
    const Size(1024, 768),
    const Size(1366, 1024),
    const Size(1032, 1376),
    const Size(1376, 1032),
    const Size(744, 500),
  ]) {
    testWidgets('floating navigation stays compact and tappable at $size', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = size;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      Key? selected;
      await tester.pumpApp(
        Stack(
          fit: StackFit.expand,
          children: [
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Center(
                heightFactor: 1,
                child: IntrinsicWidth(
                  child: CustomNavigationBar(
                    expandItems: false,
                    minItemWidth: 80,
                    selectedKey: const ValueKey('home'),
                    onSelected: (key) => selected = key,
                    children: const [
                      shad.NavigationItem(
                        key: ValueKey('home'),
                        child: Text('Home'),
                      ),
                      shad.NavigationItem(
                        key: ValueKey('apps'),
                        child: Text('Apps'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      );
      final bar = tester.getRect(find.byType(CustomNavigationBar));
      expect(bar.height, lessThan(100));
      expect(bar.bottom, closeTo(size.height, 1));
      await tester.tap(find.text('Apps'));
      expect(selected, const ValueKey<String>('apps'));
      expect(tester.takeException(), isNull);
    });
  }
}
