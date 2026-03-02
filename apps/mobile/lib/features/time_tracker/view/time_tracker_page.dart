import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/apps/widgets/apps_back_button.dart';
import 'package:mobile/features/shell/view/avatar_dropdown.dart';
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

enum TimeTrackerSection { timer, history, stats }

int _firstDayOfWeek(BuildContext context) {
  const weekdayByIndex = [
    DateTime.sunday,
    DateTime.monday,
    DateTime.tuesday,
    DateTime.wednesday,
    DateTime.thursday,
    DateTime.friday,
    DateTime.saturday,
  ];
  final firstDayOfWeekIndex = MaterialLocalizations.of(
    context,
  ).firstDayOfWeekIndex;
  return weekdayByIndex[firstDayOfWeekIndex % 7];
}

class TimeTrackerPage extends StatelessWidget {
  const TimeTrackerPage({
    super.key,
    this.repository,
    this.initialSection = TimeTrackerSection.timer,
  });

  final ITimeTrackerRepository? repository;
  final TimeTrackerSection initialSection;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final repo = repository ?? TimeTrackerRepository();
        return TimeTrackerCubit(
          repository: repo,
        );
      },
      child: _TimeTrackerView(initialSection: initialSection),
    );
  }
}

class _TimeTrackerView extends StatefulWidget {
  const _TimeTrackerView({required this.initialSection});

  final TimeTrackerSection initialSection;

  @override
  State<_TimeTrackerView> createState() => _TimeTrackerViewState();
}

class _TimeTrackerViewState extends State<_TimeTrackerView> {
  late final int _index = widget.initialSection.index;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final workspaceCubit = context.read<WorkspaceCubit>();
      final timeTrackerCubit = context.read<TimeTrackerCubit>();
      final wsId = workspaceCubit.state.currentWorkspace?.id;
      final userId = supabase.auth.currentUser?.id;
      if (wsId != null && userId != null) {
        unawaited(
          timeTrackerCubit.loadData(
            wsId,
            userId,
            firstDayOfWeek: _firstDayOfWeek(context),
          ),
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (prev, curr) =>
          prev.currentWorkspace?.id != curr.currentWorkspace?.id,
      listener: (context, wsState) {
        final wsId = wsState.currentWorkspace?.id;
        final userId = supabase.auth.currentUser?.id;
        if (wsId != null && userId != null) {
          unawaited(
            context.read<TimeTrackerCubit>().loadData(
              wsId,
              userId,
              firstDayOfWeek: _firstDayOfWeek(context),
            ),
          );
        }
      },
      child: BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
        buildWhen: (prev, curr) => prev.status != curr.status,
        builder: (context, state) {
          if (state.status == TimeTrackerStatus.loading) {
            return shad.Scaffold(
              headers: [
                shad.AppBar(
                  leading: const [AppsBackButton()],
                  title: Text(l10n.timerTitle),
                  trailing: const [AvatarDropdown()],
                ),
              ],
              child: const Center(child: shad.CircularProgressIndicator()),
            );
          }

          if (state.status == TimeTrackerStatus.error) {
            return shad.Scaffold(
              headers: [
                shad.AppBar(
                  leading: const [AppsBackButton()],
                  title: Text(l10n.timerTitle),
                  trailing: const [AvatarDropdown()],
                ),
              ],
              child: _ErrorView(error: state.error),
            );
          }

          return shad.Scaffold(
            headers: [
              shad.AppBar(
                leading: const [AppsBackButton()],
                title: Text(l10n.timerTitle),
                trailing: [
                  const AvatarDropdown(),
                  shad.IconButton.ghost(
                    onPressed: () => _showPomodoroSettings(context),
                    icon: const Icon(Icons.settings_outlined),
                  ),
                ],
              ),
            ],
            child: ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: IndexedStack(
                index: _index,
                children: [
                  TimerTab(onSeeAll: () => context.go(Routes.timerHistory)),
                  const HistoryTab(),
                  const StatsTab(),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _showPomodoroSettings(BuildContext context) {
    final cubit = context.read<TimeTrackerCubit>();
    showAdaptiveDrawer(
      context: context,
      builder: (_) => PomodoroSettingsDialog(
        settings: cubit.state.pomodoroSettings,
        onSave: (settings) => unawaited(cubit.updatePomodoroSettings(settings)),
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
                context.read<TimeTrackerCubit>().loadData(
                  wsId,
                  userId,
                  firstDayOfWeek: _firstDayOfWeek(context),
                ),
              );
            },
            child: Text(l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}
