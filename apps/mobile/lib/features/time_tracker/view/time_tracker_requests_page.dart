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
import 'package:mobile/features/time_tracker/widgets/request_detail_sheet.dart';
import 'package:mobile/features/time_tracker/widgets/threshold_settings_dialog.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_filter_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' show User;

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
  bool _didInitializeWorkspaceLoad = false;

  String? _currentUserId() => context.read<AuthCubit>().state.user?.id;

  String? _requestUserFilterId() {
    if (_canManageRequests) {
      return _selectedUserId;
    }
    return _currentUserId();
  }

  Future<void> _loadRequests() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null || wsId.isEmpty) {
      context.read<TimeTrackerRequestsCubit>().reset();
      return;
    }

    await context.read<TimeTrackerRequestsCubit>().loadRequests(
      wsId,
      userId: _requestUserFilterId(),
      statusOverride: _selectedFilter == TimeTrackerRequestStatusFilter.all
          ? 'all'
          : approvalStatusToString(_statusFromFilter(_selectedFilter)!),
    );
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
    unawaited(_loadPermissionsAndThreshold());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final workspaceState = context.watch<WorkspaceCubit>().state;

    return shad.Scaffold(
      headers: [
        MobileSectionAppBar(
          title: l10n.timerRequestsTitle,
          actions: [
            shad.IconButton.ghost(
              onPressed: () => unawaited(_showFilterSheet()),
              icon: Icon(
                Icons.filter_alt_outlined,
                color: _hasActiveFilters()
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
      child: ResponsiveWrapper(
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
                  return const Center(child: shad.CircularProgressIndicator());
                }

                if (state.status == TimeTrackerRequestsStatus.error) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          shad.LucideIcons.circleAlert,
                          size: 48,
                          color: shad.Theme.of(context).colorScheme.destructive,
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
                    padding: const EdgeInsets.only(bottom: 32),
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
    );
  }

  Future<void> _loadPermissionsAndThreshold() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final wsId = workspace?.id;
    final localWsId = wsId;
    final localToken = ++_permissionLoadToken;
    final currentUserId = context.read<AuthCubit>().state.user?.id;

    bool canApplyState() {
      if (!mounted) {
        return false;
      }
      final currentWsId = context
          .read<WorkspaceCubit>()
          .state
          .currentWorkspace
          ?.id;
      return currentWsId == localWsId && localToken == _permissionLoadToken;
    }

    if (wsId == null || wsId.isEmpty || currentUserId == null) {
      if (!canApplyState()) {
        return;
      }
      setState(() {
        _canManageRequests = false;
        _canManageThresholdSettings = false;
        _selectedUserId = null;
        _availableRequestUsers = const <WorkspaceUserOption>[];
        _missedEntryDateThreshold = null;
        _statusChangeGracePeriodMinutes = 0;
        _isThresholdLoading = false;
      });
      unawaited(_loadRequests());
      return;
    }

    if (canApplyState()) {
      setState(() => _isThresholdLoading = true);
    }

    final repository = context.read<ITimeTrackerRepository>();

    var canManageRequests = false;
    var canManageThresholdSettings = false;
    var availableRequestUsers = const <WorkspaceUserOption>[];
    int? threshold;
    var statusChangeGracePeriodMinutes = 0;
    try {
      final workspacePermissions = await _workspacePermissionsRepository
          .getPermissions(wsId: wsId, userId: currentUserId);
      if (!canApplyState()) {
        return;
      }
      canManageRequests = workspacePermissions.containsPermission(
        manageTimeTrackingRequestsPermission,
      );
      final canManageWorkspaceSettings = workspacePermissions
          .containsPermission(
            manageWorkspaceSettingsPermission,
          );
      canManageThresholdSettings =
          !workspace!.personal &&
          canManageRequests &&
          canManageWorkspaceSettings;

      if (canManageThresholdSettings) {
        try {
          final settings = await repository.getWorkspaceSettings(wsId);
          if (!canApplyState()) {
            return;
          }
          threshold = settings?.missedEntryDateThreshold;
        } on Exception {
          if (!canApplyState()) {
            return;
          }
          threshold = null;
        }
      }

      if (canManageRequests) {
        try {
          final users = await repository.getRequestUsers(wsId);
          if (!canApplyState()) {
            return;
          }
          availableRequestUsers = buildAvailableRequestUsers(users);
        } on Exception {
          if (!canApplyState()) {
            return;
          }
          availableRequestUsers = const <WorkspaceUserOption>[];
        }

        try {
          final gracePeriodValue = await repository.getWorkspaceConfigValue(
            wsId,
            _statusChangeGracePeriodConfigId,
          );
          if (!canApplyState()) {
            return;
          }
          statusChangeGracePeriodMinutes =
              int.tryParse(gracePeriodValue ?? '0') ?? 0;
          if (statusChangeGracePeriodMinutes < 0) {
            statusChangeGracePeriodMinutes = 0;
          }
        } on Exception {
          if (!canApplyState()) {
            return;
          }
          statusChangeGracePeriodMinutes = 0;
        }
      }
    } on Exception catch (error, stackTrace) {
      developer.log(
        'Failed to load workspace permissions for threshold settings',
        name: 'TimeTrackerRequestsPage',
        error: error,
        stackTrace: stackTrace,
      );
      if (!canApplyState()) {
        return;
      }
      setState(() {
        _canManageRequests = false;
        _canManageThresholdSettings = false;
        _selectedUserId = null;
        _availableRequestUsers = const <WorkspaceUserOption>[];
        _missedEntryDateThreshold = null;
        _statusChangeGracePeriodMinutes = 0;
        _isThresholdLoading = false;
      });
      unawaited(_loadRequests());
      return;
    }

    if (!canApplyState()) {
      return;
    }
    setState(() {
      _canManageRequests = canManageRequests;
      _canManageThresholdSettings = canManageThresholdSettings;
      if (!canManageRequests) {
        _selectedUserId = null;
      } else if (_selectedUserId != null &&
          !availableRequestUsers.any((user) => user.id == _selectedUserId)) {
        _selectedUserId = null;
      }
      _availableRequestUsers = availableRequestUsers;
      _missedEntryDateThreshold = threshold;
      _statusChangeGracePeriodMinutes = statusChangeGracePeriodMinutes;
      _isThresholdLoading = false;
    });
    unawaited(_loadRequests());
  }

  Future<void> _showThresholdSettingsDialog() async {
    final wsId = _permissionsWorkspaceId;
    if (wsId == null || wsId.isEmpty || !mounted) {
      return;
    }
    final repo = context.read<ITimeTrackerRepository>();

    await showAdaptiveSheet<void>(
      context: context,
      builder: (dialogContext) {
        return ThresholdSettingsDialog(
          currentThreshold: _missedEntryDateThreshold,
          currentStatusChangeGracePeriodMinutes:
              _statusChangeGracePeriodMinutes,
          onSave: (threshold, statusChangeGracePeriodMinutes) async {
            final toastContext = Navigator.of(
              context,
              rootNavigator: true,
            ).context;
            try {
              await repo.updateMissedEntryDateThreshold(
                wsId,
                threshold,
                statusChangeGracePeriodMinutes: statusChangeGracePeriodMinutes,
              );

              if (!mounted) {
                return;
              }

              setState(() {
                _missedEntryDateThreshold = threshold;
                _statusChangeGracePeriodMinutes =
                    statusChangeGracePeriodMinutes;
              });
              if (!toastContext.mounted) {
                return;
              }
              shad.showToast(
                context: toastContext,
                builder: (context, overlay) => shad.Alert(
                  content: Text(context.l10n.timerRequestsThresholdUpdated),
                ),
              );
            } on ApiException catch (e) {
              if (!mounted) {
                return;
              }
              if (!toastContext.mounted) {
                return;
              }
              final message = e.message.isNotEmpty
                  ? e.message
                  : context.l10n.commonSomethingWentWrong;
              shad.showToast(
                context: toastContext,
                builder: (context, overlay) => shad.Alert.destructive(
                  title: Text(context.l10n.commonSomethingWentWrong),
                  content: Text(message),
                ),
              );
            } on Object {
              if (!mounted) {
                return;
              }
              if (!toastContext.mounted) {
                return;
              }
              shad.showToast(
                context: toastContext,
                builder: (context, overlay) => shad.Alert.destructive(
                  title: Text(context.l10n.commonSomethingWentWrong),
                  content: Text(context.l10n.commonSomethingWentWrong),
                ),
              );
            }
          },
        );
      },
    );
  }

  void _showRequestDetail(BuildContext context, TimeTrackingRequest request) {
    final cubit = context.read<TimeTrackerRequestsCubit>();
    final repository = context.read<ITimeTrackerRepository>();
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null || wsId.isEmpty) {
      return;
    }
    final currentUser = context.read<AuthCubit>().state.user;
    final currentUserId = currentUser?.id;
    final currentUserDisplayName = _extractUserDisplayName(currentUser);

    unawaited(
      showAdaptiveDrawer(
        context: context,
        builder: (_) => RequestDetailSheet(
          request: request,
          wsId: wsId,
          repository: repository,
          currentUserId: currentUserId,
          currentUserDisplayName: currentUserDisplayName,
          isManager: _canManageRequests,
          statusChangeGracePeriodMinutes: _statusChangeGracePeriodMinutes,
          onApprove: () => cubit.approveRequest(request.id, wsId),
          onReject: (reason) =>
              cubit.rejectRequest(request.id, wsId, reason: reason),
          onRequestInfo: (reason) =>
              cubit.requestMoreInfo(request.id, wsId, reason: reason),
          onResubmit: () => cubit.resubmitRequest(request.id, wsId),
          canEdit:
              request.approvalStatus == ApprovalStatus.pending ||
              request.approvalStatus == ApprovalStatus.needsInfo,
          onEdit:
              (
                title,
                startTime,
                endTime, {
                description,
                removedImages,
                newImageLocalPaths,
              }) => cubit.updateRequest(
                wsId,
                request.id,
                title,
                startTime,
                endTime,
                description: description,
                removedImages: removedImages,
                newImageLocalPaths: newImageLocalPaths,
              ),
        ),
      ),
    );
  }

  String? _extractUserDisplayName(User? user) {
    final metadata = user?.userMetadata;
    if (metadata == null) {
      return null;
    }

    final displayName = metadata['display_name'];
    if (displayName is String && displayName.trim().isNotEmpty) {
      return displayName.trim();
    }

    final fullName = metadata['full_name'];
    if (fullName is String && fullName.trim().isNotEmpty) {
      return fullName.trim();
    }

    return null;
  }

  ApprovalStatus? _statusFromFilter(TimeTrackerRequestStatusFilter filter) {
    return switch (filter) {
      TimeTrackerRequestStatusFilter.all => null,
      TimeTrackerRequestStatusFilter.pending => ApprovalStatus.pending,
      TimeTrackerRequestStatusFilter.approved => ApprovalStatus.approved,
      TimeTrackerRequestStatusFilter.rejected => ApprovalStatus.rejected,
      TimeTrackerRequestStatusFilter.needsInfo => ApprovalStatus.needsInfo,
    };
  }

  bool _hasActiveFilters() {
    if (_selectedFilter != TimeTrackerRequestStatusFilter.all) {
      return true;
    }

    if (_canManageRequests && _selectedUserId != null) {
      return true;
    }

    return false;
  }

  Future<void> _showFilterSheet() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null || wsId.isEmpty) {
      return;
    }

    await TimeTrackerFilterSheet.show(
      context,
      selectedFilter: _selectedFilter,
      selectedUserId: _selectedUserId,
      availableRequestUsers: _availableRequestUsers,
      canManageRequests: _canManageRequests,
      onApply: (filter, userId) {
        setState(() {
          _selectedFilter = filter;
          _selectedUserId = _canManageRequests ? userId : null;
        });

        final cubit = context.read<TimeTrackerRequestsCubit>();
        unawaited(
          cubit.filterByStatus(
            _statusFromFilter(filter),
            wsId,
            userId: _requestUserFilterId(),
            statusOverride: filter == TimeTrackerRequestStatusFilter.all
                ? 'all'
                : approvalStatusToString(_statusFromFilter(filter)!),
          ),
        );
      },
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.request, this.onTap});

  final TimeTrackingRequest request;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    final (statusLabel, statusColor) = switch (request.approvalStatus) {
      ApprovalStatus.pending => ('Pending', colorScheme.primary),
      ApprovalStatus.approved => ('Approved', colorScheme.foreground),
      ApprovalStatus.rejected => ('Rejected', colorScheme.destructive),
      ApprovalStatus.needsInfo => ('Needs info', colorScheme.mutedForeground),
    };

    return shad.GhostButton(
      onPressed: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.pending_actions, color: statusColor, size: 20),
            ),
            const shad.Gap(16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    request.title ?? 'Request',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p,
                  ),
                  Text(
                    statusLabel,
                    style: theme.typography.textSmall.copyWith(
                      color: statusColor,
                    ),
                  ),
                ],
              ),
            ),
            if (request.startTime != null)
              Text(
                _formatDate(request.startTime!),
                style: theme.typography.textSmall.copyWith(
                  color: colorScheme.mutedForeground,
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    final local = dt.toLocal();
    return '${local.month}/${local.day}';
  }
}
