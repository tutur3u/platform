import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/illustration/app_illustration.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_scenes.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_scenes_auth.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_scenes_onboarding.dart';

/// Paints an [AppIllustrationKind] in a 120-unit square scaled to the canvas.
///
/// [progress] runs from 0 to 1 over one loop; every motion is periodic, so the
/// first and last frames match and a finished loop rests on the first pose.
class AppIllustrationPainter extends CustomPainter {
  AppIllustrationPainter({
    required this.kind,
    required this.palette,
    required this.progress,
  }) : super(repaint: progress);

  final AppIllustrationKind kind;
  final AppIllustrationPalette palette;
  final Animation<double> progress;

  static const unit = 120.0;

  @override
  void paint(Canvas canvas, Size size) {
    if (kind.isAuthScene) {
      _paintAuthScene(canvas, size);
      return;
    }
    final scale = size.shortestSide / unit;
    canvas
      ..save()
      ..translate(
        (size.width - unit * scale) / 2,
        (size.height - unit * scale) / 2,
      )
      ..scale(scale);
    final ink = IllustrationInk(palette, progress.value);
    _backdrop(canvas, ink);
    switch (kind) {
      case AppIllustrationKind.notificationsClear:
        paintBell(canvas, ink);
      case AppIllustrationKind.noTasks:
        paintChecklist(canvas, ink);
      case AppIllustrationKind.noTransactions:
        paintReceipt(canvas, ink);
      case AppIllustrationKind.noBudgets:
        paintBudgetRing(canvas, ink);
      case AppIllustrationKind.wallet:
        paintWallet(canvas, ink);
      case AppIllustrationKind.searchNoResults:
        paintSearch(canvas, ink);
      case AppIllustrationKind.offline:
        paintOffline(canvas, ink);
      case AppIllustrationKind.calendarFree:
        paintCalendar(canvas, ink);
      case AppIllustrationKind.conversations:
        paintConversations(canvas, ink);
      case AppIllustrationKind.welcomeBowl ||
          AppIllustrationKind.emailCode ||
          AppIllustrationKind.twoStep ||
          AppIllustrationKind.passkey ||
          AppIllustrationKind.accounts ||
          AppIllustrationKind.locked ||
          AppIllustrationKind.profileCard ||
          AppIllustrationKind.spaceTiles ||
          AppIllustrationKind.interestScoops ||
          AppIllustrationKind.allSetBowl:
        break;
    }
    canvas.restore();
  }

  /// Fits the scene's view box inside the canvas, centred.
  void _paintAuthScene(Canvas canvas, Size size) {
    final box = kind == AppIllustrationKind.welcomeBowl
        ? welcomeBowlViewBox
        : authSceneViewBox;
    final scale = math.min(size.width / box.width, size.height / box.height);
    canvas
      ..save()
      ..translate(
        (size.width - box.width * scale) / 2,
        (size.height - box.height * scale) / 2,
      )
      ..scale(scale);
    final ink = IllustrationInk(palette, progress.value);
    switch (kind) {
      case AppIllustrationKind.welcomeBowl:
        paintWelcomeBowl(canvas, ink);
      case AppIllustrationKind.emailCode:
        paintEmailCode(canvas, ink);
      case AppIllustrationKind.twoStep:
        paintTwoStep(canvas, ink);
      case AppIllustrationKind.passkey:
        paintPasskey(canvas, ink);
      case AppIllustrationKind.accounts:
        paintAccounts(canvas, ink);
      case AppIllustrationKind.locked:
        paintLocked(canvas, ink);
      case AppIllustrationKind.profileCard:
        paintProfileCard(canvas, ink);
      case AppIllustrationKind.spaceTiles:
        paintSpaceTiles(canvas, ink);
      case AppIllustrationKind.interestScoops:
        paintInterestScoops(canvas, ink);
      case AppIllustrationKind.allSetBowl:
        paintAllSetBowl(canvas, ink);
      case AppIllustrationKind.notificationsClear ||
          AppIllustrationKind.noTasks ||
          AppIllustrationKind.noTransactions ||
          AppIllustrationKind.noBudgets ||
          AppIllustrationKind.wallet ||
          AppIllustrationKind.searchNoResults ||
          AppIllustrationKind.offline ||
          AppIllustrationKind.calendarFree ||
          AppIllustrationKind.conversations:
        break;
    }
    canvas.restore();
  }

  void _backdrop(Canvas canvas, IllustrationInk ink) {
    canvas.drawCircle(const Offset(60, 62), 48, ink.fill(palette.backdrop));
    // Two sparkles and a dot twinkle out of phase around the disc.
    const sparkles = [(Offset(18, 34), 0.0), (Offset(102, 26), 0.33)];
    for (final (center, phase) in sparkles) {
      final glow = 0.55 + 0.45 * ink.wave(phase);
      _sparkle(canvas, center, 3.5 + glow * 1.5, palette.accent, glow);
    }
    canvas.drawCircle(
      const Offset(100, 96),
      2.5,
      ink.fill(palette.accent.withValues(alpha: 0.35 + 0.3 * ink.wave(0.66))),
    );
  }

  void _sparkle(
    Canvas canvas,
    Offset center,
    double radius,
    Color color,
    double opacity,
  ) {
    final path = Path();
    for (var i = 0; i < 8; i++) {
      final angle = i * math.pi / 4 - math.pi / 2;
      final r = i.isEven ? radius : radius * 0.32;
      final point = center + Offset(math.cos(angle) * r, math.sin(angle) * r);
      if (i == 0) {
        path.moveTo(point.dx, point.dy);
      } else {
        path.lineTo(point.dx, point.dy);
      }
    }
    path.close();
    canvas.drawPath(
      path,
      Paint()..color = color.withValues(alpha: color.a * opacity),
    );
  }

  @override
  bool shouldRepaint(AppIllustrationPainter oldDelegate) =>
      oldDelegate.kind != kind ||
      oldDelegate.palette != palette ||
      oldDelegate.progress != progress;
}
