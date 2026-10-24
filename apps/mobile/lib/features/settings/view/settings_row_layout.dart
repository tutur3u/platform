import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Settings row geometry, expressed in the design foundation's tokens.
abstract final class SettingsRowLayout {
  /// Horizontal padding inside a grouped card.
  static const double inset = AppLayout.rowHorizontalPadding;
  static const double iconWidth = 24;
  static const double textGap = 14;
  static const double actionWidth = 44;
  static const double minHeight = AppLayout.rowMinHeight;

  /// Captions sit just inside the card edge.
  static const double captionInset = 4;
  static const double cardRadius = 24;
  static const double groupGap = AppLayout.sectionGap;

  /// Inset dividers align with the title column, not the icon.
  static const double textColumn = inset + iconWidth + textGap;

  /// Page padding for settings lists: the foundation's page top gap, and the
  /// shell's dock clearance (published as `MediaQuery.padding.bottom`) plus
  /// the standard scroll end gap, so the last row always clears the dock.
  static EdgeInsets scrollPadding(BuildContext context, double horizontal) =>
      EdgeInsets.fromLTRB(
        horizontal,
        AppLayout.pageTop,
        horizontal,
        MediaQuery.paddingOf(context).bottom + AppLayout.scrollEndGap,
      );

  /// Single-line width of [text] as rendered here: the inherited text style
  /// (font family) merged with [style], at the current text scale.
  static double textWidth(BuildContext context, String text, TextStyle style) {
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: DefaultTextStyle.of(context).style.merge(style),
      ),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
      maxLines: 1,
    )..layout();
    final width = painter.width;
    painter.dispose();
    return width;
  }

  /// Fill for grouped settings cards. Solid pages use the theme card (white
  /// over the grouped page in light themes); ambient pages get the
  /// translucent appearance card.
  static Color groupFill(BuildContext context) {
    final scheme = shad.Theme.of(context).colorScheme;
    if (AppearanceScope.hasAmbientBackground(context)) {
      return AppearanceScope.surfaceColor(context, scheme.card);
    }
    return solidGroupFill(scheme);
  }

  /// The theme card, or a quiet tonal lift when the card matches the page.
  static Color solidGroupFill(shad.ColorScheme scheme) =>
      scheme.card != scheme.background
      ? scheme.card
      : Color.lerp(
          scheme.background,
          scheme.foreground,
          scheme.brightness == Brightness.dark ? 0.08 : 0.04,
        )!;
}
