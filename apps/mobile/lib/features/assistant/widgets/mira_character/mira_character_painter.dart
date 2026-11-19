import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/brand_accents.dart';
import 'package:mobile/features/assistant/widgets/mira_character/mira_character.dart';

/// The eight petals of the Mira mark follow the brand palette clockwise.
class MiraCharacterPainter extends CustomPainter {
  MiraCharacterPainter({
    required this.motion,
    required this.face,
    required this.shade,
    required this.ink,
    required this.outline,
  }) : super(repaint: motion);

  final MiraMotion motion;
  final Color face;
  final Color shade;
  final Color ink;
  final Color outline;

  static const double _unit = 200;
  static const double _tau = 2 * math.pi;
  static const _eyePositions = [-11.0, 11.0];

  // Each petal flares toward its rounded tip and tapers under the face.
  static final Path _petal = Path()
    ..moveTo(0, -25)
    ..cubicTo(-9, -35, -20, -54, -18, -68)
    ..cubicTo(-17, -79, -9, -87, 1, -87)
    ..cubicTo(12, -87, 20, -78, 20, -67)
    ..cubicTo(20, -53, 12, -35, 0, -25)
    ..close();
  static final List<Paint> _petalPaints = [
    for (final accent in BrandAccents.core)
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.lerp(accent.mark, BrandAccents.paper, 0.36)!,
            accent.mark,
            Color.lerp(accent.mark, BrandAccents.ink, 0.22)!,
          ],
          stops: const [0, 0.38, 1],
        ).createShader(_petal.getBounds()),
  ];
  static final _glint = Paint()
    ..color = BrandAccents.paper.withValues(alpha: 0.78);
  static final _blush = Paint()
    ..color = BrandAccents.impact.mark.withValues(alpha: 0.26);
  static final _smile = Path()
    ..moveTo(-6, 9)
    ..quadraticBezierTo(0, 16, 6, 9);
  static final _happyEyes = Path()
    ..moveTo(-15.5, -1)
    ..quadraticBezierTo(-11, -9, -6.5, -1)
    ..moveTo(6.5, -1)
    ..quadraticBezierTo(11, -9, 15.5, -1);

  late final _facePaint = Paint()
    ..shader = RadialGradient(
      center: const Alignment(-0.28, -0.45),
      radius: 0.91,
      colors: [face, face, shade],
      stops: const [0, 0.42, 1],
    ).createShader(const Rect.fromLTRB(-31, -31, 31, 31));
  late final _shadow = Paint()
    ..shader = RadialGradient(
      colors: [ink.withValues(alpha: 0.18), ink.withValues(alpha: 0)],
    ).createShader(const Rect.fromLTRB(-1, -1, 1, 1));
  late final _rim = Paint()
    ..color = outline
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.4;
  late final _ink = Paint()..color = ink;
  late final _expression = Paint()
    ..color = ink
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.8
    ..strokeCap = StrokeCap.round;

  @override
  void paint(Canvas canvas, Size size) {
    final m = motion;
    final breathe = math.sin(m.time / 3.6 * _tau) * m.liveliness;
    final bounce = m.burst * math.sin((1 - m.burst) * 2 * math.pi) * 0.065;
    canvas
      ..save()
      ..scale(size.shortestSide / _unit)
      ..save()
      ..translate(100, 190)
      ..scale(41 - 4 * breathe, 6)
      ..drawCircle(Offset.zero, 1, _shadow)
      ..restore()
      ..translate(100, 97 - 2 * breathe - 8 * bounce.abs())
      ..scale(1 + 0.022 * breathe + bounce);
    _paintPetals(canvas, m);
    _paintFace(canvas, m);
    canvas.restore();
  }

  void _paintPetals(Canvas canvas, MiraMotion m) {
    final sway = math.sin(m.time / 5.2 * _tau) * 0.047 * m.liveliness;
    canvas
      ..save()
      ..rotate(m.spin + sway);
    for (var i = 0; i < 8; i++) {
      final phase = i * math.pi / 4;
      final wave = math.sin(m.petalPhase + phase);
      final shift = m.liveliness * (1.8 + m.attention) * wave + 4 * m.burst;
      canvas
        ..save()
        ..rotate(phase + 0.038 * m.liveliness * wave)
        ..translate(0, -shift)
        ..drawPath(_petal, _petalPaints[i % _petalPaints.length])
        ..restore();
    }
    canvas.restore();
  }

  void _paintFace(Canvas canvas, MiraMotion m) {
    canvas
      ..drawCircle(Offset.zero, 31, _facePaint)
      ..drawCircle(Offset.zero, 31, _rim)
      ..drawOval(const Rect.fromLTRB(-23, 4, -13, 10), _blush)
      ..drawOval(const Rect.fromLTRB(13, 4, 23, 10), _blush);

    if (m.burst > 0.3) {
      canvas
        ..drawPath(_happyEyes, _expression)
        ..drawOval(const Rect.fromLTRB(-4, 8, 4, 15), _ink);
      return;
    }

    final blink = ((m.time % 5.1) - 4.9).abs();
    final openness = m.liveliness > 0.5 && blink < 0.1
        ? 0.16 + 0.84 * blink / 0.1
        : 1.0;
    final look = m.thinking
        ? Offset(2 * math.sin(m.time * 1.8), -2)
        : Offset.zero;
    for (final x in _eyePositions) {
      final eye = Offset(x, -3) + look;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: eye,
            width: 7.5,
            height: (m.listening ? 13 : 11) * openness,
          ),
          const Radius.circular(4),
        ),
        _ink,
      );
      if (openness > 0.5) {
        canvas.drawCircle(eye + const Offset(-1, -2), 1.25, _glint);
      }
    }
    if (m.thinking) {
      canvas.drawLine(const Offset(-3, 11), const Offset(3, 11), _expression);
    } else {
      canvas.drawPath(_smile, _expression);
    }
  }

  @override
  bool shouldRepaint(MiraCharacterPainter oldDelegate) =>
      oldDelegate.motion != motion ||
      oldDelegate.face != face ||
      oldDelegate.shade != shade ||
      oldDelegate.ink != ink ||
      oldDelegate.outline != outline;
}
