import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/features/profile/view/profile_activity_chart.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class SharedActivitySheet extends StatefulWidget {
  const SharedActivitySheet({
    required this.name,
    required this.load,
    super.key,
  });
  final String name;
  final Future<TimeTrackerStats> Function() load;
  @override
  State<SharedActivitySheet> createState() => _SharedActivitySheetState();
}

class _SharedActivitySheetState extends State<SharedActivitySheet> {
  TimeTrackerStats? _stats;
  bool _failed = false;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final stats = await widget.load();
      if (mounted) setState(() => _stats = stats);
    } on Exception {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final stats = _stats;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .8,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.name,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    tooltip: MaterialLocalizations.of(
                      context,
                    ).closeButtonTooltip,
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_failed)
                Text(l10n.profileSharedActivityUnavailable)
              else if (stats == null)
                const Center(child: NovaLoadingIndicator())
              else ...[
                for (final entry in [
                  (l10n.timerToday, stats.todayTime),
                  (l10n.timerThisWeek, stats.weekTime),
                  (l10n.timerThisMonth, stats.monthTime),
                ])
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(entry.$1),
                    trailing: Text(l10n.profileTrackedMinutes(entry.$2 ~/ 60)),
                  ),
                ProfileActivityChart(activity: stats.dailyActivity),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
