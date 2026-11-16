import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';

/// Corner radii for one Sorbet corner option (`radius.corners.<option>` in
/// `sorbet-tokens.json`). Field names map to the contract keys: [small] is
/// `sm`, [control] is `md`, [card] is `lg`, [panel] is `xl`, [interactive]
/// is `control`, and [sheet] and [popover] keep their names.
@immutable
class SorbetRadii {
  const SorbetRadii({
    required this.small,
    required this.control,
    required this.card,
    required this.panel,
    required this.popover,
    required this.interactive,
    required this.sheet,
    this.full = 9999,
  });

  factory SorbetRadii.of(SorbetRadius radius) => switch (radius) {
    SorbetRadius.soft => const SorbetRadii(
      small: 8,
      control: 12,
      card: 18,
      panel: 24,
      popover: 18,
      interactive: 9999,
      sheet: 24,
    ),
    SorbetRadius.sharp => const SorbetRadii(
      small: 4,
      control: 6,
      card: 10,
      panel: 12,
      popover: 6,
      interactive: 8,
      sheet: 12,
    ),
    SorbetRadius.round => const SorbetRadii(
      small: 10,
      control: 16,
      card: 24,
      panel: 32,
      popover: 20,
      interactive: 9999,
      sheet: 28,
    ),
  };

  factory SorbetRadii.lerp(SorbetRadii a, SorbetRadii b, double t) =>
      SorbetRadii(
        small: lerpDouble(a.small, b.small, t)!,
        control: lerpDouble(a.control, b.control, t)!,
        card: lerpDouble(a.card, b.card, t)!,
        panel: lerpDouble(a.panel, b.panel, t)!,
        popover: lerpDouble(a.popover, b.popover, t)!,
        interactive: lerpDouble(a.interactive, b.interactive, t)!,
        sheet: lerpDouble(a.sheet, b.sheet, t)!,
        full: lerpDouble(a.full, b.full, t)!,
      );

  final double small;

  /// Rows, event blocks and tiles (`md`).
  final double control;

  /// Cards (`lg`).
  final double card;

  /// Panels (`xl`).
  final double panel;
  final double popover;

  /// Buttons, inputs, chips and badges: a pill, or small corners under the
  /// sharp option.
  final double interactive;

  /// Top corners of bottom sheets.
  final double sheet;

  /// Pills and circles.
  final double full;
}

/// Control heights for one density (`control.<density>`).
@immutable
class SorbetControlSizes {
  const SorbetControlSizes({
    required this.xs,
    required this.sm,
    required this.md,
    required this.lg,
  });

  factory SorbetControlSizes.of(SorbetDensity density) => switch (density) {
    SorbetDensity.comfortable => const SorbetControlSizes(
      xs: 28,
      sm: 32,
      md: 38,
      lg: 44,
    ),
    SorbetDensity.compact => const SorbetControlSizes(
      xs: 24,
      sm: 28,
      md: 32,
      lg: 40,
    ),
    SorbetDensity.spacious => const SorbetControlSizes(
      xs: 32,
      sm: 36,
      md: 44,
      lg: 48,
    ),
  };

  final double xs;
  final double sm;
  final double md;
  final double lg;
}

/// Motion durations (`motion.duration`).
@immutable
class SorbetMotion {
  const SorbetMotion({
    this.instant = const Duration(milliseconds: 80),
    this.fast = const Duration(milliseconds: 120),
    this.base = const Duration(milliseconds: 180),
    this.slow = const Duration(milliseconds: 280),
    this.sheet = const Duration(milliseconds: 320),
    this.skeletonPulse = const Duration(milliseconds: 1400),
  });

  final Duration instant;
  final Duration fast;
  final Duration base;
  final Duration slow;
  final Duration sheet;

  /// One skeleton pulse cycle (`motion.skeleton.pulse`). Under reduced motion
  /// skeletons stay static.
  final Duration skeletonPulse;
}

/// Focus ring geometry (`focus`).
@immutable
class SorbetFocusRing {
  const SorbetFocusRing({
    this.width = 2,
    this.offset = 2,
    this.highContrastWidth = 3,
  });

