import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_state.dart';
import 'package:mobile/features/time_tracker/utils/missed_entry_flow.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_filters.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_shared.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/threshold_settings_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_add_entry_fab.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_filter_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' show User;

part 'time_tracker_requests_actions.dart';
part 'time_tracker_requests_widgets.dart';

class TimeTrackerRequestsPage extends StatelessWidget {
  const TimeTrackerRequestsPage({
    super.key,
    this.repository,
    this.workspacePermissionsRepository,
    this.initialRequestId,
    this.initialStatusOverride,
  });

  final ITimeTrackerRepository? repository;
  final WorkspacePermissionsRepository? workspacePermissionsRepository;
  final String? initialRequestId;
  final String? initialStatusOverride;

  @override
  Widget build(BuildContext context) {
    final currentUserId = context.watch<AuthCubit>().state.user?.id;
    return RepositoryProvider<ITimeTrackerRepository>(
      create: (_) => repository ?? TimeTrackerRepository(),
      child: BlocProvider(
        key: ValueKey<String?>(currentUserId),
        create: (context) {
          return TimeTrackerRequestsCubit(
            repository: context.read<ITimeTrackerRepository>(),
          );
        },
        child: _RequestsView(
          key: ValueKey<String?>(currentUserId),
          workspacePermissionsRepository: workspacePermissionsRepository,
          initialRequestId: initialRequestId,
          initialStatusOverride: initialStatusOverride,
        ),
      ),
    );
  }
}

class _RequestsView extends StatefulWidget {
  const _RequestsView({
    super.key,
    this.workspacePermissionsRepository,
    this.initialRequestId,
    this.initialStatusOverride,
  });

  final WorkspacePermissionsRepository? workspacePermissionsRepository;
  final String? initialRequestId;
  final String? initialStatusOverride;

  @override
  State<_RequestsView> createState() => _RequestsViewState();
}

class _RequestsViewState extends State<_RequestsView> {
  static const String _statusChangeGracePeriodConfigId =
      'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES';

  TimeTrackerRequestStatusFilter _selectedFilter =
      TimeTrackerRequestStatusFilter.pending;
  late final WorkspacePermissionsRepository _workspacePermissionsRepository =
      widget.workspacePermissionsRepository ?? WorkspacePermissionsRepository();
  String? _permissionsWorkspaceId;
  bool _canManageRequests = false;
  bool _canManageThresholdSettings = false;
  String? _selectedUserId;
  List<WorkspaceUserOption> _availableRequestUsers =
      const <WorkspaceUserOption>[];
  int? _missedEntryDateThreshold;
  int _statusChangeGracePeriodMinutes = 0;
  bool _isThresholdLoading = false;
  bool _hasResolvedPermissions = false;
  int _permissionLoadToken = 0;
  int _requestLoadToken = 0;
  String? _pendingRouteRequestId;
  String? _handledRouteRequestId;
  final Map<String, int> _missedEntryDialogRequestVersionByWorkspace =
      <String, int>{};
  final Map<String, int> _thresholdSaveRequestVersionByWorkspace =
      <String, int>{};
  bool _didInitializeWorkspaceLoad = false;

  String? _currentUserId() => context.read<AuthCubit>().state.user?.id;

  @override
  void initState() {
    super.initState();
    _selectedFilter = _filterFromRoute(
      statusOverride: widget.initialStatusOverride,
      requestId: widget.initialRequestId,
    );
    _pendingRouteRequestId = _normalizedRouteRequestId(widget.initialRequestId);
  }

