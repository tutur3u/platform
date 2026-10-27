import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/charts/widgets/chart_selection.dart';

typedef ChartPainterBuilder = CustomPainter Function(ChartSelection? selection);

/// The same selected indices feed the painter and localized live readout.
/// Category/matrix callers can supply a geometry-aware [hitTest].
class ChartPlot extends StatelessWidget {
  const ChartPlot({
    required this.controller,
    required this.bucketCount,
    required this.seriesCount,
    required this.summary,
    required this.painterBuilder,
    this.bucketPositions,
    this.hitTest,
    this.height = 220,
    super.key,
  });
  final ChartSelectionController controller;
  final int bucketCount;
  final int seriesCount;
  final String summary;
  final ChartPainterBuilder painterBuilder;

  /// Normalized bucket x coordinates, including the axis insets when present.
  final List<double>? bucketPositions;
  final ChartSelection Function(Offset local, Size size)? hitTest;
  final double height;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
    valueListenable: controller,
    builder: (context, selection, _) => LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, height);
        void select(Offset local) {
          if (bucketCount <= 0 || seriesCount <= 0) return;
          if (hitTest != null) {
            final hit = hitTest!(local, size);
            controller.select(
              hit.bucket.clamp(0, bucketCount - 1),
              series: hit.series.clamp(0, seriesCount - 1),
            );
            return;
          }
          final positions =
              bucketPositions ??
              List.generate(
                bucketCount,
                (i) => bucketCount == 1 ? 0.5 : i / (bucketCount - 1),
              );
          var nearest = 0;
          for (var i = 1; i < positions.length; i++) {
            if ((positions[i] * size.width - local.dx).abs() <
                (positions[nearest] * size.width - local.dx).abs()) {
              nearest = i;
            }
          }
          controller.select(nearest, series: selection?.series ?? 0);
        }

        return FocusableActionDetector(
          shortcuts: const {
            SingleActivator(LogicalKeyboardKey.arrowLeft): ChartStepIntent(-1),
            SingleActivator(LogicalKeyboardKey.arrowRight): ChartStepIntent(1),
            SingleActivator(LogicalKeyboardKey.arrowUp): ChartSeriesIntent(-1),
            SingleActivator(LogicalKeyboardKey.arrowDown): ChartSeriesIntent(1),
            SingleActivator(LogicalKeyboardKey.escape): ChartClearIntent(),
          },
          actions: {
            ChartStepIntent: CallbackAction<ChartStepIntent>(
              onInvoke: (intent) {
                controller.step(intent.delta, bucketCount);
                return null;
              },
            ),
            ChartSeriesIntent: CallbackAction<ChartSeriesIntent>(
              onInvoke: (intent) {
                controller.cycle(intent.delta, seriesCount);
                return null;
              },
            ),
            ChartClearIntent: CallbackAction<ChartClearIntent>(
              onInvoke: (_) {
                controller.clear();
                return null;
              },
            ),
          },
          child: Semantics(
            label: summary,
            focusable: true,
            onIncrease: bucketCount == 0
                ? null
                : () => controller.step(1, bucketCount),
            onDecrease: bucketCount == 0
                ? null
                : () => controller.step(-1, bucketCount),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (event) => select(event.localPosition),
              onHorizontalDragStart: (event) => select(event.localPosition),
              onHorizontalDragUpdate: (event) => select(event.localPosition),
              child: RepaintBoundary(
                child: CustomPaint(
                  size: size,
                  painter: painterBuilder(selection),
                ),
              ),
            ),
          ),
        );
      },
    ),
  );
}
