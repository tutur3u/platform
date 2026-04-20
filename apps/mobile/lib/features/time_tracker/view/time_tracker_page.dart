import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/utils/missed_entry_flow.dart';
import 'package:mobile/features/time_tracker/widgets/history_tab.dart';
import 'package:mobile/features/time_tracker/widgets/pomodoro_settings_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/stats_tab.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_add_entry_fab.dart';
import 'package:mobile/features/time_tracker/widgets/timer_tab.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

enum TimeTrackerSection { timer, history, stats }

const List<int> _weekdayByIndex = [
  DateTime.sunday,
  DateTime.monday,
  DateTime.tuesday,
  DateTime.wednesday,
  DateTime.thursday,
  DateTime.friday,
  DateTime.saturday,
];

int _resolvedFirstDayOfWeek(
  BuildContext context,
  CalendarSettingsCubit calendarSettingsCubit,
) {
  final localeCode = Localizations.localeOf(context).languageCode;
  final firstDayOfWeekIndex = calendarSettingsCubit.state.resolvedFirstDayIndex(
    localeCode,
  );
  return _weekdayByIndex[firstDayOfWeekIndex % 7];
}

class TimeTrackerPage extends StatelessWidget {
  const TimeTrackerPage({
    super.key,
    this.repository,
    this.initialSection = TimeTrackerSection.timer,
    this.initialStatsScope = TimeTrackerStatsScope.personal,
    this.initialHistoryDate,
    this.initialHistoryViewMode,
  });

  final ITimeTrackerRepository? repository;
  final TimeTrackerSection initialSection;
  final TimeTrackerStatsScope initialStatsScope;
  final DateTime? initialHistoryDate;
  final HistoryViewMode? initialHistoryViewMode;

  @override
  Widget build(BuildContext context) {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final userId = supabase.auth.currentUser?.id;

    return BlocProvider(
      create: (context) {
        final repo = repository ?? TimeTrackerRepository();
        return TimeTrackerCubit(
          repository: repo,
          initialState: wsId != null && userId != null
              ? TimeTrackerCubit.seedStateFor(
                  wsId: wsId,
                  userId: userId,
                )
              : null,
        );
      },
      child: _TimeTrackerView(
        initialSection: initialSection,
        initialStatsScope: initialStatsScope,
        initialHistoryDate: initialHistoryDate,
        initialHistoryViewMode: initialHistoryViewMode,
      ),
    );
  }
}

class _TimeTrackerView extends StatefulWidget {
  const _TimeTrackerView({
    required this.initialSection,
    required this.initialStatsScope,
    this.initialHistoryDate,
    this.initialHistoryViewMode,
  });

  final TimeTrackerSection initialSection;
  final TimeTrackerStatsScope initialStatsScope;
  final DateTime? initialHistoryDate;
  final HistoryViewMode? initialHistoryViewMode;

  @override
  State<_TimeTrackerView> createState() => _TimeTrackerViewState();
}

class _TimeTrackerViewState extends State<_TimeTrackerView> {
  late int _index;
  var _hasAppliedInitialHistoryContext = false;

