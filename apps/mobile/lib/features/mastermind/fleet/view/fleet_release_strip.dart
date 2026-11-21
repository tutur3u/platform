import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// The release train: main freeze, production, migrations and incidents.
/// Parts the publisher did not report are left out.
class FleetReleaseStrip extends StatelessWidget {
  const FleetReleaseStrip({required this.release, super.key});

  final FleetRelease release;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final frozen = release.mainState == FleetMainState.frozen;
    final queued = release.queued ?? 0;
    final production = release.production;
    final migrations = release.migrationState;
    final incidents = release.incidents;
    return AppAdaptiveGrid(
      minTileWidth: 140,
      equalHeight: true,
      children: [
        AppStatTile(
          label: l10n.mastermindFleetReleaseMain,
          value: frozen
              ? l10n.mastermindFleetMainFrozen
              : l10n.mastermindFleetMainOpen,
          icon: frozen ? LucideIcons.lock : LucideIcons.gitBranch,
          tone: frozen ? AppTone.warning : AppTone.success,
          caption: [
            ?release.mainReason,
            if (queued > 0) l10n.mastermindFleetQueued(queued),
          ].join(' · ').ifEmptyNull,
        ),
        if (production != null)
          AppStatTile(
            label: l10n.mastermindFleetReleaseProduction,
            value: production.label(l10n),
            icon: LucideIcons.rocket,
            tone: production.tone,
            caption: release.productionSha,
          ),
        if (migrations != null)
          AppStatTile(
            label: l10n.mastermindFleetReleaseMigrations,
            value: l10n.mastermindFleetMigrationsPending(
              release.pendingMigrations,
            ),
            icon: LucideIcons.database,
            tone: migrations == FleetMigrationState.failed
                ? AppTone.destructive
                : release.pendingMigrations > 0
                ? AppTone.info
                : AppTone.neutral,
            caption: migrations.label(l10n),
          ),
        AppStatTile(
          label: l10n.mastermindFleetReleaseIncidents,
          value: l10n.mastermindFleetIncidentsOpen(incidents.length),
          icon: LucideIcons.siren,
          tone:
              incidents.any(
                (i) =>
                    i.severity == FleetIncidentSeverity.critical ||
                    i.severity == FleetIncidentSeverity.high,
              )
              ? AppTone.destructive
              : incidents.isEmpty
              ? AppTone.neutral
              : AppTone.warning,
          caption: incidents.firstOrNull?.title,
        ),
      ],
    );
  }
}

extension on String {
  String? get ifEmptyNull => isEmpty ? null : this;
}
