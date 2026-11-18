import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_shapes.dart';
import 'package:mobile/core/ui/tokens/app_typography.dart';

export 'package:mobile/core/ui/tokens/app_shapes.dart';

/// Elevation recipes. Mobile surfaces are mostly flat; shadows are reserved
/// for floating layers.
abstract final class AppElevation {
  static const List<BoxShadow> none = [];

  /// Raised cards and pressed tiles.
  static List<BoxShadow> raised(AppColorTokens colors) => [
    BoxShadow(
      color: const Color(
        0xFF000000,
      ).withValues(alpha: colors.isDark ? 0.3 : 0.06),
      blurRadius: 12,
      offset: const Offset(0, 4),
    ),
  ];

  /// Sheets, dialogs, toasts and other overlays.
  static List<BoxShadow> overlay(AppColorTokens colors) => [
    BoxShadow(
      color: const Color(
        0xFF000000,
      ).withValues(alpha: colors.isDark ? 0.45 : 0.16),
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
/// same `colorScheme` and `typography` member names plus radius, spacing,
/// shapes and depth. Colours come from the appearance theme's
/// [AppColorTokens] extension, falling back to Classic for the ambient
/// brightness. A Sorbet theme ([SorbetTokens]) supplies its typography,
/// shapes and depth; every other theme gets the classic ones.
@immutable
class AppTokens {
  const AppTokens._(
    this.colorScheme,
    this.typography,
    this.interface,
    this.shapes,
    this.depth,
    this._sorbet,
  );

  factory AppTokens.of(BuildContext context) {
    final theme = Theme.of(context);
    final colors =
        theme.extension<AppColorTokens>() ??
        AppColorTokens.fallback(theme.brightness);
    final interface =
        theme.extension<AppInterfaceTokens>() ?? AppInterfaceTokens.standard;
    final sorbet = theme.extension<SorbetTokens>();
    if (sorbet == null) {
      return AppTokens._(
        colors,
        _typography,
        interface,
        AppShapes.classic(interface, colors),
        AppDepth.classic(colors),
        null,
      );
    }
    return AppTokens._(
      colors,
      sorbet.typography,
      interface,
      AppShapes.sorbet(sorbet, colors),
      AppDepth.sorbet(sorbet),
      sorbet,
    );
  }

  static const _typography = AppTypography();

  final AppColorTokens colorScheme;
  final AppTypography typography;

  /// Control and surface corners, the sheet handle and field metrics.
  final AppShapes shapes;

  /// Shadows and outlines.
  final AppDepth depth;
  final SorbetTokens? _sorbet;

  ({Color fill, Color ink}) get infoTone {
    final tone = _sorbet?.hues.blue;
    return (
      fill:
          tone?.fill ?? colorScheme.info.withValues(alpha: isDark ? 0.2 : 0.12),
      ink: tone?.ink ?? colorScheme.info,
    );
  }

  ({Color fill, Color ink}) get selectionTone => (
    fill: _sorbet?.navSelectedFill ?? colorScheme.accent,
    ink: _sorbet?.navSelectedInk ?? colorScheme.accentForeground,
  );

  /// Style, density and corner choices from Appearance.
  final AppInterfaceTokens interface;

  Brightness get brightness => colorScheme.brightness;
  bool get isDark => colorScheme.isDark;

  // Radius aliases match the legacy shadcn getter names and follow the
  // Appearance corner style.
  double get radiusSm => interface.radius(AppRadius.xs);
  double get radiusMd => interface.radius(10);
  double get radiusLg => interface.radius(AppRadius.sm);
  double get radiusXl => interface.radius(AppRadius.md);
  BorderRadius get borderRadiusSm => BorderRadius.circular(radiusSm);
  BorderRadius get borderRadiusMd => BorderRadius.circular(radiusMd);
  BorderRadius get borderRadiusLg => BorderRadius.circular(radiusLg);
  BorderRadius get borderRadiusXl => BorderRadius.circular(radiusXl);
}

extension AppTokensContext on BuildContext {
  /// Shorthand for [AppTokens.of].
  AppTokens get tokens => AppTokens.of(this);
}
