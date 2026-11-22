import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_scenes.dart';

/// Multi-hue onboarding scenes from the Sorbet kit. Like the sign-in scenes
/// they draw on the 200 by 160 `authSceneViewBox`, take every fill from the
/// palette's hues and move only while the loop runs.

void _shape(
  Canvas canvas,
  IllustrationInk ink,
  Path path,
  Color color, {
  double width = 3,
}) {
  canvas
    ..drawPath(path, ink.fill(color))
    ..drawPath(path, ink.stroke(ink.palette.outline, width));
}

Path _rrect(double x, double y, double w, double h, double r) =>
    Path()..addRRect(RRect.fromLTRBR(x, y, x + w, y + h, Radius.circular(r)));

Path _circle(double cx, double cy, double r) =>
    Path()..addOval(Rect.fromCircle(center: Offset(cx, cy), radius: r));

/// A small rotated confetti square that fades in and out with [phase].
void _confetti(
  Canvas canvas,
  IllustrationInk ink,
  Offset center,
  double turn,
  Color color, {
  double phase = 0,
}) {
  final glow = 0.6 + 0.4 * (0.5 + 0.5 * ink.wave(phase));
  canvas
    ..save()
    ..translate(center.dx, center.dy)
    ..rotate(turn)
    ..drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset.zero, width: 8, height: 8),
        const Radius.circular(2),
      ),
      ink.fill(color.withValues(alpha: color.a * glow)),
    )
    ..restore();
}

/// A profile card with a smiling avatar and a pencil: "Make it yours".
void paintProfileCard(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas.drawCircle(const Offset(100, 82), 66, ink.fill(h.yellow.calm));
  _shape(canvas, ink, _rrect(42, 44, 112, 76, 14), p.surface);
  _shape(canvas, ink, _circle(74, 78, 17), h.yellow.fill);
  canvas
    ..drawCircle(const Offset(68, 75), 2.5, ink.fill(p.ink))
    ..drawCircle(const Offset(80, 75), 2.5, ink.fill(p.ink))
    ..drawPath(
      Path()
        ..moveTo(69, 84)
        ..quadraticBezierTo(74, 88, 79, 84),
      ink.stroke(p.ink, 2.5),
    )
    ..drawLine(
      const Offset(102, 70),
      const Offset(138, 70),
      ink.stroke(p.detail, 4),
    )
    ..drawLine(
      const Offset(102, 84),
      const Offset(124, 84),
      ink.stroke(p.detail, 4),
    )
    // The pencil writes a little on each pass.
    ..save()
    ..translate(132, 128)
    ..rotate(0.06 * ink.wave())
    ..translate(-132, -128);
  final pencil = Path()
    ..moveTo(128, 124)
    ..lineTo(156, 96)
    ..lineTo(165, 105)
    ..lineTo(137, 133)
    ..lineTo(128, 133)
    ..close();
  _shape(canvas, ink, pencil, h.pink.fill);
  canvas.restore();
}

/// Three workspace tiles under a flag: "Set up your space".
void paintSpaceTiles(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas
    ..drawCircle(const Offset(100, 82), 66, ink.fill(h.blue.calm))
    ..drawLine(
      const Offset(100, 38),
      const Offset(100, 18),
      ink.stroke(p.ink, 3),
    );
  final wave = 2 * ink.wave();
  final flag = Path()
    ..moveTo(100, 18)
    ..lineTo(120, 18 + wave * 0.5)
    ..lineTo(114, 25 + wave)
    ..lineTo(120, 32 + wave * 0.5)
    ..lineTo(100, 32)
    ..close();
  _shape(canvas, ink, flag, h.orange.fill, width: 2.5);
  _shape(canvas, ink, _rrect(80, 38, 40, 40, 10), h.pink.fill);
  _shape(canvas, ink, _rrect(58, 80, 40, 40, 10), h.green.fill);
  _shape(canvas, ink, _rrect(102, 80, 40, 40, 10), h.yellow.fill);
}

/// Three scoop cups, two of them picked: "What brings you here?".
void paintInterestScoops(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas.drawCircle(const Offset(100, 82), 66, ink.fill(h.purple.calm));
  final scoops = [
    (52.0, h.blue, true, 0.0),
    (100.0, h.orange, false, 0.33),
    (148.0, h.purple, true, 0.66),
  ];
  for (final (x, hue, picked, phase) in scoops) {
    final lift = picked ? 3 * math.max<double>(0, ink.wave(phase)) : 0.0;
    canvas
      ..save()
      ..translate(0, -lift);
    _shape(canvas, ink, _circle(x, 78, 20), hue.fill);
    canvas.restore();
    final cup = Path()
      ..moveTo(x - 22, 88)
      ..lineTo(x + 22, 88)
      ..lineTo(x + 15, 124)
      ..lineTo(x - 15, 124)
      ..close();
    _shape(canvas, ink, cup, p.surface);
    if (picked) {
      canvas.drawCircle(Offset(x + 14, 62 - lift), 9, ink.fill(hue.ink));
      ink.check(canvas, Offset(x + 14, 62 - lift), 8, p.surface);
    }
  }
}

/// A full sorbet bowl with a cherry and confetti: "You're all set".
void paintAllSetBowl(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas
    ..drawCircle(const Offset(100, 82), 66, ink.fill(h.green.calm))
    ..save()
    ..translate(0, -3 * ink.wave());
  _shape(canvas, ink, _circle(84, 82, 22), h.blue.fill);
  _shape(canvas, ink, _circle(116, 82, 22), h.pink.fill);
  _shape(canvas, ink, _circle(100, 64, 24), h.yellow.fill);
  canvas.drawPath(
    Path()
      ..moveTo(100, 40)
      ..cubicTo(102, 32, 108, 28, 114, 28),
    ink.stroke(p.ink, 3),
  );
  _shape(canvas, ink, _circle(100, 38, 7), h.red.fill, width: 2.5);
  canvas.restore();
  final bowl = Path()
    ..moveTo(56, 92)
    ..lineTo(144, 92)
    ..cubicTo(144, 120, 126, 134, 100, 134)
    ..cubicTo(74, 134, 56, 120, 56, 92)
    ..close();
  _shape(canvas, ink, bowl, p.surface);
  _confetti(canvas, ink, const Offset(44, 44), 0.35, h.orange.fill);
  _confetti(
    canvas,
    ink,
    const Offset(156, 54),
    -0.26,
    h.purple.fill,
    phase: 0.5,
  );
  canvas.drawCircle(const Offset(160, 112), 4, ink.fill(h.blue.ink));
}
