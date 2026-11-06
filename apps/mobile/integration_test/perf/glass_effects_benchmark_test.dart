// On-device frame-timing benchmark for shell glass and ambient backgrounds.
//
// Run in profile mode on a device or emulator:
//   flutter drive --profile --flavor development \
//     --driver=test_driver/integration_test.dart \
//     --target=integration_test/perf/glass_effects_benchmark_test.dart -d <id>
//
// Each scenario scrolls the same card list under the real dock material and
// ambient painter (and, for `sheet` rows, inside a large glass panel), then
// prints a `GLASS_BENCH` JSON line with build and raster percentiles. Compare
// `blur` against `flat` rows of the same background across rounds.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile/core/theme/appearance/ambient_background.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/glass_effects.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';

const ValueKey<String> _list = ValueKey('glass-bench-list');

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized().framePolicy =
      LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  const backgrounds = <String, AppearanceSettings>{
    'solid': AppearanceSettings(),
    'blobs': AppearanceSettings(
      backgroundStyle: AppearanceBackgroundStyle.blobs,
    ),
    'blobsAnimated': AppearanceSettings(
      backgroundStyle: AppearanceBackgroundStyle.blobs,
      animate: true,
    ),
  };

  // Rounds interleave blurred and flat runs so device warm-up and thermal
  // drift affect both arms alike.
  for (var round = 1; round <= 3; round++) {
    for (final entry in backgrounds.entries) {
      for (final sheet in [false, true]) {
        for (final blur in [true, false]) {
          final name = [
            entry.key,
            if (sheet) 'sheet',
            if (blur) 'blur' else 'flat',
            'r$round',
          ].join('-');
          testWidgets(name, (tester) async {
            GlassEffects.debugBlurOverride = blur;
            addTearDown(() => GlassEffects.debugBlurOverride = null);
            final clock = AmbientMotionClock();
            addTearDown(clock.dispose);
            if (entry.value.animate) clock.start();
            await tester.pumpWidget(
              _Harness(
                settings: entry.value,
                motion: entry.value.animate ? clock : null,
                sheet: sheet,
              ),
            );
            await tester.pumpAndSettle();
            final timings = <FrameTiming>[];
            void collect(List<FrameTiming> batch) => timings.addAll(batch);
            SchedulerBinding.instance.addTimingsCallback(collect);
            for (var i = 0; i < 3; i++) {
              await tester.fling(
                find.byKey(_list),
                const Offset(0, -900),
                2600,
              );
              await _drain(tester);
              await tester.fling(find.byKey(_list), const Offset(0, 900), 2600);
              await _drain(tester);
            }
            // Let the engine flush the last timing batch.
            await tester.pump(const Duration(milliseconds: 1200));
            SchedulerBinding.instance.removeTimingsCallback(collect);
            clock.stop();
            debugPrint('GLASS_BENCH ${jsonEncode(_summary(name, timings))}');
            expect(timings, isNotEmpty);
          });
        }
      }
    }
  }
}

Future<void> _drain(WidgetTester tester) async {
  for (var i = 0; i < 90; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

Map<String, Object> _summary(String name, List<FrameTiming> timings) {
  double pct(List<double> values, double p) {
    final sorted = [...values]..sort();
    return sorted[((sorted.length - 1) * p).round()];
  }

  final build = [
    for (final t in timings) t.buildDuration.inMicroseconds / 1000,
  ];
  final raster = [
    for (final t in timings) t.rasterDuration.inMicroseconds / 1000,
  ];
  double avg(List<double> v) => v.reduce((a, b) => a + b) / v.length;
  String f(double v) => v.toStringAsFixed(2);
  return {
    'scenario': name,
    'frames': timings.length,
    'buildAvgMs': f(avg(build)),
    'buildP90Ms': f(pct(build, .9)),
    'rasterAvgMs': f(avg(raster)),
    'rasterP90Ms': f(pct(raster, .9)),
    'rasterP99Ms': f(pct(raster, .99)),
    'rasterOver16ms': raster.where((v) => v > 16.67).length,
  };
}

/// A compact shell stand-in: ambient layer, translucent cards, a frosted
/// header strip and the real dock material.
class _Harness extends StatelessWidget {
  const _Harness({required this.settings, required this.sheet, this.motion});

  final AppearanceSettings settings;
  final AmbientMotionClock? motion;

  /// Scrolls content inside a large glass panel, like an adaptive sheet.
  final bool sheet;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Builder(
      builder: (context) {
        final colors = Theme.of(context).colorScheme;
        final ambient = settings.hasAmbientBackground;
        final card = ambient
            ? colors.surface.withValues(alpha: settings.surfaceOpacity)
            : colors.surfaceContainerHigh;
        return Material(
          color: colors.surface,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (ambient)
                AmbientBackground(
                  settings: settings,
                  brightness: Brightness.light,
                  motion: motion,
                ),
              _cards(card, key: sheet ? null : _list),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: 92,
                child: ClipRect(
                  child: GlassBlur(
                    sigma: 18,
                    child: ColoredBox(
                      color: colors.surface.withValues(
                        alpha: GlassEffects.fillAlpha(context, 0.55),
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 40,
                right: 40,
                bottom: 28,
                height: 64,
                child: ShellDockSurface(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      for (final icon in const [
                        Icons.home,
                        Icons.check_box,
                        Icons.calendar_today,
                        Icons.auto_awesome,
                        Icons.apps,
                      ])
                        Icon(icon),
                    ],
                  ),
                ),
              ),
              if (sheet)
                Positioned(
                  left: 12,
                  right: 12,
                  top: 180,
                  bottom: 12,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(28),
                    child: GlassBlur(
                      sigma: 20,
                      child: ColoredBox(
                        color: colors.surface.withValues(
                          alpha: GlassEffects.fillAlpha(context, 0.88),
                        ),
                        child: _cards(card, key: _list),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    ),
  );
}

Widget _cards(Color card, {Key? key}) => ListView.builder(
  key: key,
  padding: const EdgeInsets.fromLTRB(16, 104, 16, 120),
  itemCount: 200,
  itemBuilder: (context, i) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: DecoratedBox(
      decoration: BoxDecoration(
        color: card,
        borderRadius: BorderRadius.circular(18),
      ),
      child: ListTile(
        leading: CircleAvatar(child: Text('${i % 10}')),
        title: Text('Task $i'),
        subtitle: const Text('Due tomorrow · Workspace'),
        trailing: const Icon(Icons.chevron_right),
      ),
    ),
  ),
);
