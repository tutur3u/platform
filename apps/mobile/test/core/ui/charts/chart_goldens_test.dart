@Tags(['golden'])
library;

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import '../../../helpers/golden_tolerance.dart';
import 'chart_fixtures.dart';

void main() {
  final original = goldenFileComparator;
  setUpAll(() {
    goldenFileComparator = GoldenTolerance(
      File('test/core/ui/charts/chart_goldens_test.dart').absolute.uri,
    );
  });
  tearDownAll(() => goldenFileComparator = original);
  for (final brightness in Brightness.values) {
    for (final scale in [1.0, 2.0]) {
      for (final kind in [
        'line',
        'area',
        'stacked_bar',
        'horizontal_bar',
        'diverging_bar',
        'heatmap',
        'sankey',
        'treemap',
        'sparkline',
      ]) {
        final name = '${kind}_${brightness.name}_${scale.toInt()}x';
        testWidgets(name, (tester) async {
          await tester.binding.setSurfaceSize(const Size(360, 220));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          final theme = AppearanceTheme.materialTheme(
            const AppearanceSettings(),
            brightness,
          );
          await tester.pumpWidget(
            MaterialApp(
              theme: theme,
              home: Builder(
                builder: (context) {
                  final palette = AppChartPalette.of(context);
                  return MediaQuery(
                    data: MediaQueryData(
                      textScaler: TextScaler.linear(scale),
                      disableAnimations: true,
                    ),
                    child: RepaintBoundary(
                      key: const ValueKey('golden'),
                      child: ColoredBox(
                        color: palette.surface,
                        child: CustomPaint(
                          size: const Size(360, 220),
                          painter: fixturePainter(
                            kind,
                            palette,
                            TextScaler.linear(scale),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          );
          await tester.pump();
          await expectLater(
            find.byKey(const ValueKey('golden')),
            matchesGoldenFile('goldens/$name.png'),
          );
          expect(tester.takeException(), isNull);
          expect(tester.hasRunningAnimations, isFalse);
        });
      }
    }
  }
}
