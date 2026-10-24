import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

enum AppBadgeVariant {
  primary,
  secondary,
  outline,
  destructive,
  success,
  warning,
}

/// Compact status label. Replaces `shad.PrimaryBadge`, `shad.SecondaryBadge`,
/// `shad.OutlineBadge` and `shad.DestructiveBadge`.
class AppBadge extends StatelessWidget {
  const AppBadge({
    required this.child,
    this.variant = AppBadgeVariant.secondary,
    this.leading,
    super.key,
  });

  const AppBadge.outline({required this.child, this.leading, super.key})
    : variant = AppBadgeVariant.outline;

  final Widget child;
  final AppBadgeVariant variant;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    Color tint(Color color) => color.withValues(alpha: c.isDark ? 0.2 : 0.12);
    final (Color? fill, Color foreground, Color? border) = switch (variant) {
      AppBadgeVariant.primary => (c.primary, c.primaryForeground, null),
      AppBadgeVariant.secondary => (c.secondary, c.secondaryForeground, null),
      AppBadgeVariant.outline => (null, c.foreground, c.border),
      AppBadgeVariant.destructive => (tint(c.destructive), c.destructive, null),
      AppBadgeVariant.success => (tint(c.success), c.success, null),
      AppBadgeVariant.warning => (tint(c.warning), c.warning, null),
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(999),
        border: border == null ? null : Border.all(color: border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: IconTheme.merge(
          data: IconThemeData(color: foreground, size: 12),
          child: DefaultTextStyle.merge(
            style: tokens.typography.label.copyWith(color: foreground),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (leading != null) ...[leading!, const SizedBox(width: 4)],
                Flexible(child: child),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
