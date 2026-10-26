import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Token-based row for actions, metadata and trailing controls.
class AppListTile extends StatelessWidget {
  const AppListTile({
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    this.enabled = true,
    this.selected = false,
    this.contentPadding = const EdgeInsets.symmetric(
      horizontal: AppSpacing.md,
      vertical: AppSpacing.sm,
    ),
    super.key,
  });
  final Widget title;
  final Widget? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool enabled;
  final bool selected;
  final EdgeInsetsGeometry contentPadding;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final body = Padding(
      padding: contentPadding,
      child: Row(
        children: [
          if (leading != null) ...[
            IconTheme.merge(
              data: IconThemeData(color: c.mutedForeground, size: 20),
              child: leading!,
            ),
            const SizedBox(width: AppSpacing.md),
          ],
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DefaultTextStyle.merge(
                  style: tokens.typography.base.copyWith(color: c.foreground),
                  child: title,
                ),
                if (subtitle != null)
                  DefaultTextStyle.merge(
                    style: tokens.typography.small.copyWith(
                      color: c.mutedForeground,
                    ),
                    child: subtitle!,
                  ),
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: AppSpacing.sm),
            IconTheme.merge(
              data: IconThemeData(color: c.mutedForeground, size: 20),
              child: trailing!,
            ),
          ],
        ],
      ),
    );
    return Semantics(
      selected: selected,
      enabled: enabled,
      button: onTap != null,
      child: onTap == null
          ? body
          : AppControlTarget(onTap: enabled ? onTap : null, child: body),
    );
  }
}
