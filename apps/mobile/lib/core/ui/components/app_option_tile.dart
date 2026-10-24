import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Selectable row for pickers: title, optional subtitle and trailing detail,
/// with a check mark when [selected]. Exposes selected/in-mutually-exclusive
/// group semantics so screen readers announce it as a choice.
class AppOptionTile extends StatelessWidget {
  const AppOptionTile({
    required this.title,
    required this.onTap,
    this.subtitle,
    this.detail,
    this.leading,
    this.selected = false,
    super.key,
  });

  final String title;
  final String? subtitle;

  /// Short trailing value such as an offset or count.
  final String? detail;
  final Widget? leading;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: subtitle == null
                  ? AppLayout.rowCompactMinHeight
                  : AppLayout.rowMinHeight,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  if (leading != null) ...[
                    IconTheme.merge(
                      data: IconThemeData(color: c.mutedForeground, size: 18),
                      child: leading!,
                    ),
                    const SizedBox(width: AppSpacing.md),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          title,
                          style: tokens.typography.base.copyWith(
                            color: c.foreground,
                            fontWeight: selected
                                ? FontWeight.w600
                                : FontWeight.w500,
                          ),
                        ),
                        if (subtitle case final subtitle?)
                          Text(
                            subtitle,
                            style: tokens.typography.small.copyWith(
                              color: c.mutedForeground,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (detail case final detail?) ...[
                    const SizedBox(width: AppSpacing.sm),
                    Text(
                      detail,
                      style: tokens.typography.small.copyWith(
                        color: c.mutedForeground,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                  SizedBox(
                    width: 32,
                    child: selected
                        ? Icon(AppIcons.check, color: c.primary, size: 20)
                        : null,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
