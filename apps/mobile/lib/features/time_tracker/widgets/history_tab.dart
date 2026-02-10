import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/edit_session_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/session_tile.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HistoryTab extends StatelessWidget {
  const HistoryTab({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
      builder: (context, state) {
        final l10n = context.l10n;
        final sessions = state.recentSessions;
        final theme = shad.Theme.of(context);

        if (sessions.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.history,
                  size: 48,
                  color: theme.colorScheme.mutedForeground,
                ),
                const shad.Gap(16),
                Text(
                  l10n.timerNoSessions,
                  style: theme.typography.textMuted,
                ),
              ],
            ),
          );
        }

        // Group sessions by day
        final grouped = _groupByDay(sessions);

        return RefreshIndicator(
          onRefresh: () async {
            final wsId =
                context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
            final userId = supabase.auth.currentUser?.id ?? '';
            await context.read<TimeTrackerCubit>().loadData(wsId, userId);
          },
          child: ListView.builder(
            padding: const EdgeInsets.only(bottom: 32),
            itemCount: grouped.length,
            itemBuilder: (context, index) {
              final entry = grouped[index];
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                    child: Text(
                      entry.label,
                      style: theme.typography.small.copyWith(
                        color: theme.colorScheme.mutedForeground,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  ...entry.sessions.map(
                    (session) => SessionTile(
                      session: session,
                      onEdit: () => _showEditDialog(context, session),
                      onDelete: () => _deleteSession(context, session.id),
                    ),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }

  List<_DayGroup> _groupByDay(List<TimeTrackingSession> sessions) {
    final dateFmt = DateFormat.yMMMEd();
    final groups = <String, List<TimeTrackingSession>>{};

    for (final session in sessions) {
      final date = session.startTime?.toLocal() ?? DateTime.now();
      final key = '${date.year}-${date.month}-${date.day}';
      groups.putIfAbsent(key, () => []).add(session);
    }

    return groups.entries.map((e) {
      final first = e.value.first;
      final date = first.startTime?.toLocal() ?? DateTime.now();
      return _DayGroup(
        label: dateFmt.format(date),
        sessions: e.value,
      );
    }).toList();
  }

  void _showEditDialog(BuildContext context, TimeTrackingSession session) {
    final cubit = context.read<TimeTrackerCubit>();
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';

    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => EditSessionDialog(
          session: session,
          categories: cubit.state.categories,
          onSave:
              ({
                title,
                description,
                categoryId,
                startTime,
                endTime,
              }) {
                unawaited(
                  cubit.editSession(
                    session.id,
                    wsId,
                    title: title,
                    description: description,
                    categoryId: categoryId,
                    startTime: startTime,
                    endTime: endTime,
                  ),
                );
              },
        ),
      ),
    );
  }

  void _deleteSession(BuildContext context, String sessionId) {
    final cubit = context.read<TimeTrackerCubit>();
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    final userId = supabase.auth.currentUser?.id ?? '';
    unawaited(cubit.deleteSession(sessionId, wsId, userId));
  }
}

class _DayGroup {
  const _DayGroup({required this.label, required this.sessions});
  final String label;
  final List<TimeTrackingSession> sessions;
}
