import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/l10n/l10n.dart';

/// Firing SLO burn alerts beside the release train: one row per alert with
/// its service, indicator and burn rates. Pages read as destructive.
class FleetAlertsPanel extends StatelessWidget {
  const FleetAlertsPanel({required this.alerts, this.now, super.key});

  final List<FleetAlert> alerts;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final current = (now ?? DateTime.now)().toUtc();
    return AppPanel(
      title: l10n.mastermindFleetAlertsTitle,
      padded: false,
      child: Column(
        children: [
          for (final alert in alerts)
            AppRichRow(
              title: alert.service,
              subtitle: l10n.mastermindFleetAlertBurn(
                alert.indicator.label(l10n),
                _burn(alert.burnLong),
                _burn(alert.burnShort),
              ),
              leading: AppIconTile(
                icon: LucideIcons.flame,
                tone: alert.severity.tone,
              ),
              trailing: AppBadge(
                variant: alert.severity == FleetAlertSeverity.page
                    ? AppBadgeVariant.destructive
                    : AppBadgeVariant.warning,
                child: Text(alert.severity.label(l10n)),
              ),
              trailingCaption: fleetAge(l10n, alert.startedAt, current),
            ),
        ],
      ),
    );
  }
}

/// One decimal below 10, whole numbers above: "14.4", "32".
String _burn(double value) =>
    value < 10 ? value.toStringAsFixed(1) : value.round().toString();

extension FleetAlertSeverityView on FleetAlertSeverity {
  String label(AppLocalizations l10n) => switch (this) {
    FleetAlertSeverity.page => l10n.mastermindFleetAlertPage,
    FleetAlertSeverity.ticket => l10n.mastermindFleetAlertTicket,
  };

  AppTone get tone => switch (this) {
    FleetAlertSeverity.page => AppTone.destructive,
    FleetAlertSeverity.ticket => AppTone.warning,
  };
}

extension FleetAlertIndicatorView on FleetAlertIndicator {
  String label(AppLocalizations l10n) => switch (this) {
    FleetAlertIndicator.availability => l10n.mastermindFleetAlertAvailability,
    FleetAlertIndicator.latency => l10n.mastermindFleetAlertLatency,
  };
}
