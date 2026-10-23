import 'package:flutter/widgets.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

abstract final class SettingsRowLayout {
  /// Horizontal padding inside a grouped card.
  static const double inset = 16;
  static const double iconWidth = 24;
  static const double textGap = 14;
  static const double actionWidth = 44;
  static const double minHeight = 56;

  /// Captions sit just inside the card edge.
  static const double captionInset = 4;
  static const double cardRadius = 24;
  static const double groupGap = 24;

  /// Inset dividers align with the title column, not the icon.
  static const double textColumn = inset + iconWidth + textGap;

  static EdgeInsets scrollPadding(BuildContext context, double horizontal) =>
      EdgeInsets.fromLTRB(
        horizontal,
        10,
        horizontal,
        32 + MediaQuery.paddingOf(context).bottom,
      );

  /// Fill for grouped settings cards. Solid pages get a quiet tonal step that
  /// keeps muted text AA; ambient pages get the translucent appearance card.
  static Color groupFill(BuildContext context) {
    final scheme = shad.Theme.of(context).colorScheme;
    if (AppearanceScope.hasAmbientBackground(context)) {
      return AppearanceScope.surfaceColor(context, scheme.card);
    }
    return solidGroupFill(scheme);
  }

  static Color solidGroupFill(shad.ColorScheme scheme) => Color.lerp(
    scheme.background,
    scheme.foreground,
    scheme.brightness == Brightness.dark ? 0.06 : 0.025,
  )!;
}
