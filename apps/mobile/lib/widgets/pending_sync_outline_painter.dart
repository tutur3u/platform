import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';

/// Dashed outline drawn over an item with a local edit that has not synced.
///
/// The outline sits [inset] inside the item's bounds so neighbouring items
/// never share a stroke, and its corners stay concentric with the item's
/// own corners ([outerRadius] minus the inset). It paints in the foreground
/// and adds no size, so the item keeps its layout.
class PendingSyncOutlinePainter extends CustomPainter {
  const PendingSyncOutlinePainter({
    required this.color,
    required this.outerRadius,
    this.inset = defaultInset,
  });

  /// Gap between the item's bounds and the outer edge of the stroke.
  static const double defaultInset = 2;
  static const double strokeWidth = 1.25;
  static const double dashLength = 4;
  static const double gapLength = 4;

  final Color color;
  final BorderRadius outerRadius;
  final double inset;

  /// Outline colour for [status]: a muted role at reduced alpha while
  /// waiting, the destructive role when the edit needs attention. Neither
  /// uses the primary role, which is near-white in dark themes.
  static Color colorFor(AppColorTokens colors, PendingMutationStatus status) =>
      switch (status) {
        PendingMutationStatus.queued => colors.mutedForeground.withValues(
          alpha: colors.isDark ? 0.5 : 0.55,
        ),
        PendingMutationStatus.conflict || PendingMutationStatus.failed =>
          colors.destructive.withValues(alpha: 0.7),
      };

  /// The stroke's centre line inside an item of [size].
  RRect outlineFor(Size size) {
    final offset = inset + strokeWidth / 2;
    Radius shrink(Radius radius) => Radius.elliptical(
      math.max(0, radius.x - offset),
      math.max(0, radius.y - offset),
    );
    final rect = (Offset.zero & size).deflate(offset);
    return RRect.fromRectAndCorners(
      rect,
      topLeft: shrink(outerRadius.topLeft),
      topRight: shrink(outerRadius.topRight),
      bottomLeft: shrink(outerRadius.bottomLeft),
      bottomRight: shrink(outerRadius.bottomRight),
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    final minSide = (inset + strokeWidth) * 2;
    if (size.width <= minSide || size.height <= minSide) return;
    final path = Path()..addRRect(outlineFor(size));
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    for (final metric in path.computeMetrics()) {
      for (
        var distance = 0.0;
        distance < metric.length;
        distance += dashLength + gapLength
      ) {
        canvas.drawPath(
          metric.extractPath(
            distance,
            math.min(distance + dashLength, metric.length),
          ),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant PendingSyncOutlinePainter oldDelegate) =>
      oldDelegate.color != color ||
      oldDelegate.outerRadius != outerRadius ||
      oldDelegate.inset != inset;
}