  final double width;

  /// Gap between the control edge and the ring.
  final double offset;

  /// Ring width while the platform asks for high contrast.
  final double highContrastWidth;
}

/// Which variant of a hue a surface paints (`roles.eventFill`,
/// `roles.tagFill`).
enum SorbetHueTone {
  /// The vibrant default fill.
  fill,

  /// The softer twin.
  calm,
}

/// Shadow recipes (`shadow.<mode>`): [sm] on chips and selected segments,
/// [md] on cards and panels, [lg] on the dock, sheets and toasts.
@immutable
class SorbetShadows {
  const SorbetShadows({required this.sm, required this.md, required this.lg});

  factory SorbetShadows.of(Brightness brightness) =>
      brightness == Brightness.dark ? dark : light;

  factory SorbetShadows.lerp(SorbetShadows a, SorbetShadows b, double t) =>
      SorbetShadows(
        sm: BoxShadow.lerpList(a.sm, b.sm, t)!,
        md: BoxShadow.lerpList(a.md, b.md, t)!,
        lg: BoxShadow.lerpList(a.lg, b.lg, t)!,
      );

  static const light = SorbetShadows(
    sm: [
      BoxShadow(color: Color(0x0F26212B), offset: Offset(0, 1), blurRadius: 2),
      BoxShadow(
        color: Color(0x1F26212B),
        offset: Offset(0, 2),
        blurRadius: 8,
        spreadRadius: -4,
      ),
    ],
    md: [
      BoxShadow(
        color: Color(0x5926212B),
        offset: Offset(0, 10),
        blurRadius: 30,
        spreadRadius: -18,
      ),
    ],
    lg: [
      BoxShadow(
        color: Color(0x5926212B),
        offset: Offset(0, 24),
        blurRadius: 48,
        spreadRadius: -24,
      ),
    ],
  );

  static const dark = SorbetShadows(
    sm: [
      BoxShadow(color: Color(0x66000000), offset: Offset(0, 1), blurRadius: 2),
    ],
    md: [
      BoxShadow(
        color: Color(0xB3000000),
        offset: Offset(0, 10),
        blurRadius: 30,
        spreadRadius: -18,
      ),
    ],
    lg: [
      BoxShadow(
        color: Color(0xCC000000),
        offset: Offset(0, 24),
        blurRadius: 48,
        spreadRadius: -24,
      ),
    ],
  );

  final List<BoxShadow> sm;
  final List<BoxShadow> md;
  final List<BoxShadow> lg;
}

/// Fixed mobile metrics (`mobile`).
@immutable
class SorbetMetrics {
  const SorbetMetrics({
    this.touchTarget = 44,
    this.inputFontSize = 16,
    this.gutter = 16,
    this.headerHeight = 56,
    this.dockHeight = 64,
    this.dockInset = 12,
    this.dockRadius = 9999,
    this.sheetRadius = 24,
    this.sheetHandle = const Size(36, 4),
    this.listRowMinHeight = 52,
    this.breakpoint = 640,
    this.tabletBreakpoint = 768,
    this.tabletGutter = 24,
    this.dockMaxWidth = 480,
    this.dockHairlineOpacity = 0.05,
    this.dockFadeHeight = 12,
    this.dockBlur = 0,
  });

  final double touchTarget;
  final double inputFontSize;
  final double gutter;
  final double headerHeight;
  final double dockHeight;
  final double dockInset;
  final double dockRadius;
  final double sheetRadius;
  final Size sheetHandle;
  final double listRowMinHeight;

  /// From this width, layouts use two columns or master-detail.
  final double breakpoint;

  /// From this width, the tablet chrome applies.
  final double tabletBreakpoint;

  /// Horizontal screen padding on tablets.
  final double tabletGutter;

  /// The dock never grows wider than this.
  final double dockMaxWidth;

  /// Opacity of the dock's hairline edge.
  final double dockHairlineOpacity;

  /// Height of the fade above the dock.
  final double dockFadeHeight;

  /// Backdrop blur behind the dock; 0 paints it solid.
  final double dockBlur;
}
