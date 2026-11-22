import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_scenes.dart';

/// Multi-hue sign-in scenes (the Sorbet illustration kit). They draw on their
/// own view box, not the 120-unit square: [welcomeBowlViewBox] for the hero
/// and [authSceneViewBox] for the rest. Fills come from the palette's hues,
/// so each scene follows the appearance in light and dark.
const welcomeBowlViewBox = Size(320, 280);
const authSceneViewBox = Size(200, 160);

/// Strokes traced with the illustration outline at [width].
Paint _line(IllustrationInk ink, double width) =>
    ink.stroke(ink.palette.outline, width);

/// A body filled with [color] and traced with the outline.
void _shape(Canvas canvas, IllustrationInk ink, Path path, Color color) {
  canvas
    ..drawPath(path, ink.fill(color))
    ..drawPath(path, _line(ink, 3));
}

Path _rrect(double x, double y, double w, double h, double r) =>
    Path()..addRRect(RRect.fromLTRBR(x, y, x + w, y + h, Radius.circular(r)));

Path _circle(double cx, double cy, double r) =>
    Path()..addOval(Rect.fromCircle(center: Offset(cx, cy), radius: r));

/// A four-point sparkle that twinkles when [phase] is set.
void _sparkle(
  Canvas canvas,
  IllustrationInk ink,
  Offset center,
  double radius, {
  double? phase,
}) {
  final glow = phase == null ? 1.0 : 0.55 + 0.45 * ink.wave(phase);
  final path = Path();
  for (var i = 0; i < 8; i++) {
    final angle = i * math.pi / 4 - math.pi / 2;
    final r = i.isEven ? radius * (0.85 + 0.15 * glow) : radius * 0.36;
    final point = center + Offset(math.cos(angle) * r, math.sin(angle) * r);
    i == 0 ? path.moveTo(point.dx, point.dy) : path.lineTo(point.dx, point.dy);
  }
  path.close();
  canvas.drawPath(
    path,
    ink.fill(ink.palette.ink.withValues(alpha: ink.palette.ink.a * glow)),
  );
}

void _polyline(Canvas canvas, List<Offset> points, Paint paint) {
  final path = Path()..moveTo(points.first.dx, points.first.dy);
  for (final point in points.skip(1)) {
    path.lineTo(point.dx, point.dy);
  }
  canvas.drawPath(path, paint);
}

/// Three sorbet scoops in a bowl: the sign-in hero.
void paintWelcomeBowl(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas
    ..drawCircle(const Offset(160, 146), 124, ink.fill(h.pink.calm))
    ..save()
    ..translate(0, -4 * ink.wave());
  _shape(canvas, ink, _circle(112, 150, 42), h.blue.fill);
  _shape(canvas, ink, _circle(208, 150, 42), h.green.fill);
  _shape(canvas, ink, _circle(160, 114, 46), h.yellow.fill);
  final card = RRect.fromLTRBR(93, 130, 127, 158, const Radius.circular(6));
  canvas
    ..drawRRect(card, ink.fill(p.surface))
    ..drawRRect(card, ink.stroke(p.ink, 2.5))
    ..drawLine(
      const Offset(93, 139),
      const Offset(127, 139),
      ink.stroke(p.ink, 2.5),
    );
  _polyline(canvas, const [
    Offset(194, 146),
    Offset(203, 155),
    Offset(220, 136),
  ], ink.stroke(h.green.ink, 5));
  canvas
    ..drawCircle(const Offset(148, 108), 3.6, ink.fill(p.ink))
    ..drawCircle(const Offset(172, 108), 3.6, ink.fill(p.ink))
    ..drawPath(
      Path()
        ..moveTo(150, 121)
        ..quadraticBezierTo(160, 129, 170, 121),
      ink.stroke(p.ink, 3),
    )
    ..restore();
  final bowl = Path()
    ..moveTo(64, 166)
    ..lineTo(256, 166)
    ..cubicTo(256, 222, 214, 252, 160, 252)
    ..cubicTo(106, 252, 64, 222, 64, 166)
    ..close();
  _shape(canvas, ink, bowl, p.surface);
  _shape(canvas, ink, _rrect(128, 250, 64, 12, 6), p.surface);
  _sparkle(canvas, ink, const Offset(50, 62), 9, phase: 0);
}

/// An envelope with a code card peeking out.
void paintEmailCode(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas.drawCircle(const Offset(100, 82), 66, ink.fill(h.blue.calm));
  final lift = 3 * math.max<double>(0, ink.wave());
  canvas
    ..save()
    ..translate(0, -lift);
  _shape(canvas, ink, _rrect(68, 28, 64, 46, 8), p.surface);
  for (final x in const [86.0, 100.0, 114.0]) {
    canvas.drawCircle(Offset(x, 50), 4, ink.fill(h.blue.ink));
  }
  canvas.restore();
  _shape(canvas, ink, _rrect(50, 62, 100, 66, 12), p.surface);
  _polyline(canvas, const [
    Offset(54, 68),
    Offset(100, 100),
    Offset(146, 68),
  ], _line(ink, 3));
  _sparkle(canvas, ink, const Offset(40, 34), 8, phase: 0);
  _sparkle(canvas, ink, const Offset(166, 120), 6);
}

