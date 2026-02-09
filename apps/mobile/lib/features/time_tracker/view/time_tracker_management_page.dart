import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold, AppBar, TextField, Card;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    final theme = shad.Theme.of(context);

    return shad.Scaffold(
      headers: [
        shad.AppBar(title: Text(l10n.timerManagementTitle)),
      ],
      child: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: shad.TextField(
              controller: _searchCtrl,
              hintText: 'Search sessions...',
              onSubmitted: (_) => unawaited(_load()),
              features: [
                const shad.InputFeature.leading(Icon(Icons.search, size: 20)),
                if (_searchCtrl.text.isNotEmpty)
                  shad.InputFeature.trailing(
                    shad.IconButton.ghost(
                      onPressed: () {
                        _searchCtrl.clear();
                        unawaited(_load());
                      },
                      icon: const Icon(Icons.clear, size: 16),
                    ),
                  ),
              ],
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
                const shad.Gap(8),
                _OverviewCard(
                  label: l10n.timerActiveUsers,
                  value: '${_uniqueUsers()}',
                  icon: Icons.people,
                ),
              ],
            ),
          ),
          const shad.Gap(8),
          // Session list
          Expanded(
            child: _loading
                ? const Center(child: shad.CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _error!,
                              style: theme.typography.p.copyWith(
                                color: theme.colorScheme.destructive,
                              ),
                            ),
                            const shad.Gap(8),
                            shad.SecondaryButton(
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
    final theme = shad.Theme.of(context);

    return Expanded(
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, size: 24, color: theme.colorScheme.primary),
              const shad.Gap(12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    value,
                    style: theme.typography.p.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    label,
                    style: theme.typography.textSmall,
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
    final theme = shad.Theme.of(context);
    final dateFmt = DateFormat.yMMMd();

    final dur = session.duration;
    final durationText = _formatDuration(dur);

    return shad.GhostButton(
      onPressed: () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.person,
                color: theme.colorScheme.primary,
                size: 20,
              ),
            ),
            const shad.Gap(16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    session.title ?? 'Session',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p,
                  ),
                  if (session.startTime != null)
                    Text(
                      dateFmt.format(session.startTime!.toLocal()),
                      style: theme.typography.textSmall,
                    ),
                ],
              ),
            ),
            Text(
              durationText,
              style: theme.typography.p.copyWith(fontWeight: FontWeight.w600),
            ),
          ],
        ),
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

