import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Static progress bar for budgets, goals, streaks and quotas.
///
/// It paints two rounded rectangles and never animates, so it is safe in
/// long scrolling lists. [value] is clamped to 0–1.
class AppMeter extends StatelessWidget {
  const AppMeter({
    required this.value,
    this.tone = AppTone.primary,
    this.height = 6,
    this.semanticLabel,
    super.key,
  });

  final double value;
  final AppTone tone;
  final double height;

  /// Read out instead of the default percentage.
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final clamped = value.isFinite ? value.clamp(0.0, 1.0) : 0.0;
    final fill = tone.foreground(c);
    return Semantics(
      label: semanticLabel,
      value: semanticLabel == null ? '${(clamped * 100).round()}%' : null,
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(
          painter: _MeterPainter(
            value: clamped,
            track: c.muted,
            fill: fill,
            textDirection: Directionality.of(context),
          ),
        ),
      ),
    );
  }
}

class _MeterPainter extends CustomPainter {
  const _MeterPainter({
    required this.value,
    required this.track,
    required this.fill,
    required this.textDirection,
  });

  final double value;
  final Color track;
  final Color fill;
  final TextDirection textDirection;

  @override
  void paint(Canvas canvas, Size size) {
    const radius = Radius.circular(AppRadius.pill);
    canvas.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & size, radius),
      Paint()..color = track,
    );
    if (value <= 0) return;
    final width = size.width * value;
    final left = textDirection == TextDirection.rtl ? size.width - width : 0.0;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left, 0, width, size.height),
        radius,
      ),
      Paint()..color = fill,
    );
  }

  @override
  bool shouldRepaint(_MeterPainter old) =>
      old.value != value ||
      old.track != track ||
      old.fill != fill ||
      old.textDirection != textDirection;
}
