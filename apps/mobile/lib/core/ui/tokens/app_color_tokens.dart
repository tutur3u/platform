import 'package:flutter/material.dart';
import 'package:mobile/core/theme/colors.dart';

/// Semantic colour roles of the mobile design system.
///
/// Role names deliberately match the legacy shadcn colour scheme so a
/// migration is a rename (`shad.Theme.of(context).colorScheme.mutedForeground`
/// becomes `AppTokens.of(context).colorScheme.mutedForeground`). The appearance
/// theme publishes the resolved roles as a [ThemeExtension]; see
/// `AppearanceTheme.materialTheme`.
@immutable
class AppColorTokens extends ThemeExtension<AppColorTokens> {
  const AppColorTokens({
    required this.brightness,
    required this.background,
    required this.foreground,
    required this.card,
    required this.cardForeground,
    required this.popover,
    required this.popoverForeground,
    required this.primary,
    required this.primaryForeground,
    required this.secondary,
    required this.secondaryForeground,
    required this.muted,
    required this.mutedForeground,
    required this.accent,
    required this.accentForeground,
    required this.destructive,
    required this.destructiveForeground,
    required this.border,
    required this.input,
    required this.ring,
    required this.success,
    required this.warning,
    required this.info,
  });

  /// Classic light (zinc) roles, used before an appearance resolves.
  static const light = AppColorTokens(
    brightness: Brightness.light,
    background: Color(0xFFFFFFFF),
    foreground: Color(0xFF09090B),
    card: Color(0xFFFFFFFF),
    cardForeground: Color(0xFF09090B),
    popover: Color(0xFFFFFFFF),
    popoverForeground: Color(0xFF09090B),
    primary: Color(0xFF18181B),
    primaryForeground: Color(0xFFFAFAFA),
    secondary: Color(0xFFF4F4F5),
    secondaryForeground: Color(0xFF18181B),
    muted: Color(0xFFF4F4F5),
    mutedForeground: Color(0xFF71717A),
    accent: Color(0xFFF4F4F5),
    accentForeground: Color(0xFF18181B),
    destructive: AppColors.destructiveLight,
    destructiveForeground: Color(0xFFFAFAFA),
    border: Color(0xFFE4E4E7),
    input: Color(0xFFE4E4E7),
    ring: Color(0xFF09090B),
    success: Color(0xFF15803D),
    warning: Color(0xFFB45309),
    info: Color(0xFF1D4ED8),
  );

  /// Classic dark (zinc) roles, used before an appearance resolves.
  static const dark = AppColorTokens(
    brightness: Brightness.dark,
    background: Color(0xFF09090B),
    foreground: Color(0xFFFAFAFA),
    card: Color(0xFF09090B),
    cardForeground: Color(0xFFFAFAFA),
    popover: Color(0xFF09090B),
    popoverForeground: Color(0xFFFAFAFA),
    primary: Color(0xFFFAFAFA),
    primaryForeground: Color(0xFF18181B),
    secondary: Color(0xFF27272A),
    secondaryForeground: Color(0xFFFAFAFA),
    muted: Color(0xFF27272A),
    mutedForeground: Color(0xFFA1A1AA),
    accent: Color(0xFF27272A),
    accentForeground: Color(0xFFFAFAFA),
    destructive: AppColors.destructiveDark,
    destructiveForeground: Color(0xFFFAFAFA),
    border: Color(0xFF27272A),
    input: Color(0xFF27272A),
    ring: Color(0xFFD4D4D8),
    success: Color(0xFF4ADE80),
    warning: Color(0xFFFBBF24),
    info: Color(0xFF60A5FA),
  );

  static AppColorTokens fallback(Brightness brightness) =>
      brightness == Brightness.dark ? dark : light;

  final Brightness brightness;
  final Color background;
  final Color foreground;
  final Color card;
  final Color cardForeground;
  final Color popover;
  final Color popoverForeground;
  final Color primary;
  final Color primaryForeground;
  final Color secondary;
  final Color secondaryForeground;
  final Color muted;
  final Color mutedForeground;
  final Color accent;
  final Color accentForeground;
  final Color destructive;
  final Color destructiveForeground;
  final Color border;
  final Color input;
  final Color ring;
  final Color success;
  final Color warning;
  final Color info;

  bool get isDark => brightness == Brightness.dark;

  @override
  AppColorTokens copyWith({
    Color? background,
    Color? foreground,
    Color? card,
    Color? cardForeground,
    Color? popover,
    Color? popoverForeground,
    Color? primary,
    Color? primaryForeground,
    Color? secondary,
    Color? secondaryForeground,
    Color? muted,
    Color? mutedForeground,
    Color? accent,
    Color? accentForeground,
    Color? destructive,
    Color? destructiveForeground,
    Color? border,
    Color? input,
    Color? ring,
    Color? success,
    Color? warning,
    Color? info,
  }) => AppColorTokens(
    brightness: brightness,
    background: background ?? this.background,
    foreground: foreground ?? this.foreground,
    card: card ?? this.card,
    cardForeground: cardForeground ?? this.cardForeground,
    popover: popover ?? this.popover,
    popoverForeground: popoverForeground ?? this.popoverForeground,
    primary: primary ?? this.primary,
    primaryForeground: primaryForeground ?? this.primaryForeground,
    secondary: secondary ?? this.secondary,
    secondaryForeground: secondaryForeground ?? this.secondaryForeground,
    muted: muted ?? this.muted,
    mutedForeground: mutedForeground ?? this.mutedForeground,
    accent: accent ?? this.accent,
    accentForeground: accentForeground ?? this.accentForeground,
    destructive: destructive ?? this.destructive,
    destructiveForeground: destructiveForeground ?? this.destructiveForeground,
    border: border ?? this.border,
    input: input ?? this.input,
    ring: ring ?? this.ring,
    success: success ?? this.success,
    warning: warning ?? this.warning,
    info: info ?? this.info,
  );

  @override
  AppColorTokens lerp(AppColorTokens? other, double t) {
    if (other == null) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColorTokens(
      brightness: t < 0.5 ? brightness : other.brightness,
      background: mix(background, other.background),
      foreground: mix(foreground, other.foreground),
      card: mix(card, other.card),
      cardForeground: mix(cardForeground, other.cardForeground),
      popover: mix(popover, other.popover),
      popoverForeground: mix(popoverForeground, other.popoverForeground),
      primary: mix(primary, other.primary),
      primaryForeground: mix(primaryForeground, other.primaryForeground),
      secondary: mix(secondary, other.secondary),
      secondaryForeground: mix(secondaryForeground, other.secondaryForeground),
      muted: mix(muted, other.muted),
      mutedForeground: mix(mutedForeground, other.mutedForeground),
      accent: mix(accent, other.accent),
      accentForeground: mix(accentForeground, other.accentForeground),
      destructive: mix(destructive, other.destructive),
      destructiveForeground: mix(
        destructiveForeground,
        other.destructiveForeground,
      ),
      border: mix(border, other.border),
      input: mix(input, other.input),
      ring: mix(ring, other.ring),
      success: mix(success, other.success),
      warning: mix(warning, other.warning),
      info: mix(info, other.info),
    );
  }
}
