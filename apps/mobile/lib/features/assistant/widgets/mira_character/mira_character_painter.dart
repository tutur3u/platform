import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/brand_accents.dart';
import 'package:mobile/features/assistant/widgets/mira_character/mira_character.dart';

/// Paints [MiraMotion]'s pose in a 200-unit square scaled to the canvas: the
/// eight petals of the Mira mark, in the brand marks clockwise from the top
/// (Innovation, Growth, Energy, Impact, twice), around a face with eyes,
/// cheeks and a mouth. The petals keep their brand colours in every theme;
/// the face and outline follow the appearance tokens.
class MiraCharacterPainter extends CustomPainter {
  MiraCharacterPainter({
    required this.motion,
    required this.face,
    required this.ink,
    required this.outline,
  }) : super(repaint: motion);

  final MiraMotion motion;
  final Color face;
  final Color ink;
  final Color outline;

  static const double _unit = 200;
  static const double _tau = 2 * math.pi;

  /// The mark's petal pointing up from the centre: a capsule whose inner end
  /// narrows to a point, as in the logo.
  static final Path _petal = Path()
    ..moveTo(-17, -41)
    ..lineTo(-17, -69)
    ..arcToPoint(const Offset(17, -69), radius: const Radius.circular(17))
    ..lineTo(17, -41)
    ..lineTo(0, -24)
    ..close();

  @override
  void paint(Canvas canvas, Size size) {
    final m = motion;
    final life = m.liveliness;
    final breathe = math.sin(m.time / 3.2 * _tau) * life;
    final bounce = m.burst * math.sin((1 - m.burst) * 3 * math.pi) * 0.12;
    final scale = size.shortestSide / _unit;
    canvas
      ..save()
      ..scale(scale);

    final shadowWidth = 70 - 6 * breathe;
    canvas
      ..drawOval(
        Rect.fromCenter(
          center: const Offset(100, 188),
          width: shadowWidth,
          height: 9,
        ),
        Paint()..color = outline.withValues(alpha: 0.45),
      )
      ..translate(100, 98 - 4 * breathe - 10 * bounce.abs())
      ..scale(1 + 0.025 * breathe + bounce);
    _petals(canvas, m, life);
    _face(canvas, m, life);
    canvas.restore();
  }

  void _petals(Canvas canvas, MiraMotion m, double life) {
    canvas
      ..save()
      ..rotate(m.spin);
    for (var i = 0; i < 8; i++) {
      final phase = i * math.pi / 4;
      final sway = 0.07 * life * math.sin(m.time / 2.6 * _tau + phase);
      final reach =
          3 * life * math.sin(m.time / 1.8 * _tau + i * 0.8) + 8 * m.burst;
      canvas
        ..save()
        ..rotate(phase + sway)
        ..translate(0, -reach)
        ..drawPath(_petal, Paint()..color = BrandAccents.core[i % 4].mark)
        ..restore();
    }
    canvas.restore();
  }

  void _face(Canvas canvas, MiraMotion m, double life) {
    canvas
      ..drawCircle(Offset.zero, 30, Paint()..color = face)
      ..drawCircle(
        Offset.zero,
        30,
        Paint()
          ..color = outline
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    final cheek = Paint()
      ..color = BrandAccents.impact.mark.withValues(alpha: 0.28);
    canvas
      ..drawCircle(const Offset(-17, 8), 4.5, cheek)
      ..drawCircle(const Offset(17, 8), 4.5, cheek);

    final inkPaint = Paint()..color = ink;
    final line = Paint()
      ..color = ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    final look = m.thinking
        ? Offset(2.5 * math.sin(m.time * 2.2), -2.5)
        : Offset.zero;
    if (m.burst > 0.3) {
      for (final x in [-10.0, 10.0]) {
        final eye = Path()
          ..moveTo(x - 4.5, -1)
          ..quadraticBezierTo(x, -9, x + 4.5, -1);
        canvas.drawPath(eye, line);
      }
    } else {
      final blink = (m.time % 4.2) - 4.0;
      final open = life > 0.5 && blink.abs() < 0.1
          ? 0.15 + 0.85 * blink.abs() / 0.1
          : 1.0;
      for (final x in [-10.0, 10.0]) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: Offset(x, -3) + look,
              width: 6.5,
              height: 11 * open,
            ),
            const Radius.circular(3.25),
          ),
          inkPaint,
        );
      }
    }

    if (m.burst > 0.3) {
      canvas.drawOval(
        Rect.fromCenter(center: const Offset(0, 11), width: 9, height: 7),
        inkPaint,
      );
    } else if (m.thinking) {
      canvas.drawLine(const Offset(-3, 11), const Offset(3, 11), line);
    } else {
      final smile = Path()
        ..moveTo(-6, 9)
        ..quadraticBezierTo(0, 15, 6, 9);
      canvas.drawPath(smile, line);
    }
  }

  @override
  bool shouldRepaint(MiraCharacterPainter oldDelegate) =>
      oldDelegate.motion != motion ||
      oldDelegate.face != face ||
      oldDelegate.ink != ink ||
      oldDelegate.outline != outline;
}
