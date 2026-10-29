import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/ship/ship_capped_section.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/l10n/l10n.dart';

/// Queued and running CI runs per repository. A repository the hub could not
/// count says "Unavailable", never zero.
class ShipCiSection extends StatelessWidget {
  const ShipCiSection({required this.ci, super.key});

  final List<Ci> ci;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    String count(int? value) =>
        value == null ? l10n.mastermindUnavailable : '$value';
    return MastermindGroup(
      caption: l10n.mastermindShipCiNow,
      children: [
        if (ci.isEmpty)
          AppGroupedRow(
            leading: const AppIconTile(icon: LucideIcons.workflow),
            title: Text(l10n.mastermindUnavailable),
          ),
        for (final reading in ci)
          AppGroupedRow(
            leading: const AppIconTile(icon: LucideIcons.workflow),
            title: Text(MastermindLabels.repositoryName(reading.repo)),
            subtitle: Text(
              '${l10n.mastermindShipCiQueued(count(reading.queued))} · '
              '${l10n.mastermindShipCiRunning(count(reading.running))}',
            ),
          ),
      ],
    );
  }
}

/// When each product last reached production, most recent first, capped at
/// five with "Show all". [asOf] is the snapshot's own time, so the relative
/// age matches what the hub saw.
class ShipCadenceSection extends StatelessWidget {
  const ShipCadenceSection({
    required this.cadence,
    required this.asOf,
    super.key,
  });

  final List<Cadence> cadence;
  final DateTime asOf;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ShipCappedSection(
      caption: l10n.mastermindShipCadenceTitle,
      empty: AppGroupedRow(title: Text(l10n.mastermindShipNoCadence)),
      rows: [
        for (final entry in cadence)
          AppGroupedRow(
            title: Text(MastermindLabels.releaseProduct(entry.product)),
            subtitle: Text(
              entry.lastProdAt == null
                  ? l10n.mastermindShipNoProdRelease
                  : Gmt7.dateTime(entry.lastProdAt!, l10n.localeName),
            ),
            trailing: entry.lastProdAt == null
                ? null
                : Text(
                    mastermindAgeText(l10n, asOf.difference(entry.lastProdAt!)),
                  ),
          ),
      ],
    );
  }
}