  @override
  void didUpdateWidget(covariant _RequestsView oldWidget) {
    super.didUpdateWidget(oldWidget);
    final nextRequestId = _normalizedRouteRequestId(widget.initialRequestId);
    final nextFilter = _filterFromRoute(
      statusOverride: widget.initialStatusOverride,
      requestId: widget.initialRequestId,
    );
    final routeChanged =
        nextRequestId != _pendingRouteRequestId ||
        nextFilter != _selectedFilter;
    if (!routeChanged) {
      return;
    }

    setState(() {
      _selectedFilter = nextFilter;
      _selectedUserId = null;
      _pendingRouteRequestId = nextRequestId;
      _handledRouteRequestId = null;
    });

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null || wsId.isEmpty) {
      return;
    }
    _requestLoadToken++;
    unawaited(_loadRequests(wsIdOverride: wsId, forceRefresh: true));
  }

  TimeTrackerRequestStatusFilter _filterFromRoute({
    required String? statusOverride,
    required String? requestId,
  }) {
    if (_normalizedRouteRequestId(requestId) != null) {
      return TimeTrackerRequestStatusFilter.all;
    }

    return switch (statusOverride?.trim().toLowerCase()) {
      'approved' => TimeTrackerRequestStatusFilter.approved,
      'rejected' => TimeTrackerRequestStatusFilter.rejected,
      'needs_info' || 'needsinfo' => TimeTrackerRequestStatusFilter.needsInfo,
      'all' => TimeTrackerRequestStatusFilter.all,
      _ => TimeTrackerRequestStatusFilter.pending,
    };
  }

  String? _normalizedRouteRequestId(String? requestId) {
    final trimmed = requestId?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return null;
    }
    return trimmed;
  }

  String? _requestUserFilterId() {
    if (_canManageRequests) {
      return _selectedUserId;
    }
    return _currentUserId();
  }

  String _statusOverrideForFilter(TimeTrackerRequestStatusFilter filter) {
    if (filter == TimeTrackerRequestStatusFilter.all) {
      return 'all';
    }

    return approvalStatusToString(statusFromFilter(filter)!);
  }

  void _applyState(VoidCallback updater) {
    if (!mounted) {
      return;
    }
    setState(updater);
  }

  Future<void> _loadRequests({
    String? wsIdOverride,
    bool forceRefresh = false,
  }) async {
    final wsId =
        wsIdOverride ??
        context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null || wsId.isEmpty) {
      context.read<TimeTrackerRequestsCubit>().reset();
      return;
    }

    final localToken = ++_requestLoadToken;

    await context.read<TimeTrackerRequestsCubit>().loadRequests(
      wsId,
      userId: _requestUserFilterId(),
      statusOverride: _statusOverrideForFilter(_selectedFilter),
      forceRefresh: forceRefresh,
    );

    if (!mounted) {
      return;
    }

    final currentWsId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (localToken != _requestLoadToken || currentWsId != wsId) {
      return;
    }
  }

  void _applyFilter(
    String wsId,
    TimeTrackerRequestStatusFilter filter,
    String? userId,
  ) {
    setState(() {
      _selectedFilter = filter;
      _selectedUserId = _canManageRequests ? userId : null;
    });

    final cubit = context.read<TimeTrackerRequestsCubit>();
    unawaited(
      cubit.filterByStatus(
        statusFromFilter(filter),
        wsId,
        userId: _requestUserFilterId(),
        statusOverride: _statusOverrideForFilter(filter),
      ),
    );
  }

  void _openFilters(String wsId) {
    unawaited(
      showFilterSheet(
        context,
        selectedFilter: _selectedFilter,
        selectedUserId: _selectedUserId,
        availableRequestUsers: _availableRequestUsers,
        canManageRequests: _canManageRequests,
        onApply: (filter, userId) => _applyFilter(wsId, filter, userId),
      ),
    );
  }

  Future<void> _maybeOpenRequestFromRoute(
    TimeTrackerRequestsState state,
  ) async {
    final requestId = _pendingRouteRequestId;
    if (requestId == null || requestId == _handledRouteRequestId) {
      return;
    }
    if (state.status == TimeTrackerRequestsStatus.initial ||
        state.status == TimeTrackerRequestsStatus.loading) {
      return;
    }

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    _handledRouteRequestId = requestId;

    final existing = state.requests
        .where((request) => request.id == requestId)
        .firstOrNull;
    final request =
        existing ??
        await context.read<ITimeTrackerRepository>().getRequestById(
          wsId,
          requestId,
        );

    if (!mounted) {
      return;
    }
    if (request == null) {
      final toastContext = Navigator.of(context, rootNavigator: true).context;
      if (!toastContext.mounted) {
        return;
      }
      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.timerRequestsOpenFailed),
        ),
      );
      return;
    }

    await _showRequestDetail(context, request);
  }

  List<ShellActionSpec> _shellActions(BuildContext context, String wsId) {
    final l10n = context.l10n;
    final showSettingsAction =
        !_hasResolvedPermissions || _canManageThresholdSettings;

    return [
      ShellActionSpec(
        id: 'requests-filter',
        icon: shad.LucideIcons.filter,
        tooltip: l10n.timerRequestsFilterTitle,
        highlighted: hasActiveFilters(
          selectedFilter: _selectedFilter,
          canManageRequests: _canManageRequests,
          selectedUserId: _selectedUserId,
        ),
        enabled: wsId.isNotEmpty,
        onPressed: () => _openFilters(wsId),
      ),
      if (showSettingsAction)
        ShellActionSpec(
          id: 'requests-settings',
          icon: shad.LucideIcons.settings2,
          tooltip: l10n.settingsTitle,
          enabled:
              _hasResolvedPermissions &&
              _canManageThresholdSettings &&
              !_isThresholdLoading,
          onPressed: () => unawaited(_showThresholdSettingsDialog()),
        ),
    ];
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (_didInitializeWorkspaceLoad && wsId == _permissionsWorkspaceId) {
      return;
    }

    _didInitializeWorkspaceLoad = true;
    _permissionsWorkspaceId = wsId;
    _requestLoadToken++;
    unawaited(_loadPermissionsAndThreshold(wsId));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(CacheWarmupCoordinator.instance.prewarmModule('timer'));
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final workspaceState = context.watch<WorkspaceCubit>().state;
    final wsId = workspaceState.currentWorkspace?.id;

    return MultiBlocListener(
      listeners: [
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) {
            final nextWsId = state.currentWorkspace?.id;
            _permissionsWorkspaceId = nextWsId;
            _requestLoadToken++;
            unawaited(_loadPermissionsAndThreshold(nextWsId));
          },
        ),
        BlocListener<AuthCubit, AuthState>(
          listenWhen: (previous, current) =>
              previous.user?.id != current.user?.id,
          listener: (context, state) {
            _requestLoadToken++;
            context.read<TimeTrackerRequestsCubit>().reset();
            final wsId = context
                .read<WorkspaceCubit>()
                .state
                .currentWorkspace
                ?.id;
            if (wsId == null || wsId.isEmpty) {
              return;
            }
            unawaited(
              _loadPermissionsAndThreshold(
                wsId,
                forceRefreshRequests: true,
              ),
            );
          },
        ),
        BlocListener<TimeTrackerRequestsCubit, TimeTrackerRequestsState>(
          listenWhen: (previous, current) =>
              previous.status != current.status ||
              previous.requests != current.requests,
          listener: (context, state) {
            unawaited(_maybeOpenRequestFromRoute(state));
          },
        ),
      ],
      child: shad.Scaffold(
        child: Stack(
          children: [
            if (wsId != null && wsId.isNotEmpty)
              ShellChromeActions(
                ownerId: 'time-tracker-requests',
                locations: const {Routes.timerRequests},
                actions: _shellActions(context, wsId),
              ),
            ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: Builder(
                builder: (context) {
                  if (workspaceState.status == WorkspaceStatus.initial ||
                      workspaceState.status == WorkspaceStatus.loading) {
                    return const Center(
                      child: shad.CircularProgressIndicator(),
                    );
                  }

                  if (workspaceState.currentWorkspace == null) {
                    return Center(
                      child: Text(
                        l10n.assistantSelectWorkspace,
                        style: shad.Theme.of(context).typography.textMuted,
                      ),
                    );
                  }

                  return BlocBuilder<
                    TimeTrackerRequestsCubit,
                    TimeTrackerRequestsState
                  >(
                    builder: (context, state) {
                      if ((state.status == TimeTrackerRequestsStatus.initial ||
                              state.status ==
                                  TimeTrackerRequestsStatus.loading) &&
                          state.requests.isEmpty) {
                        return const Center(
                          child: shad.CircularProgressIndicator(),
                        );
                      }

                      if (state.status == TimeTrackerRequestsStatus.error &&
                          state.requests.isEmpty) {
                        return Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                shad.LucideIcons.circleAlert,
                                size: 48,
                                color: shad.Theme.of(
                                  context,
                                ).colorScheme.destructive,
                              ),
                              const shad.Gap(16),
                              Text(state.error ?? 'Error'),
                              const shad.Gap(16),
                              shad.SecondaryButton(
                                onPressed: () => unawaited(_loadRequests()),
                                child: Text(l10n.commonRetry),
                              ),
                            ],
                          ),
                        );
                      }

                      return RefreshIndicator(
                        onRefresh: () => _loadRequests(forceRefresh: true),
                        child: state.requests.isEmpty
                            ? ListView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.only(
                                  top: 8,
                                  bottom: 96,
                                ),
                                children: [
                                  if (_showMetaRow(state))
                                    Padding(
                                      padding: const EdgeInsets.fromLTRB(
                                        16,
                                        4,
                                        16,
                                        16,
                                      ),
                                      child: _RequestsMetaRow(
                                        requestCount: 0,
                                        hasActiveFilters: hasActiveFilters(
                                          selectedFilter: _selectedFilter,
                                          canManageRequests: _canManageRequests,
                                          selectedUserId: _selectedUserId,
                                        ),
                                        activeFilterLabel: _selectedFilterLabel(
                                          context,
                                        ),
                                      ),
                                    ),
                                  Padding(
                                    padding: EdgeInsets.only(
                                      top: _showMetaRow(state) ? 24 : 48,
                                    ),
                                    child: Center(
                                      child: Text(
                                        l10n.timerNoSessions,
                                        style: shad.Theme.of(
                                          context,
                                        ).typography.textMuted,
                                      ),
                                    ),
                                  ),
                                ],
                              )
                            : ListView.builder(
                                itemCount:
                                    state.requests.length +
                                    (_showMetaRow(state) ? 1 : 0),
                                padding: const EdgeInsets.only(
                                  top: 8,
                                  bottom: 96,
                                ),
                                itemBuilder: (context, index) {
                                  final showMetaRow = _showMetaRow(state);
                                  if (showMetaRow && index == 0) {
                                    return Padding(
                                      padding: const EdgeInsets.fromLTRB(
                                        16,
                                        4,
                                        16,
                                        16,
                                      ),
                                      child: _RequestsMetaRow(
                                        requestCount: state.requests.length,
                                        hasActiveFilters: hasActiveFilters(
                                          selectedFilter: _selectedFilter,
                                          canManageRequests: _canManageRequests,
                                          selectedUserId: _selectedUserId,
                                        ),
                                        activeFilterLabel: _selectedFilterLabel(
                                          context,
                                        ),
                                      ),
                                    );
                                  }
                                  final request = state
                                      .requests[index - (showMetaRow ? 1 : 0)];
                                  return _RequestTile(
                                    request: request,
                                    onTap: () =>
                                        _showRequestDetail(context, request),
                                  );
                                },
                              ),
                      );
                    },
                  );
                },
              ),
            ),
            TimeTrackerAddEntryFab(
              enabled: _canOpenAddEntryFab(),
              onPressed: _openMissedEntryDialog,
            ),
          ],
        ),
      ),
    );
  }

  String _selectedFilterLabel(BuildContext context) {
    final l10n = context.l10n;
    return switch (_selectedFilter) {
      TimeTrackerRequestStatusFilter.all => l10n.timerRequestsFilterAllStatuses,
      TimeTrackerRequestStatusFilter.pending => l10n.timerRequestPending,
      TimeTrackerRequestStatusFilter.approved => l10n.timerRequestApproved,
      TimeTrackerRequestStatusFilter.rejected => l10n.timerRequestRejected,
      TimeTrackerRequestStatusFilter.needsInfo => l10n.timerRequestNeedsInfo,
    };
  }

  bool _showMetaRow(TimeTrackerRequestsState state) {
    return state.requests.isNotEmpty ||
        hasActiveFilters(
          selectedFilter: _selectedFilter,
          canManageRequests: _canManageRequests,
          selectedUserId: _selectedUserId,
        );
  }

  bool _canOpenAddEntryFab() {
    final wsId = _permissionsWorkspaceId;
    final userId = _currentUserId();
    return (wsId?.isNotEmpty ?? false) && (userId?.isNotEmpty ?? false);
  }
}
