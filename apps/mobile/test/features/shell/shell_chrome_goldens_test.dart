@Tags(['golden'])
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/features/shell/view/shell_dock_overflow.dart';

import '../../helpers/design_render_harness.dart';
import '../../helpers/golden_tolerance.dart';
import '../../helpers/pump_app.dart';
import 'shell_chrome_scenes.dart';

/// Shell chrome at phone and tablet sizes, light and dark, classic and
/// Sorbet: the top bar, the dock at rest and with Back, notifications and the
/// workspace switcher.
void main() {
  final original = goldenFileComparator;
  setUpAll(() async {
    await DesignRender.loadFonts(forGoldens: true);
    goldenFileComparator = GoldenTolerance(
      File('test/features/shell/shell_chrome_goldens_test.dart').absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);

  for (final scene in ShellChromeScene.values) {
    for (final (design, sorbet) in [
      ('classic', null),
      ('sorbet', const SorbetTheme()),
    ]) {
      for (final brightness in Brightness.values) {
        for (final (device, size, top, bottom) in [
          if (scene.coversNarrowDock)
            ('narrow_phone', const Size(320, 720), 24.0, 16.0),
          ('phone', const Size(390, 844), 48.0, 34.0),
          ('tablet', const Size(834, 1194), 24.0, 20.0),
        ]) {
          final name = '${scene.name}_${design}_${brightness.name}_$device';
          testWidgets(name, (tester) async {
            tester.view
              ..physicalSize = size
              ..devicePixelRatio = 1
              ..padding = FakeViewPadding(top: top, bottom: bottom)
              ..viewPadding = FakeViewPadding(top: top, bottom: bottom);
            addTearDown(tester.view.reset);
            await tester.pumpWidget(
              sorbetTestApp(
                sorbet: sorbet,
                brightness: brightness,
                boundaryKey: const ValueKey('golden'),
                home: ShellChromeSceneView(scene),
              ),
            );
            await tester.pumpAndSettle();
            TestGesture? hold;
            switch (scene) {
              case ShellChromeScene.overflowSheet:
                await tester.tap(find.byKey(shellDockMoreKey));
                await tester.pumpAndSettle();
                expect(find.byType(BottomSheet), findsOneWidget);
              case ShellChromeScene.dockFocused:
                final home = find.byKey(const ValueKey('home'));
                final glyph = find.descendant(
                  of: home,
                  matching: find.byType(Icon),
                );
                bool isFocused() =>
                    Focus.of(tester.element(glyph)).hasPrimaryFocus;
                for (var attempt = 0; attempt < 8 && !isFocused(); attempt++) {
                  await tester.sendKeyEvent(LogicalKeyboardKey.tab);
                  await tester.pumpAndSettle();
                }
                expect(isFocused(), isTrue);
              case ShellChromeScene.dockPressed:
                hold = await tester.startGesture(
                  tester.getCenter(find.byKey(const ValueKey('home'))),
                );
                await tester.pump(const Duration(milliseconds: 120));
              case ShellChromeScene.topBar ||
                  ShellChromeScene.dockRest ||
                  ShellChromeScene.dockBack ||
                  ShellChromeScene.overflow ||
                  ShellChromeScene.notifications ||
                  ShellChromeScene.switcher:
                break;
            }
            await expectLater(
              find.byKey(const ValueKey('golden')),
              matchesGoldenFile('goldens/$name.png'),
            );
            if (hold != null) {
              await hold.cancel();
              await tester.pumpAndSettle();
            }
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }
}