/// A phone beside a shield with a check: two-step verification.
void paintTwoStep(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas.drawCircle(const Offset(100, 82), 66, ink.fill(h.green.calm));
  _shape(canvas, ink, _rrect(58, 24, 56, 106, 12), p.surface);
  canvas
    ..drawLine(
      const Offset(76, 34),
      const Offset(96, 34),
      ink.stroke(p.detail, 3),
    )
    ..drawRRect(
      RRect.fromLTRBR(68, 54, 104, 68, const Radius.circular(5)),
      ink.fill(h.green.calm),
    )
    ..drawLine(
      const Offset(74, 90),
      const Offset(98, 90),
      ink.stroke(p.detail, 4),
    )
    ..drawLine(
      const Offset(74, 102),
      const Offset(90, 102),
      ink.stroke(p.detail, 4),
    )
    ..save()
    ..translate(0, -2 * ink.wave());
  final shield = Path()
    ..moveTo(136, 62)
    ..lineTo(162, 72)
    ..lineTo(162, 92)
    ..cubicTo(162, 110, 150, 120, 136, 126)
    ..cubicTo(122, 120, 110, 110, 110, 92)
    ..lineTo(110, 72)
    ..close();
  _shape(canvas, ink, shield, h.green.fill);
  _polyline(canvas, const [
    Offset(125, 94),
    Offset(133, 102),
    Offset(147, 87),
  ], ink.stroke(h.green.ink, 4));
  canvas.restore();
  _sparkle(canvas, ink, const Offset(160, 36), 8, phase: 0);
}

/// A key with a fingerprint bow: passkeys and this-device sign-in.
void paintPasskey(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas.drawCircle(const Offset(100, 82), 66, ink.fill(h.purple.calm));
  final key = Path()
    ..moveTo(106, 76)
    ..lineTo(168, 76)
    ..lineTo(168, 88)
    ..lineTo(158, 88)
    ..lineTo(158, 100)
    ..lineTo(146, 100)
    ..lineTo(146, 88)
    ..lineTo(106, 88)
    ..close();
  _shape(canvas, ink, key, p.surface);
  _shape(canvas, ink, _circle(78, 82, 30), h.purple.fill);
  final ridge = ink.stroke(h.purple.ink, 3);
  final pulse = 0.65 + 0.35 * (0.5 + 0.5 * ink.wave());
  canvas
    ..drawPath(
      Path()
        ..moveTo(64, 84)
        ..cubicTo(64, 75, 70, 69, 78, 69)
        ..cubicTo(86, 69, 92, 75, 92, 84),
      ink.stroke(h.purple.ink.withValues(alpha: h.purple.ink.a * pulse), 3),
    )
    ..drawPath(
      Path()
        ..moveTo(71, 92)
        ..cubicTo(71, 85, 74, 81, 78, 81)
        ..cubicTo(82, 81, 85, 85, 85, 92),
      ridge,
    )
    ..drawLine(const Offset(78, 88), const Offset(78, 98), ridge);
  _sparkle(canvas, ink, const Offset(150, 40), 8, phase: 0);
}

/// Two people and swap arrows: saved accounts.
void paintAccounts(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas.drawCircle(const Offset(100, 82), 66, ink.fill(h.orange.calm));
  void person(double cx, double cy, Color fill) {
    _shape(canvas, ink, _circle(cx, cy, 28), fill);
    canvas
      ..drawCircle(Offset(cx, cy - 8), 9, ink.fill(p.surface))
      ..drawPath(
        Path()
          ..moveTo(cx - 16, cy + 18)
          ..cubicTo(cx - 13, cy + 9, cx - 7, cy + 5, cx, cy + 5)
          ..cubicTo(cx + 7, cy + 5, cx + 13, cy + 9, cx + 16, cy + 18)
          ..close(),
        ink.fill(p.surface),
      );
  }

  person(78, 72, h.orange.fill);
  person(124, 84, h.blue.fill);
  final shift = 2 * ink.wave();
  final arrow = ink.stroke(p.ink, 3);
  _polyline(canvas, [
    Offset(70 + shift, 124),
    Offset(124 + shift, 124),
    Offset(117 + shift, 117),
  ], arrow);
  _polyline(canvas, [
    Offset(130 - shift, 134),
    Offset(76 - shift, 134),
    Offset(83 - shift, 141),
  ], arrow);
}

/// A padlock with a clock: a locked or expired session.
void paintLocked(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final h = p.hues;
  canvas
    ..drawCircle(const Offset(100, 82), 66, ink.fill(h.red.calm))
    ..save()
    ..translate(100, 95)
    ..rotate(0.035 * ink.wave())
    ..translate(-100, -95)
    ..drawPath(
      Path()
        ..moveTo(80, 70)
        ..lineTo(80, 56)
        ..arcToPoint(const Offset(120, 56), radius: const Radius.circular(20))
        ..lineTo(120, 70),
      _line(ink, 6),
    );
  _shape(canvas, ink, _rrect(64, 66, 72, 58, 14), p.surface);
  canvas
    ..drawCircle(const Offset(100, 90), 6, ink.fill(h.red.ink))
    ..drawLine(
      const Offset(100, 94),
      const Offset(100, 106),
      ink.stroke(h.red.ink, 4),
    )
    ..restore();
  _shape(canvas, ink, _circle(140, 118, 18), h.red.fill);
  final turn = ink.t * 2 * math.pi;
  final hand = Offset(
    140 + 7 * math.sin(turn + 2.2),
    118 - 7 * math.cos(turn + 2.2),
  );
  _polyline(canvas, [
    const Offset(140, 108),
    const Offset(140, 118),
    hand,
  ], ink.stroke(p.ink, 3));
}
