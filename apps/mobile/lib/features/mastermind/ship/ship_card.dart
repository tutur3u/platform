import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_card.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/presentation/relative_time.dart';
import 'package:mobile/features/mastermind/ship/ship_data.dart';
import 'package:mobile/features/mastermind/ship/ship_view.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/l10n/l10n.dart';

/// Deploy times read in ICT, the fleet's operating zone, on every device.
const shipTimeZone = 'Asia/Ho_Chi_Minh';

String shipTime(BuildContext context, DateTime at) {
  final locale = Localizations.localeOf(context).toString();
  final wall = mastermindWallTime(at, shipTimeZone);
  return context.l10n.mastermindShipLiveIct(
    DateFormat('d MMM HH:mm', locale).format(wall),
  );
}

String shipAge(BuildContext context, DateTime at, DateTime now) =>
    mastermindRelativeTimeText(
      context.l10n,
      at,
      now: now,
      zone: shipTimeZone,
      locale: Localizations.localeOf(context).toString(),
    );

/// "Checked 2m ago", or "Checked just now" inside the now window.
String shipCheckedText(BuildContext context, DateTime at, DateTime now) =>
    mastermindRelativeTime(at, now) is RelativeNow
    ? context.l10n.mastermindShipLiveCheckDone
    : context.l10n.mastermindShipLiveCheckedAgo(shipAge(context, at, now));

String shipChips(BuildContext context, String sourceId) =>
    sourceId == 'cloudflare'
    ? context.l10n.mastermindShipLiveChipsCloudflare
    : context.l10n.mastermindShipLiveChipsGithub;

/// One app: production and staging, the release gap, and the row's own
/// freshness with the sources it came from.
class ShipCard extends StatelessWidget {
  const ShipCard({required this.app, required this.view, super.key});

  final ShipApp app;
  final ShipView view;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final theme = Theme.of(context).textTheme;
    final fresh = view.freshnessOf(app);
    final age = fresh.okAt == null
        ? ''
        : shipAge(context, fresh.okAt!, view.now);
    final (AppTone tone, String freshText) = switch (fresh.kind) {
      ShipFreshnessKind.checked => (AppTone.success, age),
      ShipFreshnessKind.partial => (
        AppTone.warning,
        l10n.mastermindShipLiveFreshPartial,
      ),
      ShipFreshnessKind.stale => (
        AppTone.warning,
        l10n.mastermindShipLiveFreshStale(age),
      ),
      ShipFreshnessKind.unknown => (
        AppTone.neutral,
        app.sources.isEmpty
            ? l10n.mastermindShipLiveNotConfigured
            : l10n.mastermindShipLiveFreshNever,
      ),
    };
    final pending = app.pending;
    final pendingText = pending == null
        ? l10n.mastermindShipLivePendingUnknown
        : pending.commits == 0
        ? l10n.mastermindShipLiveUpToDate
        : pending.oldestAt == null
        ? l10n.mastermindShipLivePendingCount(_count(pending))
        : l10n.mastermindShipLivePendingCommits(
            _count(pending),
            shipAge(context, pending.oldestAt!, view.now),
          );
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: AppSpacing.sm,
        children: [
          Row(
            children: [
              Expanded(child: Text(app.name, style: theme.titleSmall)),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: tone.foreground(c),
                  shape: BoxShape.circle,
                ),
                child: const SizedBox.square(dimension: 8),
              ),
              const SizedBox(width: AppSpacing.xs),
              Text(freshText, style: theme.bodySmall),
            ],
          ),
          _EnvLine(
            label: l10n.mastermindShipLiveProduction,
            environment: app.production,
            empty: app.staging?.release != null
                ? l10n.mastermindShipLiveNotLive
                : l10n.mastermindShipLiveUnknown,
          ),
          _EnvLine(
            label: l10n.mastermindShipLiveStaging,
            environment: app.staging,
            empty: app.staging == null
                ? l10n.mastermindShipLiveNoStaging
                : l10n.mastermindShipLiveUnknown,
          ),
          const Divider(height: 1),
          Row(
            spacing: AppSpacing.xs,
            children: [
              Icon(
                LucideIcons.gitCommitHorizontal,
                size: 14,
                color: c.mutedForeground,
              ),
              Expanded(child: Text(pendingText, style: theme.bodySmall)),
            ],
          ),
          if (app.sources.isNotEmpty)
            Text(
              app.sources
                  .map((id) => shipChips(context, id))
                  .toSet()
                  .join(' · '),
              style: theme.bodySmall?.copyWith(color: c.mutedForeground),
            ),
        ],
      ),
    );
  }

  static String _count(ShipPending pending) =>
      '${pending.commits}${pending.capped ? '+' : ''}';
}

class _EnvLine extends StatelessWidget {
  const _EnvLine({
    required this.label,
    required this.environment,
    required this.empty,
  });

  final String label;
  final ShipEnvironment? environment;
  final String empty;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context).textTheme;
    final release = environment?.release;
    final worker = environment?.worker;
    final drift = worker?.sha != null && worker!.sha != release?.sha
        ? worker.sha
        : null;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 64, child: Text(label, style: theme.bodySmall)),
        Expanded(
          child: release == null
              ? Align(
                  alignment: Alignment.centerLeft,
                  child: MastermindStatusChip(label: empty),
                )
              : Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xxs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      worker?.versionId.substring(0, 8) ?? release.environment,
                      style: theme.bodyMedium,
                    ),
                    Text(
                      shortSha(release.sha),
                      style: theme.bodySmall?.copyWith(fontFamily: 'monospace'),
                    ),
                    Text(
                      shipTime(context, release.deployedAt),
                      style: theme.bodySmall,
                    ),
                    if (worker != null && worker.percentage < 100)
                      Text(
                        l10n.mastermindShipLiveSplit(
                          worker.percentage.toStringAsFixed(0),
                        ),
                        style: theme.bodySmall,
                      ),
                    _stateChip(l10n, release),
                    if (drift != null)
                      MastermindStatusChip(
                        label: l10n.mastermindShipLiveWorkerRuns(
                          shortSha(drift),
                        ),
                        icon: LucideIcons.triangleAlert,
                        tone: AppTone.warning,
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  /// A failed or running deploy outranks CI on the phone's single chip.
  static Widget _stateChip(AppLocalizations l10n, ShipRelease release) =>
      switch (release.deploy) {
        ShipDeploy.failed => MastermindStatusChip(
          label: l10n.mastermindShipLiveDeployFailed,
          icon: LucideIcons.circleX,
          tone: AppTone.destructive,
        ),
        ShipDeploy.running => MastermindStatusChip(
          label: l10n.mastermindShipLiveDeployRunning,
          icon: LucideIcons.refreshCw,
          tone: AppTone.info,
        ),
        ShipDeploy.ok => switch (release.ci) {
          ShipCi.success => MastermindStatusChip(
            label: l10n.mastermindShipLiveCiSuccess,
            icon: LucideIcons.circleCheck,
            tone: AppTone.success,
          ),
          ShipCi.failure => MastermindStatusChip(
            label: l10n.mastermindShipLiveCiFailure,
            icon: LucideIcons.circleX,
            tone: AppTone.destructive,
          ),
          ShipCi.pending => MastermindStatusChip(
            label: l10n.mastermindShipLiveCiPending,
            icon: LucideIcons.refreshCw,
            tone: AppTone.info,
          ),
          ShipCi.none => MastermindStatusChip(
            label: l10n.mastermindShipLiveCiNone,
            icon: LucideIcons.clock,
          ),
        },
      };
}
