import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Bordered content surface. Replaces `shad.Card` and `shad.SurfaceCard`
/// (`elevated: true`). For settings-style rows use `AppGroupedCard`.
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
    final radius = borderRadius ?? tokens.interface.borderRadius(AppRadius.md);
    final solid = MediaQuery.highContrastOf(context);
    Widget content = Padding(padding: padding, child: child);
    if (onTap != null) {
      content = InkWell(onTap: onTap, borderRadius: radius, child: content);
    }
    return Semantics(
      container: true,
      button: onTap != null,
      label: semanticLabel,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: radius,
          border: Border.all(
            color: borderColor ?? c.border.withValues(alpha: solid ? 1 : 0.8),
          ),
          boxShadow: elevated ? AppElevation.raised(c) : null,
        ),
        child: Material(
          color: fillColor ?? c.card,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: DefaultTextStyle.merge(
            style: TextStyle(color: c.cardForeground),
            child: content,
          ),
        ),
      ),
    );
  }
}
