import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_meter.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Direction of a stat's change, which picks its icon and colour role.
enum AppTrendDirection { up, down, flat }

/// A labelled change shown under a stat value, such as "+12% this week".
///
/// [positive] says whether the change is good news, so a falling expense can
/// still read as success. It defaults to `true` for [AppTrendDirection.up].
@immutable
class AppStatTrend {
  const AppStatTrend({
    required this.label,
    required this.direction,
    bool? positive,
  }) : positive = positive ?? direction == AppTrendDirection.up;

  final String label;
  final AppTrendDirection direction;
  final bool positive;
}

/// One key figure: a label, a large value and optional context.
///
/// Tiles share one height rhythm, so place them in an `AppAdaptiveGrid`
/// with `equalHeight: true` for a summary row. The value uses tabular figures
/// so numbers line up across tiles.
class AppStatTile extends StatelessWidget {
  const AppStatTile({
    required this.label,
    required this.value,
    this.icon,
    this.tone = AppTone.neutral,
    this.caption,
    this.trend,
    this.progress,
    this.onTap,
    this.semanticLabel,
    super.key,
  });

  final String label;
  final String value;
  final IconData? icon;

  /// Tints the icon tile and the progress meter. The value stays in the
  /// foreground colour so figures always meet text contrast.
  final AppTone tone;
  final String? caption;
  final AppStatTrend? trend;

  /// Optional 0–1 completion drawn as a meter under the value.
  final double? progress;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final trend = this.trend;
    final body = Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.small.copyWith(
                    color: c.mutedForeground,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                  ),
                ),
              ),
              if (icon case final icon?) ...[
                const SizedBox(width: AppSpacing.sm),
                AppIconTile(icon: icon, tone: tone, size: 28),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              value,
              maxLines: 1,
              style: type.x2Large.copyWith(
                color: c.foreground,
                fontWeight: FontWeight.w700,
                height: 1.15,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          if (progress case final progress?) ...[
            const SizedBox(height: AppSpacing.sm),
            AppMeter(value: progress, tone: tone),
          ],
          if (trend != null || caption != null) ...[
            const SizedBox(height: AppSpacing.xs),
            _StatFooter(trend: trend, caption: caption),
          ],
        ],
      ),
    );
    final radius = BorderRadius.circular(AppRadius.md + AppSpacing.xs);
    final solid = MediaQuery.highContrastOf(context);
    return Semantics(
      container: true,
      button: onTap != null,
      label: semanticLabel,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: c.card.withValues(alpha: solid ? 1 : 0.86),
          borderRadius: radius,
          border: Border.all(
            color: c.border.withValues(alpha: solid ? 1 : 0.7),
          ),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: onTap == null
              ? body
              : InkWell(onTap: onTap, borderRadius: radius, child: body),
        ),
      ),
    );
  }
}

class _StatFooter extends StatelessWidget {
  const _StatFooter({required this.trend, required this.caption});

  final AppStatTrend? trend;
  final String? caption;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final style = tokens.typography.xSmall.copyWith(
      color: c.mutedForeground,
      height: 1.3,
    );
    final trend = this.trend;
    final flat = trend == null || trend.direction == AppTrendDirection.flat;
    final trendColor = flat
        ? c.mutedForeground
        : (trend.positive ? c.success : c.destructive);
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xxs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (trend != null)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                switch (trend.direction) {
                  AppTrendDirection.up => LucideIcons.arrowUpRight,
                  AppTrendDirection.down => LucideIcons.arrowDownRight,
                  AppTrendDirection.flat => LucideIcons.arrowRight,
                },
                size: 14,
                color: trendColor,
              ),
              const SizedBox(width: AppSpacing.xxs),
              Text(
                trend.label,
                style: style.copyWith(
                  color: trendColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        if (caption case final caption?) Text(caption, style: style),
      ],
    );
  }
}
