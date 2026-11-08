import 'package:flutter/material.dart';
import 'package:mobile/core/ui/charts/charts.dart';
import 'package:mobile/features/mastermind/machines/machine_labels.dart';
import 'package:mobile/features/mastermind/machines/machine_snapshot.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';
import 'package:mobile/l10n/l10n.dart';

class MachineHistory extends StatefulWidget {
  const MachineHistory({required this.machine, required this.now, super.key});
  final Machine machine;
  final DateTime now;
  @override
  State<MachineHistory> createState() => _MachineHistoryState();
}

class _MachineHistoryState extends State<MachineHistory> {
  bool week = false;
  bool table = false;
  final selection = ChartSelectionController();
  @override
  void dispose() {
    selection.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n.mastermindMachineLabel;
    return MastermindGroup(
      caption: l('history'),
      children: [
        Wrap(
          children: [
            for (final w in [false, true])
              TextButton(
                onPressed: () => setState(() {
                  week = w;
                  selection.clear();
                }),
                child: Text('${week == w ? '• ' : ''}${l(w ? '7d' : '24h')}'),
              ),
            TextButton(
              onPressed: () => setState(() => table = !table),
              child: Text(l('table')),
            ),
          ],
        ),
        for (final key in ['cpu', 'ram', 'disk'])
          Builder(
            builder: (context) {
              final points = (widget.machine.history[key] ?? [])
                  .where(
                    (p) =>
                        !p.t.isBefore(
                          widget.now.subtract(Duration(days: week ? 7 : 1)),
                        ) &&
                        !p.t.isAfter(widget.now),
                  )
                  .toList();
              final series = [
                ChartSeries(
                  id: key,
                  label: l(key),
                  slot: 0,
                  unit: '%',
                  points: [
                    for (final p in points) ChartPoint(t: p.t, y: p.value),
                  ],
                ),
              ];
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  MastermindListRow(
                    title: l(key),
                    subtitle: points.isEmpty ? l('unavailable') : null,
                  ),
                  if (table)
                    ChartTable(
                      data: ChartTableData.fromSeries(
                        series,
                        ChartLabels(
                          unavailable: l('unavailable'),
                          partialBucket: l('partial'),
                          table: l('table'),
                          time: l('time'),
                        ),
                      ),
                    )
                  else if (points.isNotEmpty)
                    ChartPlot(
                      controller: selection,
                      bucketCount: points.length,
                      seriesCount: 1,
                      summary: l(key),
                      painterBuilder: (selected) => LinePainter(
                        series: series,
                        palette: AppChartPalette.of(context),
                        axis: ChartValueAxis.percent,
                        cadence: Duration(minutes: week ? 120 : 15),
                        selectedBucket: selected?.bucket,
                        textScaler: MediaQuery.textScalerOf(context),
                      ),
                    ),
                ],
              );
            },
          ),
      ],
    );
  }
}
