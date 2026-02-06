import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class TimeTrackerManagementPage extends StatefulWidget {
  const TimeTrackerManagementPage({super.key});

  @override
  State<TimeTrackerManagementPage> createState() =>
      _TimeTrackerManagementPageState();
}

class _TimeTrackerManagementPageState extends State<TimeTrackerManagementPage> {
  final _repo = TimeTrackerRepository();
  final _searchCtrl = TextEditingController();
  List<TimeTrackingSession> _sessions = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final sessions = await _repo.getManagementSessions(
        wsId,
        search: _searchCtrl.text.isEmpty ? null : _searchCtrl.text,
      );
      if (mounted) {
        setState(() {
          _sessions = sessions;
          _loading = false;
        });
      }
    } on Exception catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.timerManagementTitle)),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search sessions...',
                prefixIcon: const Icon(Icons.search),
                border: const OutlineInputBorder(),
                isDense: true,
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchCtrl.clear();
                          unawaited(_load());
                        },
                      )
                    : null,
              ),
              onSubmitted: (_) => unawaited(_load()),
            ),
          ),
          // Stats overview
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                _OverviewCard(
                  label: l10n.timerTotalSessions,
                  value: '${_sessions.length}',
                  icon: Icons.timer,
                ),
                const SizedBox(width: 8),
                _OverviewCard(
                  label: l10n.timerActiveUsers,
                  value: '${_uniqueUsers()}',
                  icon: Icons.people,
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Session list
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _error!,
                          style: textTheme.bodyMedium?.copyWith(
                            color: colorScheme.error,
                          ),
                        ),
                        const SizedBox(height: 8),
                        FilledButton.tonal(
                          onPressed: _load,
                          child: Text(l10n.commonRetry),
                        ),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      itemCount: _sessions.length,
                      padding: const EdgeInsets.only(bottom: 32),
                      itemBuilder: (context, index) {
                        final session = _sessions[index];
                        return _ManagementSessionTile(session: session);
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  int _uniqueUsers() {
    return _sessions.map((s) => s.userId).toSet().length;
  }
}

class _OverviewCard extends StatelessWidget {
  const _OverviewCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, size: 24, color: colorScheme.primary),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    value,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    label,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ManagementSessionTile extends StatelessWidget {
  const _ManagementSessionTile({required this.session});

  final TimeTrackingSession session;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final dateFmt = DateFormat.yMMMd();

    final dur = session.duration;
    final durationText = _formatDuration(dur);

    return ListTile(
      leading: CircleAvatar(
        backgroundColor: colorScheme.primaryContainer,
        child: Icon(
          Icons.person,
          color: colorScheme.onPrimaryContainer,
          size: 20,
        ),
      ),
      title: Text(
        session.title ?? 'Session',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: session.startTime != null
          ? Text(
              dateFmt.format(session.startTime!.toLocal()),
              style: textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            )
          : null,
      trailing: Text(
        durationText,
        style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
      ),
    );
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    if (h > 0) return '${h}h ${m}m';
    return '${m}m';
  }
}
