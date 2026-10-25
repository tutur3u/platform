import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/sliver_responsive_cards.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/meet/meet_meeting.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/meet_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/calendar/utils/calendar_description_content.dart';
import 'package:mobile/features/dashboard/cubit/dashboard_layout_cubit.dart';
import 'package:mobile/features/mail/data/mail_access.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_suggestion.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/tasks/utils/task_board_navigation.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/order_editor_sheet.dart';
import 'package:mobile/widgets/staggered_entrance.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'dashboard_summary_cards.dart';
part 'dashboard_communication_cards.dart';

part 'dashboard_sections.dart';

part 'dashboard_rows.dart';
part 'dashboard_resource_cards.dart';
part 'dashboard_customization.dart';

class DashboardPage extends StatelessWidget {
  const DashboardPage({
    this.replayToken = 0,
    this.active = true,
    this.taskListCubit,
    this.calendarCubit,
    super.key,
  });

  final int replayToken;
  final bool active;

  /// Caller-owned data sources for render tests. When set, the page neither
  /// creates nor initially loads them; workspace and refresh flows still call
  /// their usual methods.
  @visibleForTesting
  final TaskListCubit? taskListCubit;
  @visibleForTesting
  final CalendarCubit? calendarCubit;

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(
          create: (_) {
            final cubit = DashboardLayoutCubit(
              settingsRepository: SettingsRepository(),
            );
            unawaited(cubit.load());
            return cubit;
          },
        ),
        if (taskListCubit case final cubit?)
          BlocProvider<TaskListCubit>.value(value: cubit)
        else
          BlocProvider(
            create: (context) {
              final workspace = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace;
              final cubit = TaskListCubit(
                taskRepository: TaskRepository(),
                initialState: workspace != null
                    ? TaskListCubit.seedStateFor(
                        wsId: workspace.id,
                        isPersonal: workspace.personal,
                      )
                    : null,
              );
              _loadTasksIfReady(context, cubit);
              return cubit;
            },
          ),
        if (calendarCubit case final cubit?)
          BlocProvider<CalendarCubit>.value(value: cubit)
        else
          BlocProvider(
            create: (context) {
              final wsId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              final cubit = CalendarCubit(
                calendarRepository: CalendarRepository(),
                initialState: wsId != null
                    ? CalendarCubit.seedStateForWorkspace(wsId)
                    : null,
              );
              _loadEventsIfReady(context, cubit);
              return cubit;
            },
          ),
      ],
      child: _DashboardView(replayToken: replayToken, active: active),
    );
  }

  void _loadTasksIfReady(BuildContext context, TaskListCubit cubit) {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    if (workspace == null) return;
    unawaited(
      cubit.loadTasks(
        wsId: workspace.id,
        isPersonal: workspace.personal,
        userId: context.read<AuthCubit>().state.user?.id,
      ),
    );
  }

  void _loadEventsIfReady(BuildContext context, CalendarCubit cubit) {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    if (workspace == null) return;
    unawaited(cubit.loadEvents(workspace.id));
  }
}

class _DashboardView extends StatefulWidget {
  const _DashboardView({required this.replayToken, required this.active});

  final int replayToken;
  final bool active;

