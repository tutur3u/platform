import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/machines/machine_labels.dart';
import 'package:mobile/features/mastermind/machines/machine_sample.dart';
import 'package:mobile/features/mastermind/machines/machine_snapshot.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/l10n/l10n.dart';

String machineValue(BuildContext context, double? value, [String unit = '']) =>
    value == null
    ? context.l10n.mastermindMachineLabel('unavailable')
    : '${value.toStringAsFixed(value == value.roundToDouble() ? 0 : 1)}$unit';
String machineTime(BuildContext context, DateTime? time) {
  if (time == null) {
    return context.l10n.mastermindMachineLabel('unavailable');
  }
  final local = time.toUtc().add(const Duration(hours: 7));
  final text = local.toIso8601String().substring(0, 16).replaceAll('T', ' ');
  return '$text GMT+7';
}

String machinePath(String id) => '/mastermind/work/machine/$id';

class MachineList extends StatelessWidget {
  const MachineList({required this.snapshot, required this.now, super.key});
  final MachineSnapshot snapshot;
  final DateTime now;
  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
    valueListenable: machineSampleEnabled,
    builder: (context, _, child) {
      final data = visibleMachines(snapshot);
      final machines = data.machines;
      final l = context.l10n;
      final label = l.mastermindMachineLabel;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (kDebugMode)
            SwitchListTile.adaptive(
              title: Text(label('sampleToggle')),
              value: machineSampleEnabled.value,
              onChanged: (value) => machineSampleEnabled.value = value,
            ),
          if (kDebugMode && machineSampleEnabled.value) Text(label('sample')),
          if (machines == null)
            Text(label('notPublished'))
          else if (machines.isEmpty)
            Text(label('empty'))
          else ...[
            if (data.stale(now)) Text(label('stale')),
            if (data.coverage == 'partial') Text(label('partial')),
            Text(
              l.mastermindMachineUpdated(
                machineTime(context, data.collectedAt),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              child: Text(
                l.mastermindMachineSummary(
                  machines.length,
                  machines.where((m) => m.status == 'online').length,
                  machines.where((m) => m.alerts.isNotEmpty).length,
                ),
              ),
            ),
            for (final entry in groupMachines(machines).entries)
              if (entry.value.isNotEmpty)
                MastermindGroup(
                  caption: label(switch (entry.key) {
                    MachineGroup.attention => 'attention',
                    MachineGroup.online => 'online',
                    MachineGroup.offline => 'offlineGroup',
                  }),
                  children: [
                    for (final m in entry.value)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          MastermindListRow(
                            title: m.displayName,
                            subtitle: _summary(context, m),
                            onTap: () => context.push(machinePath(m.id)),
                          ),
                          Padding(
                            padding: const EdgeInsets.all(AppSpacing.md),
                            child: Wrap(
                              spacing: AppSpacing.sm,
                              runSpacing: AppSpacing.xs,
                              children: [
                                MastermindStatusChip(
                                  label: label(m.status ?? 'unknown'),
                                  icon: LucideIcons.circle,
                                ),
                                if (m.status != 'online')
                                  MastermindStatusChip(
                                    label: label('lastKnown'),
                                    icon: LucideIcons.clock,
                                  ),
                                for (final alert in m.alerts)
                                  MastermindStatusChip(
                                    label: label(alert.code),
                                    icon: LucideIcons.triangleAlert,
                                    tone: AppTone.warning,
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
          ],
        ],
      );
    },
  );
}

class HomeMachinesRow extends StatelessWidget {
  const HomeMachinesRow({required this.snapshot, super.key});
  final MachineSnapshot snapshot;
  @override
  Widget build(BuildContext context) {
    if (!(snapshot.machines?.any((m) => m.alerts.isNotEmpty) ?? false)) {
      return const SizedBox.shrink();
    }
    return MastermindGroup(
      children: [
        MastermindListRow(
          title: context.l10n.mastermindMachineLabel('machines'),
          subtitle: context.l10n.mastermindMachineLabel('attention'),
          onTap: () => context.go('/mastermind/work?segment=machines'),
        ),
      ],
    );
  }
}

String _summary(BuildContext context, Machine m) {
  final l = context.l10n;
  final label = l.mastermindMachineLabel;
  final seen = l.mastermindMachineLastSeen(machineTime(context, m.lastSeenAt));
  final cpu = machineValue(context, m.metrics['cpu_pct'], '%');
  final ram = machineValue(context, m.metrics['ram_pct'], '%');
  final disk = machineValue(context, m.metrics['disk_free_pct'], '%');
  return '${label(m.role ?? 'unknown')} · ${m.id}\n$seen\n'
      '${label('cpu')} $cpu · ${label('ram')} $ram · ${label('disk')} $disk';
}
