import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Semantic tint of an [AppIconTile]. Each tone maps to an appearance theme
/// role, so tiles follow the selected theme, accent and brightness.
enum AppTone {
  neutral,
  primary,
  info,
  success,
  warning,
  destructive;

  /// Foreground (icon and accent text) colour of the tone.
  Color foreground(AppColorTokens colors) => switch (this) {
    AppTone.neutral => colors.mutedForeground,
    AppTone.primary => colors.primary,
    AppTone.info => colors.info,
    AppTone.success => colors.success,
    AppTone.warning => colors.warning,
    AppTone.destructive => colors.destructive,
  };

  /// Quiet fill behind the icon, tinted from the foreground role.
  Color fill(AppColorTokens colors) => this == AppTone.neutral
      ? colors.muted
      : foreground(colors).withValues(alpha: colors.isDark ? 0.2 : 0.12);
}

/// Rounded square that carries a row's leading icon.
class AppIconTile extends StatelessWidget {
  const AppIconTile({
    required this.icon,
    this.tone = AppTone.neutral,
    this.size = AppLayout.rowLeadingSize,
    this.badge = false,
    super.key,
  });

  final IconData icon;
  final AppTone tone;
  final double size;

  /// Shows a small primary dot on the corner, such as an unread marker.
  final bool badge;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final tile = DecoratedBox(
      decoration: BoxDecoration(
        color: tone.fill(colors),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: SizedBox.square(
        dimension: size,
        child: Icon(icon, size: size * 0.52, color: tone.foreground(colors)),
      ),
    );
    if (!badge) return tile;
    final dot = size * 0.28;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        tile,
        Positioned(
          top: -dot / 4,
          right: -dot / 4,
          child: Container(
            width: dot,
            height: dot,
            decoration: BoxDecoration(
              color: colors.primary,
              shape: BoxShape.circle,
              border: Border.all(color: colors.background, width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}

/// A row inside an `AppGroupedCard`: leading tile, title, optional supporting
/// line and trailing widget. Rows are at least the density row height tall,
/// and the whole row is the tap target when [onTap] is set.
class AppGroupedRow extends StatelessWidget {
  const AppGroupedRow({
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    this.showChevron = false,
    this.semanticLabel,
    super.key,
  });

  final Widget title;
  final Widget? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;

  /// Appends a muted disclosure chevron after [trailing].
  final bool showChevron;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final row = ConstrainedBox(
      constraints: BoxConstraints(minHeight: tokens.interface.rowMinHeight),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppLayout.rowHorizontalPadding,
          vertical: AppSpacing.md,
        ),
        child: Row(
          children: [
            if (leading case final leading?) ...[
              leading,
              const SizedBox(width: AppLayout.rowLeadingGap),
            ],
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DefaultTextStyle.merge(
                    style: tokens.typography.base.copyWith(
                      color: c.foreground,
                      fontWeight: FontWeight.w500,
                      height: 1.3,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    child: title,
                  ),
                  if (subtitle case final subtitle?) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    DefaultTextStyle.merge(
                      style: tokens.typography.small.copyWith(
                        color: c.mutedForeground,
                        height: 1.35,
                      ),
                      child: subtitle,
                    ),
                  ],
                ],
              ),
            ),
            if (trailing case final trailing?) ...[
              const SizedBox(width: AppSpacing.sm),
              DefaultTextStyle.merge(
                style: tokens.typography.small.copyWith(
                  color: c.mutedForeground,
                ),
                child: trailing,
              ),
            ],
            if (showChevron) ...[
              const SizedBox(width: AppSpacing.xs),
              Icon(AppIcons.forward, size: 18, color: c.mutedForeground),
            ],
          ],
        ),
      ),
    );
    if (onTap == null) {
      return semanticLabel == null
          ? row
          : Semantics(label: semanticLabel, child: row);
    }
    return Semantics(
      button: true,
      label: semanticLabel,
      child: InkWell(onTap: onTap, child: row),
    );
  }
}

/// Placeholder rows shown inside a grouped card while its first load runs.
class AppSkeletonRows extends StatelessWidget {
  const AppSkeletonRows({
    this.count = 2,
    this.leadingSize = AppLayout.rowLeadingSize,
    super.key,
  });

  final int count;
  final double leadingSize;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    Widget bar(double widthFactor, double height) => FractionallySizedBox(
      alignment: AlignmentDirectional.centerStart,
      widthFactor: widthFactor,
      child: Container(
        height: height,
        decoration: BoxDecoration(
          color: colors.muted,
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
      ),
    );
    return ExcludeSemantics(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var index = 0; index < count; index++)
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppLayout.rowHorizontalPadding,
                vertical: AppSpacing.md + AppSpacing.xxs,
              ),
              child: Row(
                children: [
                  Container(
                    width: leadingSize,
                    height: leadingSize,
                    decoration: BoxDecoration(
                      color: colors.muted,
                      borderRadius: BorderRadius.circular(leadingSize * 0.32),
                    ),
                  ),
                  const SizedBox(width: AppLayout.rowLeadingGap),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        bar(index.isEven ? 0.72 : 0.56, 12),
                        const SizedBox(height: AppSpacing.sm),
                        bar(index.isEven ? 0.42 : 0.5, 10),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
