import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/responsive/sliver_responsive_cards.dart';
import 'package:mobile/core/router/routes.dart';
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
import 'package:mobile/features/apps/widgets/app_card_palette.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/dashboard/cubit/dashboard_layout_cubit.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/mail/data/mail_access.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/notes/note_repository.dart';
import 'package:mobile/features/security/device_mfa/device_mfa_suggestion.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
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
  const DashboardPage({this.replayToken = 0, this.active = true, super.key});

  final int replayToken;
  final bool active;

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

const _dashboardPaletteOrder = ['crm', 'calendar', 'drive', 'finance'];

String _dashboardModuleId(int index) =>
    _dashboardPaletteOrder[index % _dashboardPaletteOrder.length];

AppCardPalette _dashboardPalette(BuildContext context, int index) =>
    AppCardPalette.resolve(
      context,
      index: index,
      moduleId: _dashboardModuleId(index),
    );

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
    const workspacePicker = _DashboardWorkspacePickerCard();
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
                          child: SafeArea(
                            top: false,
                            bottom: false,
                            child: ResponsiveWrapper(
                              maxWidth: ResponsivePadding.rootContentWidth(
                                context.deviceClass,
                              ),
                              child: CustomScrollView(
                                physics: const AlwaysScrollableScrollPhysics(
                                  parent: BouncingScrollPhysics(),
                                ),
                                slivers: [
                                  SliverToBoxAdapter(
                                    child: SizedBox(
                                      height: floatingShellHeaderInset(context),
                                    ),
                                  ),
                                  const SliverToBoxAdapter(
                                    child: DeviceMfaSuggestion(),
                                  ),
                                  SliverPadding(
                                    padding: EdgeInsets.fromLTRB(
                                      ResponsivePadding.horizontal(
                                        context.deviceClass,
                                      ),
                                      10,
                                      ResponsivePadding.horizontal(
                                        context.deviceClass,
                                      ),
                                      24 + MediaQuery.paddingOf(context).bottom,
                                    ),
                                    sliver: SliverResponsiveCards(
                                      leading: StaggeredEntrance(
                                        replayKey: widget.replayToken,
                                        child: workspacePicker,
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
                                  ),
                                ],
                              ),
                            ),
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
    final theme = Theme.of(context);

    return shad.Scaffold(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: _EmptyHint(
            title: isError
                ? context.l10n.commonSomethingWentWrong
                : context.l10n.workspaceSelectEmpty,
            description: isError
                ? context.l10n.commonSomethingWentWrong
                : context.l10n.workspaceSelectTitle,
            icon: isError ? Icons.cloud_off_outlined : Icons.workspaces_outline,
            tone: isError
                ? _Tone(
                    background: theme.colorScheme.errorContainer.withValues(
                      alpha: 0.38,
                    ),
                    border: theme.colorScheme.error.withValues(alpha: 0.16),
                    foreground: theme.colorScheme.error,
                  )
                : _Tone(
                    background: theme.colorScheme.surfaceContainer,
                    border: theme.colorScheme.outline.withValues(alpha: 0.22),
                    foreground: theme.colorScheme.onSurface,
                  ),
          ),
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
