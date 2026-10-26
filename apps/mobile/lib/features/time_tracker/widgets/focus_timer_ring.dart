import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';

/// A progress ring around the remaining time. The size follows text scale
/// so the time never clips; the arc is painted, not animated.
class FocusTimerRing extends StatelessWidget {
  const FocusTimerRing({
    required this.progress,
    required this.color,
    required this.child,
    super.key,
  });

  final double progress;
  final Color color;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0);
    final size = 168.0 * scale;
    final track = AppTokens.of(context).colorScheme.muted;
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _RingPainter(
          progress: progress.clamp(0, 1).toDouble(),
          color: color,
          track: track,
        ),
        child: Padding(
          padding: EdgeInsets.all(size * 0.16),
          child: FittedBox(fit: BoxFit.scaleDown, child: child),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({
    required this.progress,
    required this.color,
    required this.track,
  });

  final double progress;
  final Color color;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 10.0;
    final rect = (Offset.zero & size).deflate(stroke / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, 0, math.pi * 2, false, paint..color = track);
    if (progress > 0) {
      canvas.drawArc(
        rect,
        -math.pi / 2,
        math.pi * 2 * progress,
        false,
        paint..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.progress != progress || old.color != color || old.track != track;
}
