import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/task_progress.dart';
import 'package:mobile/data/repositories/task_progress_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/tasks/view/tasks_progress_quick_log.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class TasksProgressPage extends StatelessWidget {
  const TasksProgressPage({super.key});

  @override
  Widget build(BuildContext context) {
    final userId = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.status == AuthStatus.authenticated
          ? cubit.state.user?.id
          : null,
    );
    final workspaceId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    if (userId == null || workspaceId == null) return const SizedBox.shrink();
    return _WorkspaceProgress(
      key: ValueKey((userId, workspaceId)),
      userId: userId,
      workspaceId: workspaceId,
    );
  }
}

class _WorkspaceProgress extends StatefulWidget {
  const _WorkspaceProgress({
    required this.userId,
    required this.workspaceId,
    super.key,
  });

  final String userId;
  final String workspaceId;

  @override
  State<_WorkspaceProgress> createState() => _WorkspaceProgressState();
}

class _WorkspaceProgressState extends State<_WorkspaceProgress> {
  final _repository = TaskProgressRepository();
  TaskProgressSnapshot? _snapshot;
  Object? _error;
  bool _loading = true;
  int _section = 0;
  int _loadRequest = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _repository.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final request = ++_loadRequest;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final snapshot = await _repository.load(
        userId: widget.userId,
        workspaceId: widget.workspaceId,
      );
      if (!mounted || request != _loadRequest) return;
      setState(() => _snapshot = snapshot);
    } on Object catch (error) {
      if (!mounted || request != _loadRequest) return;
      setState(() {
        _snapshot = null;
        _error = error;
      });
    } finally {
      if (mounted && request == _loadRequest) setState(() => _loading = false);
    }
  }

  bool _scopeIsCurrent() =>
      mounted &&
      context.read<WorkspaceCubit>().state.currentWorkspace?.id ==
          widget.workspaceId &&
      context.read<AuthCubit>().state.user?.id == widget.userId;

  Future<void> _quickLog(List<ProgressMetric> metrics) async {
    final saved = await showTasksProgressQuickLog(
      context,
      metrics: metrics,
      save: (metric, value, note) async {
        if (!_scopeIsCurrent()) {
          throw const TaskProgressUnavailable();
        }
        await _repository.quickLog(
          userId: widget.userId,
          workspaceId: widget.workspaceId,
          metric: metric,
          value: value,
          day: DateTime.now(),
          scopeIsCurrent: _scopeIsCurrent,
          note: note,
        );
      },
    );
    if (saved && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final snapshot = _snapshot;
    final numbers = NumberFormat.decimalPattern(l10n.localeName);
    final metrics = {
      for (final metric in snapshot?.metrics ?? const <ProgressMetric>[])
        metric.id: metric,
    };
    final rows = snapshot == null
        ? const <Widget>[]
        : switch (_section) {
            0 => [
              for (final entry in snapshot.entries)
                ListTile(
                  title: Text(
                    metrics[entry.metricId]?.name ?? l10n.tasksProgress,
                  ),
                  subtitle: Text(
                    entry.note == null
                        ? entry.date
                        : '${entry.date} · ${entry.note}',
                  ),
                  trailing: Text(numbers.format(entry.value)),
                ),
            ],
            1 => [
              for (final goal in snapshot.goals)
                ListTile(
                  title: Text(goal.name),
                  subtitle: Text(
                    '${numbers.format(goal.value)} / '
                            '${numbers.format(goal.target)} ${goal.unit ?? ''}'
                        .trim(),
                  ),
                ),
            ],
            _ => [
              for (final board in snapshot.leaderboards)
                ExpansionTile(
                  title: Text(board.name),
                  children: [
                    if (board.rankings.isEmpty)
                      ListTile(title: Text(l10n.tasksProgressEmpty)),
                    for (final ranked in board.rankings)
                      ListTile(
                        leading: ranked.rank == null
                            ? null
                            : Text(numbers.format(ranked.rank)),
                        title: Text(ranked.name ?? l10n.tasksProgressMember),
                        trailing: Text(numbers.format(ranked.value)),
                      ),
                  ],
                ),
            ],
          };

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          MediaQuery.paddingOf(context).bottom + 16,
        ),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (index, title) in [
                l10n.tasksProgress,
                l10n.tasksProgressGoals,
                l10n.tasksProgressLeaderboard,
              ].indexed)
                ChoiceChip(
                  label: Text(title),
                  selected: _section == index,
                  onSelected: (_) => setState(() => _section = index),
                ),
              if (_section == 0 && metrics.isNotEmpty)
                FilledButton(
                  onPressed: _loading
                      ? null
                      : () => _quickLog(metrics.values.toList()),
                  child: Text(l10n.tasksProgressQuickLog),
                ),
            ],
          ),
          if (_loading) const LinearProgressIndicator(),
          if (_error case final error?)
            ListTile(
              title: Text(
                error is TaskProgressUnavailable
                    ? l10n.tasksProgressUnavailable
                    : l10n.tasksProgressLoadFailed,
              ),
              trailing: TextButton(
                onPressed: _load,
                child: Text(l10n.commonRetry),
              ),
            ),
          if (snapshot != null && rows.isEmpty)
            ListTile(title: Text(l10n.tasksProgressEmpty)),
          ...rows,
        ],
      ),
    );
  }
}
