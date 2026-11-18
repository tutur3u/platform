@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import '../../../helpers/pump_app.dart';
import 'calendar_s3_scenes.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final font in {
      'Roboto': 'assets/fonts/NotoSans.ttf',
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'Nunito': 'assets/fonts/Nunito-Variable.ttf',
      'JetBrainsMono': 'assets/fonts/JetBrainsMono-Variable.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
  });
  for (final scene in ['day', 'detail', 'block', 'mini']) {
    for (final (design, sorbet) in [
      ('classic', null),
      ('sorbet', const SorbetTheme()),
    ]) {
      for (final brightness in Brightness.values) {
        for (final (device, size) in [
          ('phone', const Size(390, 844)),
          ('tablet', const Size(834, 1194)),
        ]) {
          final name = '${scene}_${design}_${brightness.name}_$device';
          testWidgets(name, (tester) async {
            tester.view
              ..physicalSize = size
              ..devicePixelRatio = 1
              ..padding = FakeViewPadding(
                top: device == 'phone' ? 48 : 24,
                bottom: device == 'phone' ? 34 : 20,
              )
              ..viewPadding = FakeViewPadding(
                top: device == 'phone' ? 48 : 24,
                bottom: device == 'phone' ? 34 : 20,
              );
            addTearDown(tester.view.reset);
            await tester.pumpWidget(
              sorbetTestApp(
                home: calendarScene(scene),
                sorbet: sorbet,
                brightness: brightness,
                boundaryKey: const ValueKey('golden'),
              ),
            );
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            await expectLater(
              find.byKey(const ValueKey('golden')),
              matchesGoldenFile('goldens/$name.png'),
            );
            await tester.pumpWidget(const SizedBox.shrink());
          });
        }
      }
    }
  }
}