  @override
  State<_DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<_DashboardView> {
  final _mailCardKey = GlobalKey<_DashboardMailCardState>();
  final _meetCardKey = GlobalKey<_DashboardMeetCardState>();
  final _financeCardKey = GlobalKey<_DashboardFinanceCardState>();
  final _notesCardKey = GlobalKey<_DashboardNotesCardState>();

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        MultiBlocListener(
          listeners: [
            BlocListener<WorkspaceCubit, WorkspaceState>(
              listenWhen: (previous, current) =>
                  previous.currentWorkspace?.id != current.currentWorkspace?.id,
              listener: (context, state) {
                final workspace = state.currentWorkspace;
                if (workspace == null) return;
                unawaited(
                  context.read<TaskListCubit>().loadTasks(
                    wsId: workspace.id,
                    isPersonal: workspace.personal,
                    userId: context.read<AuthCubit>().state.user?.id,
                  ),
                );
                unawaited(
                  context.read<CalendarCubit>().loadEvents(workspace.id),
                );
              },
            ),
            BlocListener<AuthCubit, AuthState>(
              listenWhen: (previous, current) =>
                  previous.user?.id != current.user?.id,
              listener: (context, state) {
                if (state.status != AuthStatus.authenticated ||
                    state.user == null) {
                  return;
                }
                final workspace = context
                    .read<WorkspaceCubit>()
                    .state
                    .currentWorkspace;
                if (workspace == null) return;
                unawaited(
                  context.read<TaskListCubit>().loadTasks(
                    wsId: workspace.id,
                    isPersonal: workspace.personal,
                    forceRefresh: true,
                    userId: state.user?.id,
                  ),
                );
                unawaited(
                  context.read<CalendarCubit>().loadEvents(
                    workspace.id,
                    forceRefresh: true,
                  ),
                );
              },
            ),
          ],
          child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
            builder: (context, workspaceState) {
              final workspace = workspaceState.currentWorkspace;
              if (workspace == null) {
                final isWorkspaceLoading =
                    workspaceState.status == WorkspaceStatus.initial ||
                    workspaceState.status == WorkspaceStatus.loading;
                if (isWorkspaceLoading) {
                  return const shad.Scaffold(
                    child: Center(child: NovaLoadingIndicator()),
                  );
                }

                return _workspaceUnavailableState(context, workspaceState);
              }

              return BlocBuilder<TaskListCubit, TaskListState>(
                builder: (context, taskState) {
                  return BlocBuilder<CalendarCubit, CalendarState>(
                    builder: (context, calendarState) {
                      final focusTasks = _focusTasks(taskState);
                      final upcomingEvents = _upcomingEvents(
                        calendarState.events,
                      );
                      return shad.Scaffold(
                        child: NovaRefreshIndicator(
                          onRefresh: () => _refresh(context, workspace),
                          child: CustomScrollView(
                            physics: const AlwaysScrollableScrollPhysics(
                              parent: BouncingScrollPhysics(),
                            ),
                            slivers: [
                              SliverAppPage(
                                kind: AppPageKind.root,
                                topInset: floatingShellHeaderInset(context),
                                sliver: SliverMainAxisGroup(
                                  slivers: [
                                    const SliverToBoxAdapter(
                                      child: DeviceMfaSuggestion(
                                        padding: EdgeInsets.only(
                                          bottom: AppLayout.sectionGap,
                                        ),
                                      ),
                                    ),
                                    SliverResponsiveCards(
                                      minColumnWidth: 340,
                                      spacing: AppLayout.sectionGap,
                                      leading: StaggeredEntrance(
                                        replayKey: widget.replayToken,
                                        child: const _HomeHeader(),
                                      ),
                                      children: _dashboardWidgets(
                                        context,
                                        workspace,
                                        taskState,
                                        calendarState,
                                        focusTasks,
                                        upcomingEvents,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
              );
            },
          ),
        ),
        ShellChromeActions(
          ownerId: 'home-dashboard',
          locations: widget.active ? const {Routes.home} : const {},
          actions: [
            ShellActionSpec(
              id: 'home-customize',
              icon: Icons.tune_rounded,
              tooltip: context.l10n.homeCustomize,
              onPressed: () => _showHomeCustomization(context),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _refresh(BuildContext context, Workspace workspace) async {
    await Future.wait([
      context.read<TaskListCubit>().loadTasks(
        wsId: workspace.id,
        isPersonal: workspace.personal,
        forceRefresh: true,
        userId: context.read<AuthCubit>().state.user?.id,
      ),
      context.read<CalendarCubit>().loadEvents(
        workspace.id,
        forceRefresh: true,
      ),
      if (_mailCardKey.currentState != null)
        _mailCardKey.currentState!._load(forceRefresh: true),
      if (_meetCardKey.currentState != null)
        _meetCardKey.currentState!._load(forceRefresh: true),
      if (_financeCardKey.currentState != null)
        _financeCardKey.currentState!._load(forceRefresh: true),
      if (_notesCardKey.currentState != null)
        _notesCardKey.currentState!._load(forceRefresh: true),
    ]);
  }

  Widget _workspaceUnavailableState(
    BuildContext context,
    WorkspaceState workspaceState,
  ) {
    final isError = workspaceState.status == WorkspaceStatus.error;
    return shad.Scaffold(
      child: AppPageBody(
        kind: AppPageKind.root,
        topInset: floatingShellHeaderInset(context),
        child: AppStateMessage(
          icon: isError ? LucideIcons.cloudOff : LucideIcons.layers,
          tone: isError ? AppTone.destructive : AppTone.neutral,
          title: isError
              ? context.l10n.commonSomethingWentWrong
              : context.l10n.workspaceSelectEmpty,
          message: isError ? context.l10n.homeSectionLoadFailed : null,
          actionLabel: isError ? null : context.l10n.workspaceSelectTitle,
          onAction: isError ? null : () => showWorkspacePickerSheet(context),
        ),
      ),
    );
  }

  List<UserTask> _focusTasks(TaskListState state) {
    final buckets = [state.overdueTasks, state.todayTasks, state.upcomingTasks];
    final seen = <String>{};
    final tasks = <UserTask>[];

    for (final bucket in buckets) {
      for (final task in bucket) {
        if (seen.add(task.id)) tasks.add(task);
        if (tasks.length == 3) return tasks;
      }
    }

    return tasks;
  }

  List<CalendarEvent> _upcomingEvents(List<CalendarEvent> events) {
    final now = DateTime.now();
    final end = now.add(const Duration(days: 7));

    final result =
        events
            .where(
              (event) =>
                  !event.isAllDay &&
                  event.startAt != null &&
                  !event.startAt!.isBefore(now) &&
                  event.startAt!.isBefore(end),
            )
            .toList()
          ..sort((a, b) => a.startAt!.compareTo(b.startAt!));

    return result.take(3).toList(growable: false);
  }
}
