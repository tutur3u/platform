import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_history_entry.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/l10n/l10n.dart';

/// The answer a History entry records: the option, the action, or how it
/// closed.
String fleetHistoryOutcome(AppLocalizations l10n, FleetHistoryEntry entry) =>
    switch (entry.status) {
      FleetHistoryStatus.withdrawn => l10n.mastermindFleetHistoryWithdrawn,
      FleetHistoryStatus.resolved => l10n.mastermindFleetHistoryResolved,
      _ =>
        entry.outcome ??
            entry.action?.doneLabel(l10n) ??
            l10n.mastermindFleetResolvedClosed,
    };

/// Who answered and on which channel: "You · WhatsApp", or the orchestrator
/// for a decision it closed itself.
String fleetHistoryWho(
  AppLocalizations l10n,
  FleetHistoryEntry entry,
  String orchestrator,
) {
  if (entry.status == FleetHistoryStatus.withdrawn ||
      entry.status == FleetHistoryStatus.resolved) {
    return orchestrator;
  }
  return l10n.mastermindFleetHistoryByYou(switch (entry.channel) {
    FleetAnswerChannel.whatsapp => l10n.mastermindFleetChannelWhatsapp,
    FleetAnswerChannel.cli => l10n.mastermindFleetChannelCli,
    _ => l10n.mastermindFleetChannelMastermind,
  });
}

/// The delivery state in words, with its icon and colour role.
(String, IconData, Color) fleetHistoryState(
  BuildContext context,
  FleetHistoryEntry entry,
  String orchestrator,
) {
  final l10n = context.l10n;
  final colors = AppTokens.of(context).colorScheme;
  return switch (entry.status) {
    FleetHistoryStatus.sending => (
      l10n.mastermindFleetAnswerSending,
      LucideIcons.send,
      colors.mutedForeground,
    ),
    FleetHistoryStatus.retrying => (
      l10n.mastermindFleetHistoryRetrying,
      LucideIcons.refreshCw,
      colors.warning,
    ),
    FleetHistoryStatus.waiting => (
      l10n.mastermindFleetAnswerWaiting(orchestrator),
      LucideIcons.hourglass,
      colors.warning,
    ),
    FleetHistoryStatus.received => (
      l10n.mastermindFleetAnswerReceived(orchestrator),
      LucideIcons.check,
      colors.success,
    ),
    FleetHistoryStatus.delivered => (
      l10n.mastermindFleetHistoryDelivered(orchestrator),
      LucideIcons.check,
      colors.success,
    ),
    FleetHistoryStatus.withdrawn => (
      l10n.mastermindFleetHistoryWithdrawnStatus,
      LucideIcons.circleMinus,
      colors.mutedForeground,
    ),
    FleetHistoryStatus.resolved => (
      l10n.mastermindFleetHistoryResolvedStatus,
      LucideIcons.circleCheck,
      colors.mutedForeground,
    ),
  };
}

/// The ICT day heading for [at] relative to [now]: Today, Yesterday or the
/// date.
String fleetHistoryDay(
  AppLocalizations l10n,
  String locale,
  DateTime at,
  DateTime now,
) {
  DateTime day(DateTime value) {
    final wall = Gmt7.wallTime(value);
    return DateTime.utc(wall.year, wall.month, wall.day);
  }

  final days = day(now).difference(day(at)).inDays;
  return switch (days) {
    0 => l10n.mastermindFleetHistoryToday,
    1 => l10n.mastermindFleetHistoryYesterday,
    _ => Gmt7.day(at, locale),
  };
}

/// One History row: the question, the chosen answer, who answered where and
/// when in ICT, and how far delivery got. An answer still inside its undo
/// window offers Undo; tapping opens the decision read-only.
class FleetHistoryRow extends StatelessWidget {
  const FleetHistoryRow({
    required this.entry,
    required this.orchestrator,
    required this.onTap,
    this.onUndo,
    super.key,
  });

  final FleetHistoryEntry entry;
  final String orchestrator;
  final VoidCallback onTap;
  final VoidCallback? onUndo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final muted = tokens.colorScheme.mutedForeground;
    final (state, icon, color) = fleetHistoryState(
      context,
      entry,
      orchestrator,
    );
    final meta = tokens.typography.caption.copyWith(color: muted);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              entry.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.ui.merge(tokens.typography.bold),
            ),
            const SizedBox(height: AppSpacing.xs),
            Row(
              children: [
                Flexible(
                  child: AppBadge(
                    child: Text(
                      fleetHistoryOutcome(l10n, entry),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                if (entry.undoable && onUndo != null) ...[
                  const SizedBox(width: AppSpacing.sm),
                  AppButton.ghost(
                    size: AppButtonSize.small,
                    onPressed: onUndo,
                    child: Text(l10n.mastermindFleetUndo),
                  ),
                ],
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.xxs,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(fleetHistoryWho(l10n, entry, orchestrator), style: meta),
                Text(
                  l10n.mastermindFleetHistoryTimeIct(
                    Gmt7.time(entry.at, locale),
                  ),
                  style: meta,
                ),
                Semantics(
                  liveRegion: true,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, size: 13, color: color),
                      const SizedBox(width: AppSpacing.xxs),
                      Text(state, style: meta.copyWith(color: color)),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
