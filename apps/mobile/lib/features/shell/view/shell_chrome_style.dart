import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';

/// Colour, depth and shape roles of the shell chrome (top bar, dock, rail and
/// shell rows), resolved from the active theme tokens. Sheets take their
/// surface, radius and handle from `AppSheetSurface`.
///
/// Classic and Sorbet share one layout; only these roles differ. Sorbet reads
/// its contract roles and soft shadows, classic maps the same roles onto the
/// zinc tokens and draws a 1px outline where Sorbet casts a shadow.
@immutable
class ShellChromeStyle {
  const ShellChromeStyle({
    required this.page,
    required this.surface,
    required this.dockSurface,
    required this.navSelectedFill,
    required this.navSelectedInk,
    required this.skeleton,
    required this.accent,
    required this.foreground,
    required this.mutedForeground,
    required this.border,
    required this.borderStrong,
    required this.primary,
    required this.primaryForeground,
    required this.scrim,
    required this.alert,
    required this.unread,
    required this.selected,
    required this.raisedShadow,
    required this.floatingShadow,
    required this.floatingOutline,
    required this.cardRadius,
    required this.rowRadius,
    required this.tileRadius,
    required this.fast,
    required this.base,
  });

  factory ShellChromeStyle.of(BuildContext context) {
    final theme = Theme.of(context);
    final colors =
        theme.extension<AppColorTokens>() ??
        AppColorTokens.fallback(theme.brightness);
    final sorbet = SorbetTokens.maybeOf(context);
    final dark = colors.isDark;
    final ink = colors.foreground;
    return ShellChromeStyle(
      page: sorbet?.background ?? colors.background,
      surface: sorbet?.surface ?? colors.card,
      dockSurface: sorbet?.dockSurface ?? colors.card,
      navSelectedFill: sorbet?.navSelectedFill ?? colors.accent,
      navSelectedInk: sorbet?.navSelectedInk ?? colors.foreground,
      skeleton: sorbet?.skeleton ?? colors.muted,
      accent: colors.accent,
      foreground: ink,
      mutedForeground: colors.mutedForeground,
      border: colors.border,
      borderStrong: colors.input,
      primary: colors.primary,
      primaryForeground: colors.primaryForeground,
      scrim:
          sorbet?.scrim ??
          (dark ? const Color(0x99000000) : ink.withValues(alpha: 0.32)),
      alert: sorbet?.hues.red.ink ?? colors.destructive,
      unread: sorbet?.hues.blue.ink ?? colors.info,
      selected: sorbet?.hues.green.ink ?? colors.success,
      // Cards use `shadow.md` from the Sorbet contract.
      raisedShadow: sorbet == null
          ? const []
          : [
              BoxShadow(
                color: dark
                    ? const Color(0xB3000000)
                    : ink.withValues(alpha: 0.35),
                offset: const Offset(0, 10),
                blurRadius: 30,
                spreadRadius: -18,
              ),
            ],
      // The dock's shadow falls below the pill: inset by its spread and
      // pushed down past its blur, so none of it reaches the content above.
      floatingShadow: sorbet == null
          ? const []
          : [
              BoxShadow(
                color: dark
                    ? const Color(0x99000000)
                    : ink.withValues(alpha: 0.22),
                offset: const Offset(0, 12),
                blurRadius: 24,
                spreadRadius: -10,
              ),
            ],
      // Sorbet pairs the shadow with a 5% ink hairline; classic has no
      // shadow, so its outline carries the edge on its own.
      floatingOutline: sorbet == null
          ? colors.border
          : ink.withValues(alpha: ShellDockMetrics.dockHairlineOpacity),
      cardRadius: sorbet?.radii.card ?? 14,
      rowRadius: sorbet?.radii.control ?? 10,
      tileRadius: sorbet == null ? 10 : 14,
      fast: sorbet?.motion.fast ?? const Duration(milliseconds: 120),
      base: sorbet?.motion.base ?? const Duration(milliseconds: 180),
    );
  }

  /// Page background of every shell destination, the top bar, the fade
  /// behind the dock and the bell dot's ring (`background`). `ground` matches
  /// the sunken fills in Sorbet light, so filled controls would vanish on it.
  final Color page;

  /// Cards.
  final Color surface;

  /// The floating dock and the rail (`roles.dockSurface`).
  final Color dockSurface;

  /// Selected dock items, rail destinations and tabs (`roles.navSelectedFill`
  /// and `roles.navSelectedInk`).
  final Color navSelectedFill;
  final Color navSelectedInk;

  /// Loading placeholders (`roles.skeleton`).
  final Color skeleton;

  /// Active dock items, selected rows and the Back button.
  final Color accent;
  final Color foreground;
  final Color mutedForeground;
  final Color border;
  final Color borderStrong;
  final Color primary;
  final Color primaryForeground;

  /// Veil behind sheets.
  final Color scrim;

  /// The bell's unread dot.
  final Color alert;

  /// Unread notification markers.
  final Color unread;

  /// The selected workspace check.
  final Color selected;

  /// Cards (`shadow.md`); empty in classic.
  final List<BoxShadow> raisedShadow;

  /// The dock, offset below the pill; empty in classic.
  final List<BoxShadow> floatingShadow;

  /// Edge of floating surfaces: an ink hairline or the classic outline.
  final Color floatingOutline;
  final double cardRadius;
  final double rowRadius;

  /// App and notification icon tiles.
  final double tileRadius;

  /// Colour and hover changes.
  final Duration fast;

  /// Presses, toggles and slot changes.
  final Duration base;

  /// Card edge: Sorbet separates cards by shadow, classic by an outline.
  Border? get cardOutline =>
      raisedShadow.isEmpty ? Border.all(color: border) : null;

  Duration motion(BuildContext context, Duration duration) =>
      MediaQuery.disableAnimationsOf(context) ? Duration.zero : duration;

  /// The curve every dock control and slot change shares.
  static const Curve dockCurve = Curves.easeOutCubic;

  /// The duration every dock control and slot change shares: [base], or zero
  /// under reduced motion.
  Duration dockMotion(BuildContext context) => motion(context, base);
}
