import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/features/profile/view/profile_surface.dart';
import 'package:mobile/l10n/l10n.dart';

/// Compact tracked time for a stat value: "45m", "2h" or "1h 5m".
String profileTrackedDuration(AppLocalizations l10n, int seconds) {
  final minutes = seconds ~/ 60;
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  if (hours == 0) return l10n.profileDurationMinutes(minutes);
  if (rest == 0) return l10n.profileDurationHours(hours);
  return l10n.profileDurationHoursMinutes(hours, rest);
}

/// Focus Time on Profile: today, this week and this month side by side, with
/// See all opening the Timer statistics. Null [stats] shows static
/// placeholders; [onRetry] replaces the figures after a failed load.
class ProfileFocusTimeCard extends StatelessWidget {
  const ProfileFocusTimeCard({
    required this.stats,
    required this.onSeeAll,
    this.onRetry,
    super.key,
  });

  final TimeTrackerStats? stats;
  final VoidCallback onSeeAll;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final stats = this.stats;
    final onRetry = this.onRetry;
    return DecoratedBox(
      key: const ValueKey('profile-focus-time'),
      decoration: profileCardDecoration(context),
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(
          AppSpacing.md + 2,
          AppSpacing.xs,
          AppSpacing.xs,
          AppSpacing.md,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            AppSectionHeader(
              title: l10n.profileFocusTime,
              icon: LucideIcons.timer,
              actionLabel: l10n.homeSeeAll,
              onAction: onSeeAll,
              padding: EdgeInsets.zero,
            ),
            const SizedBox(height: AppSpacing.xs),
            if (onRetry != null)
              AppStateMessage.inline(
                icon: LucideIcons.cloudOff,
                tone: AppTone.destructive,
                title: l10n.commonSomethingWentWrong,
                actionLabel: l10n.commonRetry,
                onAction: onRetry,
              )
            else
              Padding(
                padding: const EdgeInsetsDirectional.only(end: AppSpacing.md),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final (index, (label, seconds)) in [
                      (l10n.timerToday, stats?.todayTime),
                      (l10n.timerThisWeek, stats?.weekTime),
                      (l10n.timerThisMonth, stats?.monthTime),
                    ].indexed) ...[
                      if (index > 0) const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: _Figure(label: label, seconds: seconds),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.seconds});

  final String label;

  /// Null while loading.
  final int? seconds;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final l10n = context.l10n;
    final seconds = this.seconds;
    return Semantics(
      label: seconds == null
          ? '$label: ${l10n.commonLoading}'
          : '$label: ${l10n.profileTrackedMinutes(seconds ~/ 60)}',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(
              color: c.mutedForeground,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          if (seconds == null)
            Container(
              width: 48,
              height: 20,
              decoration: BoxDecoration(
                color: c.muted,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            )
          else
            Text(
              profileTrackedDuration(l10n, seconds),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.heading.copyWith(
                color: c.foreground,
                fontWeight: FontWeight.w800,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
        ],
      ),
    );
  }
}
