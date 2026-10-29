import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/machines/machine_history.dart';
import 'package:mobile/features/mastermind/machines/machine_labels.dart';
import 'package:mobile/features/mastermind/machines/machine_list.dart';
import 'package:mobile/features/mastermind/machines/machine_sample.dart';
import 'package:mobile/features/mastermind/machines/machine_snapshot.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

class MachineDetailPage extends StatelessWidget {
  const MachineDetailPage({required this.machineId, super.key});
  final String machineId;
  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) => ValueListenableBuilder(
      valueListenable: machineSampleEnabled,
      builder: (context, _, child) {
        final data = visibleMachines(ready.snapshot.machines);
        final matches = data.machines?.where((m) => m.id == machineId);
        final machine = matches == null || matches.isEmpty
            ? null
            : matches.first;
        return AppPageScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: MastermindFreshnessStrip(freshness: freshness),
            ),
            SliverToBoxAdapter(
              child: machine == null
                  ? Text(
                      context.l10n.mastermindMachineLabel(
                        data.machines == null ? 'notPublished' : 'gone',
                      ),
                    )
                  : MachineDetail(
                      machine: machine,
                      snapshot: data,
                      now: DateTime.now().toUtc(),
                    ),
            ),
          ],
        );
      },
    ),
  );
}

class MachineDetail extends StatelessWidget {
  const MachineDetail({
    required this.machine,
    required this.snapshot,
    required this.now,
    super.key,
  });
  final Machine machine;
  final MachineSnapshot snapshot;
  final DateTime now;
  @override
  Widget build(BuildContext context) {
    final l = context.l10n.mastermindMachineLabel;
    final m = machine;
    Widget row(String key, String value) =>
        MastermindListRow(title: l(key), subtitle: value);
    Widget group(String key, List<Widget> rows) => MastermindGroup(
      caption: l(key),
      children: rows.isEmpty ? [MastermindListRow(title: l('none'))] : rows,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ShellTitleOverride(
          ownerId: 'mastermind-machine',
          locations: {machinePath(m.id)},
          title: m.displayName,
          showLeadingBrand: false,
        ),
        if (snapshot.stale(now)) Text(l('stale')),
        if (snapshot.coverage == 'partial') Text(l('partial')),
        Text(
          context.l10n.mastermindMachineUpdated(
            machineTime(context, snapshot.collectedAt),
          ),
        ),
        group('status', [
          MastermindListRow(
            title: m.displayName,
            subtitle:
                '${m.id} · '
                '${l(m.role ?? 'unknown')} · '
                '${l(m.status ?? 'unknown')}',
          ),
          row(
            m.scheduling ?? 'unknown',
            context.l10n.mastermindMachineLastSeen(
              machineTime(context, m.lastSeenAt),
            ),
          ),
          row(
            m.osFamily ?? 'unknown',
            [
              for (final key in ['cores', 'ram_gb', 'disk_gb'])
                '${l(key)}: ${machineValue(context, m.specs[key])}',
            ].join(' · '),
          ),
        ]),
        if (m.status != 'online') Text(l('lastKnown')),
        group('now', [
          row('cpu', machineValue(context, m.metrics['cpu_pct'], '%')),
          row('load', machineValue(context, m.metrics['load_1m'])),
          row('ram', machineValue(context, m.metrics['ram_pct'], '%')),
          row(
            'disk',
            '${machineValue(context, m.metrics['disk_free_pct'], '%')} · '
                '${machineValue(context, m.metrics['disk_free_gb'], ' GB')}',
          ),
          row('swap', machineValue(context, m.metrics['swap_gb'], ' GB')),
          row(
            'temperature',
            '${machineValue(context, m.metrics['temp_c'], ' °C')} · '
                '${l(m.thermal ?? 'unavailable')}',
          ),
          row('time', machineTime(context, m.metricsAt)),
        ]),
        group('running', [
          for (final r in m.running) ...[
            row(
              r.kind,
              '${r.product ?? l('unknown')} · '
              '${machineValue(context, r.count)} · '
              '${machineValue(context, r.oldestAgeSeconds, ' s')}',
            ),
            for (final lane in r.laneIds)
              MastermindListRow(
                title: l('lane'),
                onTap: () => context.push('/mastermind/work/lane/$lane'),
              ),
          ],
          if (m.runningMore != null)
            row('other', machineValue(context, m.runningMore)),
        ]),
        group('rules', [
          for (final rule in m.rules) MastermindListRow(title: l(rule)),
        ]),
        group('alerts', [
          for (final alert in m.alerts)
            row(
              alert.code,
              '${l(alert.level ?? 'unknown')} · '
              '${machineTime(context, alert.since)}',
            ),
        ]),
        MachineHistory(machine: m, now: snapshot.collectedAt ?? now),
        group('keepAwake', [
          row(
            'keepAwake',
            l(switch (m.osFamily) {
              'macos' => 'macGuide',
              'linux' => 'linuxGuide',
              'windows' => 'windowsGuide',
              _ => 'unknownGuide',
            }),
          ),
        ]),
      ],
    );
  }
}
