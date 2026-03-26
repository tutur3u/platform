import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_state.dart';
import 'package:mobile/features/time_tracker/utils/missed_entry_flow.dart';
import 'package:mobile/features/time_tracker/view/time_tracker_filters.dart';
import 'package:mobile/features/time_tracker/widgets/request_detail_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/threshold_settings_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_filter_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' show User;

part 'time_tracker_requests_actions.dart';
part 'time_tracker_requests_widgets.dart';

class TimeTrackerRequestsPage extends StatelessWidget {
  const TimeTrackerRequestsPage({super.key, this.repository});

  final ITimeTrackerRepository? repository;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider<ITimeTrackerRepository>(
      create: (_) => repository ?? TimeTrackerRepository(),
      child: BlocProvider(
        create: (context) {
          return TimeTrackerRequestsCubit(
            repository: context.read<ITimeTrackerRepository>(),
          );
        },
        child: const _RequestsView(),
      ),
    );
  }
}

class _RequestsView extends StatefulWidget {
  const _RequestsView();

  @override
  State<_RequestsView> createState() => _RequestsViewState();
}

class _RequestsViewState extends State<_RequestsView> {
  static const String _statusChangeGracePeriodConfigId =
      'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES';

  TimeTrackerRequestStatusFilter _selectedFilter =
      TimeTrackerRequestStatusFilter.pending;
  final WorkspacePermissionsRepository _workspacePermissionsRepository =
      WorkspacePermissionsRepository();
  String? _permissionsWorkspaceId;
  bool _canManageRequests = false;
  bool _canManageThresholdSettings = false;
  String? _selectedUserId;
  List<WorkspaceUserOption> _availableRequestUsers =
      const <WorkspaceUserOption>[];
  int? _missedEntryDateThreshold;
  int _statusChangeGracePeriodMinutes = 0;
  bool _isThresholdLoading = false;
  int _permissionLoadToken = 0;
  int _requestLoadToken = 0;
  bool _didInitializeWorkspaceLoad = false;

  String? _currentUserId() => context.read<AuthCubit>().state.user?.id;

  String? _requestUserFilterId() {
    if (_canManageRequests) {
      return _selectedUserId;
    }
    return _currentUserId();
  }

  void _applyState(VoidCallback updater) {
    if (!mounted) {
      return;
    }
    setState(updater);
  }

  Future<void> _loadRequests({String? wsIdOverride}) async {
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
      statusOverride: _selectedFilter == TimeTrackerRequestStatusFilter.all
          ? 'all'
          : approvalStatusToString(statusFromFilter(_selectedFilter)!),
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
    context.read<TimeTrackerRequestsCubit>().reset();
    unawaited(_loadPermissionsAndThreshold(wsId));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final workspaceState = context.watch<WorkspaceCubit>().state;
    final wsId = workspaceState.currentWorkspace?.id;

    return shad.Scaffold(
      headers: [
        MobileSectionAppBar(
          title: l10n.timerRequestsTitle,
          actions: [
            shad.IconButton.ghost(
              onPressed: wsId == null || wsId.isEmpty
                  ? null
                  : () => unawaited(
                      showFilterSheet(
                        context,
                        selectedFilter: _selectedFilter,
                        selectedUserId: _selectedUserId,
                        availableRequestUsers: _availableRequestUsers,
                        canManageRequests: _canManageRequests,
                        onApply: (filter, userId) {
                          setState(() {
                            _selectedFilter = filter;
                            _selectedUserId = _canManageRequests
                                ? userId
                                : null;
                          });

                          final cubit = context
                              .read<TimeTrackerRequestsCubit>();
                          unawaited(
                            cubit.filterByStatus(
                              statusFromFilter(filter),
                              wsId,
                              userId: _requestUserFilterId(),
                              statusOverride:
                                  filter == TimeTrackerRequestStatusFilter.all
                                  ? 'all'
                                  : approvalStatusToString(
                                      statusFromFilter(filter)!,
                                    ),
                            ),
                          );
                        },
                      ),
                    ),
              icon: Icon(
                Icons.filter_alt_outlined,
                color:
                    hasActiveFilters(
                      selectedFilter: _selectedFilter,
                      canManageRequests: _canManageRequests,
                      selectedUserId: _selectedUserId,
                    )
                    ? shad.Theme.of(context).colorScheme.primary
                    : null,
              ),
            ),
            if (_canManageThresholdSettings)
              shad.IconButton.ghost(
                onPressed: _isThresholdLoading
                    ? null
                    : () => unawaited(_showThresholdSettingsDialog()),
                icon: _isThresholdLoading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: shad.CircularProgressIndicator(),
                      )
                    : const Icon(Icons.settings_outlined),
              ),
          ],
        ),
      ],
      child: Stack(
        children: [
          ResponsiveWrapper(
            maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
            child: Builder(
              builder: (context) {
                if (workspaceState.status == WorkspaceStatus.initial ||
                    workspaceState.status == WorkspaceStatus.loading) {
                  return const Center(child: shad.CircularProgressIndicator());
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
                    if (state.status == TimeTrackerRequestsStatus.initial ||
                        state.status == TimeTrackerRequestsStatus.loading) {
                      return const Center(
                        child: shad.CircularProgressIndicator(),
                      );
                    }

                    if (state.status == TimeTrackerRequestsStatus.error) {
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

                    if (state.requests.isEmpty) {
                      return Center(
                        child: Text(
                          l10n.timerNoSessions,
                          style: shad.Theme.of(context).typography.textMuted,
                        ),
                      );
                    }

                    return RefreshIndicator(
                      onRefresh: _loadRequests,
                      child: ListView.builder(
                        itemCount: state.requests.length,
                        padding: const EdgeInsets.only(bottom: 96),
                        itemBuilder: (context, index) {
                          final request = state.requests[index];
                          return _RequestTile(
                            request: request,
                            onTap: () => _showRequestDetail(context, request),
                          );
                        },
                      ),
                    );
                  },
                );
              },
            ),
          ),
          ExtendedFab(
            icon: shad.LucideIcons.plus,
            label: l10n.timerAddMissedEntry,
            onPressed: () => unawaited(_openMissedEntryDialog()),
          ),
        ],
      ),
    );
  }
}
