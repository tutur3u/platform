import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/history_tab.dart';
import 'package:mobile/features/time_tracker/widgets/pomodoro_settings_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/stats_tab.dart';
import 'package:mobile/features/time_tracker/widgets/timer_tab.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

class TimeTrackerPage extends StatelessWidget {
  const TimeTrackerPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final cubit = TimeTrackerCubit(
          repository: TimeTrackerRepository(),
        );
        final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
        final userId = supabase.auth.currentUser?.id;
        if (ws != null && userId != null) {
          unawaited(cubit.loadData(ws.id, userId));
        }
        return cubit;
      },
      child: const _TimeTrackerView(),
    );
  }
}

class _TimeTrackerView extends StatelessWidget {
  const _TimeTrackerView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isPersonal =
        context.watch<WorkspaceCubit>().state.currentWorkspace?.personal ??
        true;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (prev, curr) =>
          prev.currentWorkspace?.id != curr.currentWorkspace?.id,
      listener: (context, wsState) {
        final wsId = wsState.currentWorkspace?.id;
        final userId = supabase.auth.currentUser?.id;
        if (wsId != null && userId != null) {
          unawaited(
            context.read<TimeTrackerCubit>().loadData(wsId, userId),
          );
        }
      },
      child: BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
        buildWhen: (prev, curr) => prev.status != curr.status,
        builder: (context, state) {
          if (state.status == TimeTrackerStatus.loading) {
            return Scaffold(
              appBar: AppBar(title: Text(l10n.timerTitle)),
              body: const Center(child: CircularProgressIndicator()),
            );
          }

          if (state.status == TimeTrackerStatus.error) {
            return Scaffold(
              appBar: AppBar(title: Text(l10n.timerTitle)),
              body: _ErrorView(error: state.error),
            );
          }

          return DefaultTabController(
            length: 3,
            child: Scaffold(
              appBar: AppBar(
                title: Text(l10n.timerTitle),
                actions: [
                  PopupMenuButton<String>(
                    icon: const Icon(Icons.more_vert),
                    onSelected: (value) =>
                        _handleMenuAction(context, value, isPersonal),
                    itemBuilder: (context) => [
                      PopupMenuItem(
                        value: 'pomodoro',
                        child: ListTile(
                          leading: const Icon(Icons.timer_outlined),
                          title: Text(l10n.timerPomodoro),
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                      ),
                      if (!isPersonal)
                        PopupMenuItem(
                          value: 'requests',
                          child: ListTile(
                            leading: const Icon(Icons.pending_actions),
                            title: Text(l10n.timerRequestsTitle),
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                      if (!isPersonal)
                        PopupMenuItem(
                          value: 'management',
                          child: ListTile(
                            leading: const Icon(Icons.admin_panel_settings),
                            title: Text(l10n.timerManagementTitle),
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                    ],
                  ),
                ],
                bottom: TabBar(
                  tabs: [
                    Tab(text: l10n.navTimer),
                    Tab(text: l10n.timerHistory),
                    Tab(text: l10n.timerStatsTitle),
                  ],
                ),
              ),
              body: const TabBarView(
                children: [
                  TimerTab(),
                  HistoryTab(),
                  StatsTab(),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _handleMenuAction(
    BuildContext context,
    String action,
    bool isPersonal,
  ) {
    switch (action) {
      case 'pomodoro':
        _showPomodoroSettings(context);
      case 'requests':
        unawaited(context.push(Routes.timerRequests));
      case 'management':
        unawaited(context.push(Routes.timerManagement));
    }
  }

  void _showPomodoroSettings(BuildContext context) {
    final cubit = context.read<TimeTrackerCubit>();
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => PomodoroSettingsDialog(
          settings: cubit.state.pomodoroSettings,
          onSave: (settings) =>
              unawaited(cubit.updatePomodoroSettings(settings)),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: Theme.of(context).colorScheme.error,
          ),
          const SizedBox(height: 16),
          Text(
            error ?? l10n.timerTitle,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          FilledButton.tonal(
            onPressed: () {
              final wsId =
                  context.read<WorkspaceCubit>().state.currentWorkspace?.id ??
                  '';
              final userId = supabase.auth.currentUser?.id ?? '';
              unawaited(
                context.read<TimeTrackerCubit>().loadData(wsId, userId),
              );
            },
            child: Text(l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}