  @override
  void initState() {
    super.initState();
    _index = widget.initialSection.index;
    _loadData();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(CacheWarmupCoordinator.instance.prewarmModule('timer'));
    });
  }

  @override
  void didUpdateWidget(_TimeTrackerView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialSection != oldWidget.initialSection) {
      setState(() {
        _index = widget.initialSection.index;
      });
    }

    final historyDateChanged =
        widget.initialHistoryDate != oldWidget.initialHistoryDate;
    final historyModeChanged =
        widget.initialHistoryViewMode != oldWidget.initialHistoryViewMode;
    if (historyDateChanged || historyModeChanged) {
      _hasAppliedInitialHistoryContext = false;
      _loadData();
    }
  }

  void _loadData() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final workspaceCubit = context.read<WorkspaceCubit>();
      final calendarSettingsCubit = context.read<CalendarSettingsCubit>();
      final timeTrackerCubit = context.read<TimeTrackerCubit>();
      final wsId = workspaceCubit.state.currentWorkspace?.id;
      final userId = supabase.auth.currentUser?.id;

      if (wsId != null) {
        await calendarSettingsCubit.loadWorkspacePreference(wsId);
        if (!mounted) return;
      }
      final firstDayOfWeek = _resolvedFirstDayOfWeek(
        context,
        calendarSettingsCubit,
      );

      if (!_hasAppliedInitialHistoryContext) {
        timeTrackerCubit.setHistoryContext(
          viewMode: widget.initialHistoryViewMode,
          anchorDate: widget.initialHistoryDate,
        );
        _hasAppliedInitialHistoryContext = true;
      }

      if (wsId == null || userId == null) {
        return;
      }
      unawaited(
        timeTrackerCubit.loadData(
          wsId,
          userId,
          firstDayOfWeek: firstDayOfWeek,
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final shellActionRegistration = ShellChromeActions(
      ownerId: 'time-tracker-settings',
      locations: const {
        Routes.timer,
        Routes.timerHistory,
        Routes.timerStats,
        Routes.timerManagement,
      },
      actions: [
        ShellActionSpec(
          id: 'time-tracker-settings',
          icon: Icons.settings_outlined,
          tooltip: context.l10n.timerPomodoroSettings,
          onPressed: () => _showPomodoroSettings(context),
        ),
      ],
    );

    return MultiBlocListener(
      listeners: [
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (prev, curr) =>
              prev.currentWorkspace?.id != curr.currentWorkspace?.id,
          listener: (context, wsState) async {
            final wsId = wsState.currentWorkspace?.id;
            final userId = context.read<AuthCubit>().state.user?.id;
            if (wsId != null && userId != null) {
              if (TimeTrackerCubit.seedStateFor(wsId: wsId, userId: userId) ==
                  null) {
                context.read<TimeTrackerCubit>().prepareForWorkspaceSwitch();
              }
              final calendarSettingsCubit = context
                  .read<CalendarSettingsCubit>();
              await calendarSettingsCubit.loadWorkspacePreference(wsId);
              if (!context.mounted) return;
              final firstDayOfWeek = _resolvedFirstDayOfWeek(
                context,
                calendarSettingsCubit,
              );
              unawaited(
                context.read<TimeTrackerCubit>().loadData(
                  wsId,
                  userId,
                  firstDayOfWeek: firstDayOfWeek,
                ),
              );
            }
          },
        ),
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id,
          listener: (context, authState) async {
            final wsId = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace
                ?.id;
            final userId = authState.user?.id;
            if (wsId == null || userId == null || userId.isEmpty) {
              return;
            }
            final calendarSettingsCubit = context.read<CalendarSettingsCubit>();
            await calendarSettingsCubit.loadWorkspacePreference(wsId);
            if (!context.mounted) return;
            final firstDayOfWeek = _resolvedFirstDayOfWeek(
              context,
              calendarSettingsCubit,
            );
            unawaited(
              context.read<TimeTrackerCubit>().loadData(
                wsId,
                userId,
                firstDayOfWeek: firstDayOfWeek,
                forceRefresh: true,
              ),
            );
          },
        ),
      ],
      child: shad.Scaffold(
        child: BlocBuilder<TimeTrackerCubit, TimeTrackerState>(
          buildWhen: (prev, curr) => prev.status != curr.status,
          builder: (context, state) {
            if (state.status == TimeTrackerStatus.loading &&
                !state.hasVisibleContent) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (state.status == TimeTrackerStatus.error &&
                !state.hasVisibleContent) {
              return _ErrorView(error: state.error);
            }

            return Stack(
              children: [
                shellActionRegistration,
                ResponsiveWrapper(
                  maxWidth: ResponsivePadding.maxContentWidth(
                    context.deviceClass,
                  ),
                  child: KeyedSubtree(
                    key: ValueKey<String>(
                      '${widget.initialSection.name}-'
                      '${widget.initialStatsScope.name}',
                    ),
                    child: _buildActiveSection(),
                  ),
                ),
                TimeTrackerAddEntryFab(
                  enabled: _canOpenAddEntryFab(context),
                  onPressed: () => _openMissedEntryDialog(context),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildActiveSection() {
    switch (_index) {
      case 0:
        return const TimerTab();
      case 1:
        return const HistoryTab();
      case 2:
        return StatsTab(initialScope: widget.initialStatsScope);
    }
    throw StateError('Unsupported time tracker section index: $_index');
  }

  Future<void> _openMissedEntryDialog(BuildContext context) async {
    final cubit = context.read<TimeTrackerCubit>();
    final wsId =
        context.read<WorkspaceCubit>().state.currentWorkspace?.id ?? '';
    final userId = supabase.auth.currentUser?.id ?? '';
    if (wsId.isEmpty || userId.isEmpty) {
      return;
    }

    await showMissedEntryDialogForTimeTrackerCubit(
      context,
      cubit: cubit,
      wsId: wsId,
      userId: userId,
    );
  }

  bool _canOpenAddEntryFab(BuildContext context) {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final userId = supabase.auth.currentUser?.id;
    return (wsId?.isNotEmpty ?? false) && (userId?.isNotEmpty ?? false);
  }

  void _showPomodoroSettings(BuildContext context) {
    final cubit = context.read<TimeTrackerCubit>();
    unawaited(
      showAdaptiveSheet<void>(
        useRootNavigator: true,
        context: context,
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
            onPressed: () async {
              final wsId =
                  context.read<WorkspaceCubit>().state.currentWorkspace?.id ??
                  '';
              final userId = supabase.auth.currentUser?.id ?? '';
              final calendarSettingsCubit = context
                  .read<CalendarSettingsCubit>();
              if (wsId.isNotEmpty) {
                await calendarSettingsCubit.loadWorkspacePreference(wsId);
                if (!context.mounted) return;
              }
              await context.read<TimeTrackerCubit>().loadData(
                wsId,
                userId,
                firstDayOfWeek: _resolvedFirstDayOfWeek(
                  context,
                  calendarSettingsCubit,
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
