import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/tokens/app_typography.dart';

/// Elevation recipes. Mobile surfaces are mostly flat; shadows are reserved
/// for floating layers.
abstract final class AppElevation {
  static const List<BoxShadow> none = [];

  /// Raised cards and pressed tiles.
  static List<BoxShadow> raised(AppColorTokens colors) => [
    BoxShadow(
      color: const Color(0xFF000000)
          .withValues(alpha: colors.isDark ? 0.3 : 0.06),
      blurRadius: 12,
      offset: const Offset(0, 4),
    ),
  ];

  /// Sheets, dialogs, toasts and other overlays.
  static List<BoxShadow> overlay(AppColorTokens colors) => [
    BoxShadow(
      color: const Color(0xFF000000)
          .withValues(alpha: colors.isDark ? 0.45 : 0.16),
      blurRadius: 28,
      offset: const Offset(0, 12),
    ),
  ];
}

/// Motion durations shared by components.
abstract final class AppMotion {
  static const Duration fast = Duration(milliseconds: 120);
  static const Duration normal = Duration(milliseconds: 220);
  static const Duration slow = Duration(milliseconds: 320);
  static const Curve standard = Curves.easeOutCubic;
}

/// Resolved design tokens for a [BuildContext].
///
/// `AppTokens.of(context)` replaces `shad.Theme.of(context)`: it exposes the
/// same `colorScheme` and `typography` member names plus radius, spacing and
/// elevation. Colours come from the appearance theme's [AppColorTokens]
/// extension, falling back to Classic for the ambient brightness.
@immutable
class AppTokens {
  const AppTokens._(this.colorScheme, this.typography);

  factory AppTokens.of(BuildContext context) {
    final theme = Theme.of(context);
    final colors =
        theme.extension<AppColorTokens>() ??
        AppColorTokens.fallback(theme.brightness);
    return AppTokens._(colors, _typography);
  }

  static const _typography = AppTypography();

  final AppColorTokens colorScheme;
  final AppTypography typography;

  Brightness get brightness => colorScheme.brightness;
  bool get isDark => colorScheme.isDark;

  // Radius aliases match the legacy shadcn getter names.
  double get radiusSm => AppRadius.xs;
  double get radiusMd => 10;
  double get radiusLg => AppRadius.sm;
  double get radiusXl => AppRadius.md;
  BorderRadius get borderRadiusSm => BorderRadius.circular(radiusSm);
  BorderRadius get borderRadiusMd => BorderRadius.circular(radiusMd);
  BorderRadius get borderRadiusLg => BorderRadius.circular(radiusLg);
  BorderRadius get borderRadiusXl => BorderRadius.circular(radiusXl);
}

extension AppTokensContext on BuildContext {
  /// Shorthand for [AppTokens.of].
  AppTokens get tokens => AppTokens.of(this);
}
