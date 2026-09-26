import 'dart:math' as math;

import 'package:flutter/material.dart';

class CacheStorageChart extends StatelessWidget {
  const CacheStorageChart({
    required this.bytes,
    required this.limitBytes,
    required this.categoryBytes,
    required this.colors,
    super.key,
  });

  final int bytes;
  final int limitBytes;
  final List<int> categoryBytes;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: 132,
    child: Stack(
      alignment: Alignment.center,
      children: [
        CustomPaint(
          size: const Size.square(132),
          painter: _CacheRingPainter(
            categoryBytes: categoryBytes,
            colors: colors,
            track: Theme.of(context).colorScheme.surfaceContainerHighest,
          ),
        ),
        Text(
          '${limitBytes == 0 ? 0 : (100 * bytes / limitBytes).round()}%',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
      ],
    ),
  );
}

class _CacheRingPainter extends CustomPainter {
  const _CacheRingPainter({
    required this.categoryBytes,
    required this.colors,
    required this.track,
  });

  final List<int> categoryBytes;
  final List<Color> colors;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(10, 10, size.width - 20, size.height - 20);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12
      ..strokeCap = StrokeCap.round
      ..color = track;
    canvas.drawArc(rect, 0, 2 * math.pi, false, paint);

    final total = categoryBytes.fold<int>(0, (sum, bytes) => sum + bytes);
    if (total == 0) return;
    var start = -math.pi / 2;
    for (var index = 0; index < categoryBytes.length; index++) {
      final sweep = (categoryBytes[index] / total) * 2 * math.pi;
      if (sweep <= 0) continue;
      paint.color = colors[index];
      canvas.drawArc(rect, start, sweep, false, paint);
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _CacheRingPainter oldDelegate) =>
      oldDelegate.categoryBytes != categoryBytes ||
      oldDelegate.colors != colors ||
      oldDelegate.track != track;
}
