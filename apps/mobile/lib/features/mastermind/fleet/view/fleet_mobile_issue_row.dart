import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/l10n/l10n.dart';

class FleetMobileIssueRow extends StatelessWidget {
  const FleetMobileIssueRow({required this.alert, super.key});

  final FleetMobileIssue alert;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = switch (alert.kind) {
      FleetMobileIssueKind.newIssue => l10n.mastermindMobileIssueNew,
      FleetMobileIssueKind.regression => l10n.mastermindMobileIssueRegression,
      FleetMobileIssueKind.spike => l10n.mastermindMobileIssueSpike,
      FleetMobileIssueKind.test => l10n.mastermindMobileIssueTest,
    };
    return AppStateMessage.inline(
      icon: alert.urgent ? LucideIcons.triangleAlert : LucideIcons.info,
      title: title,
      tone: alert.urgent ? AppTone.destructive : AppTone.info,
      message: alert.kind == FleetMobileIssueKind.test
          ? alert.issueId
          : l10n.mastermindMobileIssueDetail(
              alert.platform,
              alert.build,
              alert.count,
              alert.issueId,
            ),
    );
  }
}
