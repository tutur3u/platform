import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/l10n/l10n.dart';

/// Every machine the orchestrator knows, with its reachability and how many
/// active lanes it runs. A row opens Work grouped by machine.
class FleetMachinesPanel extends StatelessWidget {
  const FleetMachinesPanel({required this.snapshot, this.now, super.key});

  final FleetSnapshot snapshot;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final current = (now ?? DateTime.now)().toUtc();
    final active = <String, int>{};
    for (final lane in snapshot.lanes.where(fleetLaneIsActive)) {
      active.update(lane.machineId, (n) => n + 1, ifAbsent: () => 1);
    }
    return AppPanel(
      title: l10n.mastermindFleetMachinesTitle,
      padded: false,
      child: Column(
        children: [
          for (final machine in snapshot.machines)
            _MachineRow(
              machine: machine,
              active: active[machine.id] ?? 0,
              now: current,
            ),
        ],
      ),
    );
  }
}

class _MachineRow extends StatelessWidget {
  const _MachineRow({
    required this.machine,
    required this.active,
    required this.now,
  });

  final FleetMachine machine;
  final int active;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final seen = machine.lastSeenAt;
    final status = fleetMachineStatusAt(machine, now);
    return AppRichRow(
      title: machine.label,
      subtitle: l10n.mastermindFleetMachineActive(active),
      leading: AppIconTile(icon: LucideIcons.server, tone: status.tone),
      trailing: _StatusBadge(status: status),
      trailingCaption: seen == null ? null : fleetAge(l10n, seen, now),
      onTap: () => context.go('${Routes.mastermindWork}?group=machine'),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final FleetMachineStatus status;

  @override
  Widget build(BuildContext context) => AppBadge(
    variant: switch (status) {
      FleetMachineStatus.online => AppBadgeVariant.success,
      FleetMachineStatus.stale => AppBadgeVariant.warning,
      FleetMachineStatus.offline => AppBadgeVariant.outline,
    },
    child: Text(status.label(context.l10n)),
  );
}
