import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Content surface: outlined in classic, separated by shadow in Sorbet (and
/// outlined there too under high contrast). Replaces `shad.Card` and
/// `shad.SurfaceCard` (`elevated: true`). For settings-style rows use
/// `AppGroupedCard`.
///
/// The outline is a foreground decoration over the filled [Material], so the
/// opaque fill and ink ripple never cover it. Under high contrast the theme
/// border is lifted to the WCAG non-text ratio against the fill, because the
/// dark border role sits close to the card and page surfaces.
class AppCard extends StatelessWidget {
  const AppCard({
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.onTap,
    this.fillColor,
    this.borderColor,
    this.borderRadius,
    this.elevated = false,
    this.semanticLabel,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? fillColor;
  final Color? borderColor;
  final BorderRadius? borderRadius;

  /// Adds the raised shadow used for floating cards.
  final bool elevated;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final radius = borderRadius ?? BorderRadius.circular(tokens.shapes.card);
    final solid = MediaQuery.highContrastOf(context);
    final depth = tokens.depth;
    final fill = fillColor ?? c.card;
    final outline =
        borderColor ??
        (solid
            ? AppearanceContrast.ensureContrast(
                c.border,
                against: fill,
                target: AppearanceContrast.aaNonText,
              )
            : depth.outlined
            ? c.border.withValues(alpha: 0.8)
            : null);
    Widget content = Padding(padding: padding, child: child);
    if (onTap != null) {
      content = InkWell(onTap: onTap, borderRadius: radius, child: content);
    }
    Widget surface = Material(
      color: fill,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: DefaultTextStyle.merge(
        style: TextStyle(color: c.cardForeground),
        child: content,
      ),
    );
    if (outline != null) {
      surface = DecoratedBox(
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          borderRadius: radius,
          border: Border.all(color: outline),
        ),
        child: surface,
      );
    }
    return Semantics(
      container: true,
      button: onTap != null,
      label: semanticLabel,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: radius,
          boxShadow: elevated ? depth.raised : depth.card,
        ),
        child: surface,
      ),
    );
  }
}
