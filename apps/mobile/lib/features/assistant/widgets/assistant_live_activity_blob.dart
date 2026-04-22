import 'dart:math' as math;

import 'package:flutter/material.dart';

class AssistantLiveActivityBlob extends StatelessWidget {
  const AssistantLiveActivityBlob({
    required this.label,
    required this.caption,
    required this.level,
    required this.isActive,
    required this.icon,
    required this.color,
    super.key,
  });

  final String label;
  final String caption;
  final double level;
  final bool isActive;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final normalized = level.clamp(0.0, 1.0);
    final haloScale = 1 + (normalized * 0.28);
    final coreScale = 0.96 + (normalized * 0.2);
    final ringOpacity = isActive ? 0.2 + (normalized * 0.14) : 0.08;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 152,
          height: 152,
          child: Stack(
            alignment: Alignment.center,
            children: [
              TweenAnimationBuilder<double>(
                tween: Tween<double>(begin: 1, end: haloScale),
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                builder: (context, value, child) {
                  return Transform.scale(scale: value, child: child);
                },
                child: Container(
                  width: 136,
                  height: 136,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: color.withValues(alpha: ringOpacity),
                  ),
                ),
              ),
              TweenAnimationBuilder<double>(
                tween: Tween<double>(begin: 1, end: 1 + (normalized * 0.16)),
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutCubic,
                builder: (context, value, child) {
                  return Transform.scale(scale: value, child: child);
                },
                child: Container(
                  width: 112,
                  height: 112,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        color.withValues(alpha: 0.34 + (normalized * 0.18)),
                        color.withValues(alpha: 0.14),
                      ],
                    ),
                    border: Border.all(
                      color: color.withValues(alpha: 0.34),
                    ),
                  ),
                ),
              ),
              TweenAnimationBuilder<double>(
                tween: Tween<double>(begin: 1, end: coreScale),
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOutCubic,
                builder: (context, value, child) {
                  return Transform.scale(scale: value, child: child);
                },
                child: Container(
                  width: 78,
                  height: 78,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: theme.colorScheme.surface.withValues(alpha: 0.94),
                    boxShadow: [
                      BoxShadow(
                        blurRadius: 28,
                        color: color.withValues(alpha: 0.18),
                      ),
                    ],
                  ),
                  child: Icon(icon, color: color, size: 28),
                ),
              ),
              if (isActive)
                Positioned.fill(
                  child: IgnorePointer(
                    child: CustomPaint(
                      painter: _BlobSparkPainter(
                        color: color,
                        level: normalized,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          label,
          style: theme.textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          caption,
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            height: 1.35,
          ),
        ),
      ],
    );
  }
}

class _BlobSparkPainter extends CustomPainter {
  const _BlobSparkPainter({
    required this.color,
    required this.level,
  });

  final Color color;
  final double level;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8
      ..color = color.withValues(alpha: 0.22);
    final center = size.center(Offset.zero);
    final radius = (size.shortestSide * 0.44) + (level * 6);
    final path = Path();
    for (var index = 0; index <= 40; index++) {
      final progress = index / 40;
      final angle = progress * math.pi * 2;
      final wave = math.sin((progress * math.pi * 8) + (level * math.pi)) * 5;
      final x = center.dx + math.cos(angle) * (radius + wave);
      final y = center.dy + math.sin(angle) * (radius + wave);
      if (index == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _BlobSparkPainter oldDelegate) {
    return oldDelegate.color != color || oldDelegate.level != level;
  }
}
