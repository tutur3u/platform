import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold, AppBar;
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
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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

class _TimeTrackerView extends StatefulWidget {
  const _TimeTrackerView();

  @override
  State<_TimeTrackerView> createState() => _TimeTrackerViewState();
}

class _TimeTrackerViewState extends State<_TimeTrackerView> {
  int _index = 0;

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
            return shad.Scaffold(
              headers: [
                shad.AppBar(title: Text(l10n.timerTitle)),
              ],
              child: const Center(child: shad.CircularProgressIndicator()),
            );
          }

          if (state.status == TimeTrackerStatus.error) {
            return shad.Scaffold(
              headers: [
                shad.AppBar(title: Text(l10n.timerTitle)),
              ],
              child: _ErrorView(error: state.error),
            );
          }

          return shad.Scaffold(
            headers: [
              shad.AppBar(
                title: Text(l10n.timerTitle),
                trailing: [
                  shad.IconButton.ghost(
                    onPressed: () {
                      shad.showDropdown<void>(
                        context: context,
                        builder: (context) {
                          return shad.DropdownMenu(
                            children: [
                              shad.MenuButton(
                                leading: const Icon(
                                  Icons.timer_outlined,
                                  size: 16,
                                ),
                                onPressed: _showPomodoroSettings,
                                child: Text(l10n.timerPomodoro),
                              ),
                              if (!isPersonal) ...[
                                shad.MenuButton(
                                  leading: const Icon(
                                    Icons.pending_actions,
                                    size: 16,
                                  ),
                                  onPressed: (context) =>
                                      context.push(Routes.timerRequests),
                                  child: Text(l10n.timerRequestsTitle),
                                ),
                                shad.MenuButton(
                                  leading: const Icon(
                                    Icons.admin_panel_settings,
                                    size: 16,
                                  ),
                                  onPressed: (context) =>
                                      context.push(Routes.timerManagement),
                                  child: Text(l10n.timerManagementTitle),
                                ),
                              ],
                            ],
                          );
                        },
                      );
                    },
                    icon: const Icon(Icons.more_vert),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: shad.Tabs(
                  index: _index,
                  onChanged: (index) => setState(() => _index = index),
                  children: [
                    shad.TabItem(child: Text(l10n.navTimer)),
                    shad.TabItem(child: Text(l10n.timerHistory)),
                    shad.TabItem(child: Text(l10n.timerStatsTitle)),
                  ],
                ),
              ),
            ],
            child: IndexedStack(
              index: _index,
              children: [
                TimerTab(onSeeAll: () => setState(() => _index = 1)),
                const HistoryTab(),
                const StatsTab(),
              ],
            ),
          );
        },
      ),
    );
  }

  void _showPomodoroSettings(BuildContext context) {
    final cubit = context.read<TimeTrackerCubit>();
    unawaited(
      shad.openDrawer<void>(
        context: context,
        position: shad.OverlayPosition.bottom,
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
            color: shad.Theme.of(context).colorScheme.destructive,
          ),
          const shad.Gap(16),
          Text(
            error ?? l10n.timerTitle,
            textAlign: TextAlign.center,
          ),
          const shad.Gap(16),
          shad.SecondaryButton(
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
