import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_labels.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/l10n/l10n.dart';

/// A decision snoozed on this device, with when it returns and Show now.
class FleetSnoozedRow extends StatelessWidget {
  const FleetSnoozedRow({
    required this.decision,
    required this.until,
    required this.onWake,
    super.key,
  });

  final FleetDecision decision;
  final DateTime until;
  final VoidCallback onWake;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toLanguageTag();
    return AppRichRow(
      title: decision.title,
      subtitle: l10n.mastermindFleetSnoozedUntil(
        '${Gmt7.day(until, locale)} ${Gmt7.time(until, locale)}',
      ),
      leading: const AppIconTile(icon: LucideIcons.alarmClock),
      trailing: AppButton.ghost(
        onPressed: onWake,
        child: Text(l10n.mastermindFleetUnsnooze),
      ),
    );
  }
}

/// A decision closed in the last day: where its answer came from as a chip,
/// its title, then the outcome, the time and, for an answer on another
/// channel, that it closed here too, so nothing is asked twice.
class FleetResolvedRow extends StatelessWidget {
  const FleetResolvedRow({
    required this.resolved,
    required this.now,
    super.key,
  });

  final FleetResolvedDecision resolved;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final via = resolved.answeredVia;
    final details = [
      ?resolved.outcome,
      Gmt7.time(resolved.resolvedAt, locale),
      if (via != null && via != FleetAnswerChannel.mobile)
        l10n.mastermindFleetResolvedClosedHere,
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppCard(
        child: MergeSemantics(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppBadge(
                variant: via == null
                    ? AppBadgeVariant.secondary
                    : AppBadgeVariant.success,
                leading: Icon(
                  resolved.kind == FleetDecisionKind.login
                      ? LucideIcons.keyRound
                      : LucideIcons.circleCheck,
                ),
                child: Text(via.label(l10n)),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(resolved.title, style: tokens.typography.p),
              const SizedBox(height: AppSpacing.xs),
              Text(
                details,
                style: tokens.typography.small.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
