import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_palette.dart';

export 'package:mobile/core/ui/kit/illustration/illustration_scenes_more.dart';

/// Paint helpers shared by the illustration scenes, in 120-unit coordinates.
class IllustrationInk {
  IllustrationInk(this.palette, this.t);

  final AppIllustrationPalette palette;

  /// Loop progress from 0 to 1.
  final double t;

  /// Sine wave over one loop, shifted by [phase] loops; 0 at rest.
  double wave([double phase = 0]) => math.sin((t + phase) * 2 * math.pi);

  Paint fill(Color color) => Paint()..color = color;

  Paint stroke(Color color, double width) => Paint()
    ..color = color
    ..style = PaintingStyle.stroke
    ..strokeWidth = width
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;

  /// A body filled with the surface colour and traced with the outline.
  void body(Canvas canvas, Path path, {Color? color}) {
    canvas
      ..drawPath(path, fill(color ?? palette.surface))
      ..drawPath(path, stroke(palette.outline, 2.5));
  }

  void line(Canvas canvas, Offset a, Offset b, {Color? color, double? width}) =>
      canvas.drawLine(a, b, stroke(color ?? palette.detail, width ?? 4));

  /// A check mark centred on [center].
  void check(Canvas canvas, Offset center, double size, Color color) {
    final path = Path()
      ..moveTo(center.dx - size * 0.5, center.dy)
      ..lineTo(center.dx - size * 0.12, center.dy + size * 0.38)
      ..lineTo(center.dx + size * 0.55, center.dy - size * 0.4);
    canvas.drawPath(path, stroke(color, size * 0.28));
  }
}

RRect _box(double l, double t, double r, double b, double radius) =>
    RRect.fromLTRBR(l, t, r, b, Radius.circular(radius));

void paintBell(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  canvas
    ..save()
    ..translate(60, 36)
    ..rotate(0.14 * ink.wave())
    ..translate(-60, -36);
  final bell = Path()
    ..moveTo(38, 78)
    ..quadraticBezierTo(46, 72, 46, 58)
    ..quadraticBezierTo(46, 38, 60, 38)
    ..quadraticBezierTo(74, 38, 74, 58)
    ..quadraticBezierTo(74, 72, 82, 78)
    ..close();
  ink.body(canvas, bell);
  canvas
    ..drawCircle(const Offset(60, 84), 5, ink.fill(p.accent))
    ..drawCircle(const Offset(60, 35), 3.5, ink.fill(p.outline))
    ..restore();
  final pulse = 1 + 0.08 * ink.wave(0.25);
  canvas.drawCircle(const Offset(82, 42), 11 * pulse, ink.fill(p.accent));
  ink.check(canvas, const Offset(82, 42), 10, p.onAccent);
}

void paintChecklist(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  canvas
    ..save()
    ..translate(0, 2 * ink.wave());
  ink.body(canvas, Path()..addRRect(_box(36, 30, 84, 92, 9)));
  for (var i = 0; i < 3; i++) {
    final y = 46.0 + i * 15;
    final done = i < 2;
    final box = _box(43, y - 5, 53, y + 5, 3);
    if (done) {
      canvas.drawRRect(box, ink.fill(p.accent));
      ink.check(canvas, Offset(48, y), 7, p.onAccent);
    } else {
      canvas.drawRRect(box, ink.stroke(p.outline, 2));
    }
    ink.line(canvas, Offset(60, y), Offset(i == 1 ? 70 : 76, y));
  }
  canvas.restore();
}

void paintReceipt(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final receipt = Path()
    ..moveTo(38, 30)
    ..lineTo(78, 30)
    ..lineTo(78, 88);
  for (var x = 78.0; x > 38; x -= 8) {
    receipt
      ..lineTo(x - 4, 83)
      ..lineTo(x - 8, 88);
  }
  receipt.close();
  ink
    ..body(canvas, receipt)
    ..line(canvas, const Offset(46, 44), const Offset(70, 44))
    ..line(canvas, const Offset(46, 56), const Offset(64, 56))
    ..line(canvas, const Offset(46, 68), const Offset(68, 68));
  final lift = 3 * ink.wave();
  final coin = Offset(84, 76 - lift);
  canvas
    ..drawCircle(coin, 12, ink.fill(p.accent))
    ..drawCircle(coin, 7, ink.stroke(p.onAccent, 2.5));
}

void paintBudgetRing(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  const center = Offset(60, 60);
  final rect = Rect.fromCircle(center: center, radius: 24);
  canvas
    ..drawCircle(center, 33, ink.fill(p.surface))
    ..drawCircle(center, 33, ink.stroke(p.outline, 2.5))
    ..drawArc(rect, 0, 2 * math.pi, false, ink.stroke(p.detail, 10));
  final start = -math.pi / 2 + ink.t * 2 * math.pi;
  canvas
    ..drawArc(rect, start, math.pi * 1.2, false, ink.stroke(p.accent, 10))
    ..drawCircle(center, 4, ink.fill(p.outline));
}

void paintWallet(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final peek = 4 * ink.wave();
  canvas.drawRRect(_box(44, 34 - peek, 80, 62 - peek, 6), ink.fill(p.accent));
  ink
    ..line(
      canvas,
      Offset(50, 42 - peek),
      Offset(64, 42 - peek),
      color: p.onAccent,
      width: 3,
    )
    ..body(canvas, Path()..addRRect(_box(32, 48, 86, 88, 10)))
    ..body(canvas, Path()..addRRect(_box(64, 60, 90, 76, 6)));
  canvas.drawCircle(const Offset(72, 68), 3, ink.fill(p.accent));
}
