import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Heading for a content section: a title with an optional count, a
/// supporting line and one trailing action such as "See all".
///
/// Use it above cards, grids and rich lists. Settings-style grouped cards
/// keep the quieter `AppSectionCaption`.
class AppSectionHeader extends StatelessWidget {
  const AppSectionHeader({
    required this.title,
    this.subtitle,
    this.count,
    this.icon,
    this.actionLabel,
    this.onAction,
    this.padding = const EdgeInsets.only(bottom: AppSpacing.md),
    super.key,
  });

  final String title;
  final String? subtitle;

  /// Shown as a muted figure after the title, for example the number of
  /// items in the section.
  final int? count;
  final IconData? icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final heading = Row(
      children: [
        if (icon case final icon?) ...[
          Icon(icon, size: 18, color: c.mutedForeground),
          const SizedBox(width: AppSpacing.sm),
        ],
        Flexible(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.large.copyWith(
              color: c.foreground,
              fontWeight: FontWeight.w600,
              height: 1.25,
            ),
          ),
        ),
        if (count case final count?) ...[
          const SizedBox(width: AppSpacing.sm),
          Text(
            '$count',
            style: type.small.copyWith(
              color: c.mutedForeground,
              fontWeight: FontWeight.w500,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ],
    );
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  heading,
                  if (subtitle case final subtitle?) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      subtitle,
                      style: type.small.copyWith(
                        color: c.mutedForeground,
                        height: 1.35,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(width: AppSpacing.sm),
            AppButton.ghost(
              size: AppButtonSize.small,
              onPressed: onAction,
              child: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
