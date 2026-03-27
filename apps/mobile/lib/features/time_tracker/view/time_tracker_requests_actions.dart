part of 'time_tracker_requests_page.dart';

extension _RequestsViewActions on _RequestsViewState {
  Future<void> _openMissedEntryDialog() async {
    final wsId = _permissionsWorkspaceId;
    final userId = _currentUserId();
    if (wsId == null || wsId.isEmpty || userId == null || userId.isEmpty) {
      return;
    }

    final snapshotWsId = wsId;
    final rootToastContext = Navigator.of(context, rootNavigator: true).context;
    final rootL10n = rootToastContext.l10n;
    final repository = context.read<ITimeTrackerRepository>();
    final cubit = context.read<TimeTrackerRequestsCubit>();
    final requestVersion =
        (_missedEntryDialogRequestVersionByWorkspace[snapshotWsId] ?? 0) + 1;
    _missedEntryDialogRequestVersionByWorkspace[snapshotWsId] = requestVersion;
    _applyState(() {
      _isMissedEntryDialogLoadingByWorkspace[snapshotWsId] = true;
    });

    bool isCurrentRequest() {
      if (!mounted) {
        return false;
      }
      final currentWsId = context
          .read<WorkspaceCubit>()
          .state
          .currentWorkspace
          ?.id;
      final latestRequestVersion =
          _missedEntryDialogRequestVersionByWorkspace[snapshotWsId];
      return currentWsId == snapshotWsId &&
          latestRequestVersion == requestVersion;
    }

    List<TimeTrackingCategory> categories;
    try {
      categories = await repository.getCategories(snapshotWsId);
      if (!isCurrentRequest()) {
        return;
      }
      _applyState(() {
        _hasLoadedMissedEntryCategoriesByWorkspace[snapshotWsId] = true;
      });
    } on ApiException catch (e) {
      if (!isCurrentRequest()) {
        return;
      }
      if (!rootToastContext.mounted) {
        return;
      }
      final message = e.message.isNotEmpty
          ? e.message
          : rootL10n.commonSomethingWentWrong;
      shad.showToast(
        context: rootToastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.commonSomethingWentWrong),
          content: Text(message),
        ),
      );
      return;
    } on Object {
      if (!isCurrentRequest()) {
        return;
      }
      if (!rootToastContext.mounted) {
        return;
      }
      shad.showToast(
        context: rootToastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(context.l10n.commonSomethingWentWrong),
          content: Text(context.l10n.commonSomethingWentWrong),
        ),
      );
      return;
    } finally {
      if (mounted) {
        final latestRequestVersion =
            _missedEntryDialogRequestVersionByWorkspace[snapshotWsId];
        if (latestRequestVersion == requestVersion) {
          _applyState(() {
            _isMissedEntryDialogLoadingByWorkspace[snapshotWsId] = false;
          });
        }
      }
    }
    if (!isCurrentRequest()) {
      return;
    }
    if (!mounted) {
      return;
    }

    await showMissedEntryDialogFlow(
      context,
      wsId: snapshotWsId,
      userId: userId,
      categories: categories,
      thresholdDays: _missedEntryDateThreshold,
      workspacePermissionsRepository: _workspacePermissionsRepository,
      onCreateMissedEntry:
          ({
            required title,
            required startTime,
            required endTime,
            categoryId,
            description,
          }) => repository.createMissedEntry(
            snapshotWsId,
            title: title,
            categoryId: categoryId,
            startTime: startTime,
            endTime: endTime,
            description: description,
          ),
      onCreateMissedEntryAsRequest:
          ({
            required title,
            required startTime,
            required endTime,
            required imageLocalPaths,
            categoryId,
            description,
          }) => repository.createRequest(
            snapshotWsId,
            title: title,
            categoryId: categoryId,
            startTime: startTime,
            endTime: endTime,
            description: description,
            imageLocalPaths: imageLocalPaths,
          ),
      onAfterSave: () async {
        if (!isCurrentRequest()) {
          return;
        }
        await cubit.filterByStatus(
          statusFromFilter(_selectedFilter),
          snapshotWsId,
          userId: _requestUserFilterId(),
          statusOverride: _statusOverrideForFilter(_selectedFilter),
        );
      },
    );
  }

  Future<void> _loadPermissionsAndThreshold(String? wsId) async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
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
      _applyState(() {
        _hasResolvedPermissions = true;
        _canManageRequests = false;
        _canManageThresholdSettings = false;
        _selectedUserId = null;
        _availableRequestUsers = const <WorkspaceUserOption>[];
        _missedEntryDateThreshold = null;
        _statusChangeGracePeriodMinutes = 0;
        _isThresholdLoading = false;
      });
      unawaited(_loadRequests(wsIdOverride: wsId));
      return;
    }

    if (canApplyState()) {
      _applyState(() {
        _hasResolvedPermissions = false;
        _isThresholdLoading = true;
      });
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
      final isPersonalWorkspace = workspace?.personal ?? true;
      canManageThresholdSettings =
          !isPersonalWorkspace &&
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
            _RequestsViewState._statusChangeGracePeriodConfigId,
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
      _applyState(() {
        _hasResolvedPermissions = true;
        _canManageRequests = false;
        _canManageThresholdSettings = false;
        _selectedUserId = null;
        _availableRequestUsers = const <WorkspaceUserOption>[];
        _missedEntryDateThreshold = null;
        _statusChangeGracePeriodMinutes = 0;
        _isThresholdLoading = false;
      });
      unawaited(_loadRequests(wsIdOverride: wsId));
      return;
    }

    if (!canApplyState()) {
      return;
    }
    _applyState(() {
      _hasResolvedPermissions = true;
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
    unawaited(_loadRequests(wsIdOverride: wsId));
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
            final snapshotWsId = wsId;
            final toastContext = Navigator.of(
              context,
              rootNavigator: true,
            ).context;
            final requestVersion =
                (_thresholdSaveRequestVersionByWorkspace[snapshotWsId] ?? 0) +
                1;
            _thresholdSaveRequestVersionByWorkspace[snapshotWsId] =
                requestVersion;

            bool canApplySaveResult() {
              if (!mounted) {
                return false;
              }
              final currentWsId = context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id;
              final latestRequestVersion =
                  _thresholdSaveRequestVersionByWorkspace[snapshotWsId];
              return currentWsId == snapshotWsId &&
                  latestRequestVersion == requestVersion;
            }

            try {
              await repo.updateMissedEntryDateThreshold(
                snapshotWsId,
                threshold,
                statusChangeGracePeriodMinutes: statusChangeGracePeriodMinutes,
              );

              if (!canApplySaveResult()) {
                return;
              }

              _applyState(() {
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
              if (!canApplySaveResult()) {
                return;
              }
              if (!toastContext.mounted) {
                return;
              }
              final message = e.message.isNotEmpty
                  ? e.message
                  : toastContext.l10n.commonSomethingWentWrong;
              shad.showToast(
                context: toastContext,
                builder: (context, overlay) => shad.Alert.destructive(
                  title: Text(context.l10n.commonSomethingWentWrong),
                  content: Text(message),
                ),
              );
            } on Object {
              if (!canApplySaveResult()) {
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
}
