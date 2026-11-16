import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palettes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';

/// Corner radii for one Sorbet radius option (`radius` in
/// `sorbet-tokens.json`; the soft option carries the token values).
@immutable
class SorbetRadii {
  const SorbetRadii({
    required this.small,
    required this.control,
    required this.card,
    required this.panel,
    required this.popover,
    this.full = 9999,
  });

  factory SorbetRadii.of(SorbetRadius radius) => switch (radius) {
    SorbetRadius.soft => const SorbetRadii(
      small: 8,
      control: 12,
      card: 18,
      panel: 24,
      popover: 18,
    ),
    SorbetRadius.sharp => const SorbetRadii(
      small: 4,
      control: 6,
      card: 8,
      panel: 12,
      popover: 6,
    ),
    SorbetRadius.round => const SorbetRadii(
      small: 12,
      control: 16,
      card: 24,
      panel: 32,
      popover: 20,
    ),
  };

  factory SorbetRadii.lerp(SorbetRadii a, SorbetRadii b, double t) =>
      SorbetRadii(
        small: lerpDouble(a.small, b.small, t)!,
        control: lerpDouble(a.control, b.control, t)!,
        card: lerpDouble(a.card, b.card, t)!,
        panel: lerpDouble(a.panel, b.panel, t)!,
        popover: lerpDouble(a.popover, b.popover, t)!,
        full: lerpDouble(a.full, b.full, t)!,
      );

  final double small;
  final double control;
  final double card;
  final double panel;
  final double popover;

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
  });

  final Duration instant;
  final Duration fast;
  final Duration base;
  final Duration slow;
  final Duration sheet;
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
}

/// Sorbet-only design tokens, carried by the Sorbet Material theme. Classic
/// themes do not carry it, so [maybeOf] returns null outside Sorbet.
@immutable
class SorbetTokens extends ThemeExtension<SorbetTokens> {
  const SorbetTokens({
    required this.hues,
    required this.ground,
    required this.background,
    required this.surface,
    required this.ring,
    required this.scrim,
    required this.hover,
    required this.radii,
    required this.controls,
    this.space = defaultSpace,
    this.motion = const SorbetMotion(),
    this.metrics = const SorbetMetrics(),
  });

  /// Tokens for [theme] in [brightness]; [ring] is the resolved focus ring,
  /// which follows a custom accent.
  factory SorbetTokens.resolve(
    SorbetTheme theme,
    Brightness brightness, {
    required Color ring,
  }) {
    final roles = SorbetPalettes.roles(theme.preset, brightness);
    return SorbetTokens(
      hues: SorbetPalettes.hues(theme.preset, brightness),
      ground: roles.ground,
      background: roles.background,
      surface: roles.surface,
      ring: ring,
      scrim: roles.scrim,
      hover: roles.hover,
      radii: SorbetRadii.of(theme.radius),
      controls: SorbetControlSizes.of(theme.density),
    );
  }

  /// Spacing scale (`space`), smallest first.
  static const defaultSpace = <double>[2, 4, 6, 8, 12, 16, 20, 24, 32, 48];

  static SorbetTokens? maybeOf(BuildContext context) =>
      Theme.of(context).extension<SorbetTokens>();

  /// Status hues: pastel fills and their inks.
  final SorbetHues hues;
  final Color ground;
  final Color background;

  /// Cards and popovers.
  final Color surface;
  final Color ring;
  final Color scrim;
  final Color hover;
  final SorbetRadii radii;
  final SorbetControlSizes controls;
  final List<double> space;
  final SorbetMotion motion;
  final SorbetMetrics metrics;

  @override
  SorbetTokens copyWith({
    SorbetHues? hues,
    Color? ground,
    Color? background,
    Color? surface,
    Color? ring,
    Color? scrim,
    Color? hover,
    SorbetRadii? radii,
    SorbetControlSizes? controls,
    List<double>? space,
    SorbetMotion? motion,
    SorbetMetrics? metrics,
  }) => SorbetTokens(
    hues: hues ?? this.hues,
    ground: ground ?? this.ground,
    background: background ?? this.background,
    surface: surface ?? this.surface,
    ring: ring ?? this.ring,
    scrim: scrim ?? this.scrim,
    hover: hover ?? this.hover,
    radii: radii ?? this.radii,
    controls: controls ?? this.controls,
    space: space ?? this.space,
    motion: motion ?? this.motion,
    metrics: metrics ?? this.metrics,
  );

  // Colours and radii interpolate; discrete scales switch at the midpoint.
  @override
  SorbetTokens lerp(SorbetTokens? other, double t) {
    if (other == null) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    final near = t < 0.5 ? this : other;
    return SorbetTokens(
      hues: SorbetHues.lerp(hues, other.hues, t),
      ground: mix(ground, other.ground),
      background: mix(background, other.background),
      surface: mix(surface, other.surface),
      ring: mix(ring, other.ring),
      scrim: mix(scrim, other.scrim),
      hover: mix(hover, other.hover),
      radii: SorbetRadii.lerp(radii, other.radii, t),
      controls: near.controls,
      space: near.space,
      motion: near.motion,
      metrics: near.metrics,
    );
  }
}
