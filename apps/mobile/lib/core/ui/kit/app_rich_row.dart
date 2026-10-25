import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Small icon-and-label fact under a row title: a due date, an assignee
/// count, a file size. Keep two or three per row.
class AppMetaItem extends StatelessWidget {
  const AppMetaItem({required this.label, this.icon, this.color, super.key});

  final String label;
  final IconData? icon;

  /// Overrides the muted colour, for example `colors.destructive` for an
  /// overdue date. Pass a theme role, never a literal colour.
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final color = this.color ?? tokens.colorScheme.mutedForeground;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon case final icon?) ...[
          Icon(icon, size: 14, color: color),
          const SizedBox(width: AppSpacing.xs),
        ],
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: tokens.typography.xSmall.copyWith(
              color: color,
              fontWeight: FontWeight.w500,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}

/// Content row for entity lists (transactions, files, customers, products,
/// courses): leading visual, title, supporting line, a wrap of
/// [AppMetaItem]s and a trailing value with an optional caption.
///
/// Rows work inside an `AppGroupedCard` or on their own. [selected] marks
/// the open item in a master/detail layout. Settings-style rows without
/// metadata use `AppGroupedRow` instead.
class AppRichRow extends StatelessWidget {
  const AppRichRow({
    required this.title,
    this.leading,
    this.subtitle,
    this.meta = const [],
    this.trailing,
    this.trailingCaption,
    this.selected = false,
    this.onTap,
    this.onLongPress,
    this.semanticLabel,
    super.key,
  });

  final String title;
  final Widget? leading;
  final String? subtitle;
  final List<Widget> meta;

  /// Usually a value (amount, size, score) or a status badge.
  final Widget? trailing;

  /// Muted line under [trailing], such as a time or a unit.
  final String? trailingCaption;
  final bool selected;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final hasTrailing = trailing != null || trailingCaption != null;
    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppLayout.rowMinHeight + 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppLayout.rowHorizontalPadding,
          vertical: AppSpacing.md,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (leading case final leading?) ...[
              leading,
              const SizedBox(width: AppLayout.rowLeadingGap),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.base.copyWith(
                      color: c.foreground,
                      fontWeight: FontWeight.w600,
                      height: 1.3,
                    ),
                  ),
                  if (subtitle case final subtitle?) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.small.copyWith(
                        color: c.mutedForeground,
                        height: 1.35,
                      ),
                    ),
                  ],
                  if (meta.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs + 2),
                    Wrap(
                      spacing: AppSpacing.md,
                      runSpacing: AppSpacing.xs,
                      children: meta,
                    ),
                  ],
                ],
              ),
            ),
            if (hasTrailing) ...[
              const SizedBox(width: AppSpacing.md),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (trailing case final trailing?)
                    DefaultTextStyle.merge(
                      style: type.base.copyWith(
                        color: c.foreground,
                        fontWeight: FontWeight.w600,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                      child: trailing,
                    ),
                  if (trailingCaption case final caption?) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      caption,
                      style: type.xSmall.copyWith(color: c.mutedForeground),
                    ),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
    final decorated = selected
        ? DecoratedBox(
            decoration: BoxDecoration(
              color: c.primary.withValues(alpha: c.isDark ? 0.16 : 0.08),
              border: BorderDirectional(
                start: BorderSide(color: c.primary, width: 3),
              ),
            ),
            child: row,
          )
        : row;
    return Semantics(
      button: onTap != null,
      selected: selected,
      label: semanticLabel,
      child: Material(
        type: MaterialType.transparency,
        child: onTap == null && onLongPress == null
            ? decorated
            : InkWell(onTap: onTap, onLongPress: onLongPress, child: decorated),
      ),
    );
  }
}
