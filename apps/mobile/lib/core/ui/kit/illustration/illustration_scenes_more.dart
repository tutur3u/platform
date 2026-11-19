import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_scenes.dart';

void paintSearch(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  for (var i = 0; i < 4; i++) {
    final y = 42.0 + i * 12;
    ink.line(canvas, Offset(30, y), Offset(i.isEven ? 86 : 74, y));
  }
  final angle = ink.t * 2 * math.pi;
  final lens = Offset(56 + 6 * math.sin(angle), 56 - 4 * math.cos(angle) + 4);
  const handle = Offset(14, 14);
  canvas
    ..drawLine(
      lens + const Offset(11, 11),
      lens + handle + const Offset(9, 9),
      ink.stroke(p.accent, 7),
    )
    ..drawCircle(lens, 15, ink.fill(p.surface.withValues(alpha: 0.92)))
    ..drawCircle(lens, 15, ink.stroke(p.accent, 4));
}

void paintOffline(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  canvas
    ..save()
    ..translate(3 * ink.wave(), 0);
  final cloud = Path.combine(
    PathOperation.union,
    Path.combine(
      PathOperation.union,
      Path()
        ..addOval(Rect.fromCircle(center: const Offset(48, 64), radius: 14)),
      Path()
        ..addOval(Rect.fromCircle(center: const Offset(64, 54), radius: 18)),
    ),
    Path.combine(
      PathOperation.union,
      Path()
        ..addOval(Rect.fromCircle(center: const Offset(78, 66), radius: 12)),
      Path()
        ..addRRect(RRect.fromLTRBR(36, 62, 88, 78, const Radius.circular(8))),
    ),
  );
  ink.body(canvas, cloud);
  canvas.restore();
  ink.line(
    canvas,
    const Offset(40, 40),
    const Offset(82, 88),
    color: p.accent,
    width: 5,
  );
}

void paintCalendar(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final page = RRect.fromLTRBR(34, 36, 86, 90, const Radius.circular(9));
  ink.body(canvas, Path()..addRRect(page));
  canvas
    ..save()
    ..clipRRect(page)
    ..drawRect(const Rect.fromLTRB(34, 36, 86, 49), ink.fill(p.accent))
    ..restore()
    ..drawRRect(page, ink.stroke(p.outline, 2.5));
  ink
    ..line(canvas, const Offset(47, 30), const Offset(47, 40), color: p.outline)
    ..line(
      canvas,
      const Offset(73, 30),
      const Offset(73, 40),
      color: p.outline,
    );
  for (var row = 0; row < 3; row++) {
    for (var col = 0; col < 4; col++) {
      final center = Offset(44 + col * 11.0, 59 + row * 10.0);
      final today = row == 1 && col == 2;
      if (today) {
        final pulse = 1 + 0.18 * ink.wave();
        canvas.drawCircle(center, 4.5 * pulse, ink.fill(p.accent));
      } else {
        canvas.drawCircle(center, 2.5, ink.fill(p.detail));
      }
    }
  }
}

void paintConversations(Canvas canvas, IllustrationInk ink) {
  final p = ink.palette;
  final back = Path()
    ..addRRect(RRect.fromLTRBR(28, 34, 74, 62, const Radius.circular(13)))
    ..moveTo(36, 60)
    ..lineTo(32, 70)
    ..lineTo(46, 61);
  ink
    ..body(canvas, back)
    ..line(canvas, const Offset(38, 44), const Offset(62, 44))
    ..line(canvas, const Offset(38, 53), const Offset(54, 53));
  final front = Path()
    ..addRRect(RRect.fromLTRBR(48, 66, 92, 90, const Radius.circular(12)))
    ..moveTo(82, 88)
    ..lineTo(88, 96)
    ..lineTo(74, 89);
  canvas.drawPath(front, ink.fill(p.accent));
  for (var i = 0; i < 3; i++) {
    final hop = math.max<double>(0, ink.wave(-i / 6)) * 3;
    canvas.drawCircle(Offset(60 + i * 10.0, 78 - hop), 3, ink.fill(p.onAccent));
  }
}
