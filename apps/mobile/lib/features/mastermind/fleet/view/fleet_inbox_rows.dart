import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
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

/// A decision closed in the last day and where its answer came from, such
/// as "Answered on WhatsApp · Retire it".
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
    final via = resolved.answeredVia.label(l10n);
    return AppRichRow(
      title: resolved.title,
      subtitle: resolved.outcome == null ? via : '$via · ${resolved.outcome}',
      leading: AppIconTile(
        icon: resolved.kind == FleetDecisionKind.login
            ? LucideIcons.keyRound
            : LucideIcons.circleCheck,
        tone: AppTone.success,
      ),
      trailingCaption: fleetAge(l10n, resolved.resolvedAt, now),
    );
  }
}
