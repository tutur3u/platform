import 'package:bloc/bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_requests_state.dart';

class TimeTrackerRequestsCubit extends Cubit<TimeTrackerRequestsState> {
  TimeTrackerRequestsCubit({
    required ITimeTrackerRepository repository,
    TimeTrackerRequestsState? initialState,
  }) : _repo = repository,
       super(initialState ?? const TimeTrackerRequestsState());

  final ITimeTrackerRepository _repo;
  int _latestLoadToken = 0;
  static const Object _userIdNotProvided = Object();
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _cacheTag = 'time-tracker:requests';

  static CacheKey _cacheKey(
    String wsId, {
    required String? selectedUserId,
    required String? statusFilter,
  }) {
    return CacheKey(
      namespace: 'time_tracker.requests',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {
        'selectedUserId': selectedUserId ?? '',
        'status': statusFilter ?? 'all',
      },
    );
  }

  static Map<String, dynamic> _requestToJson(TimeTrackingRequest request) {
    return {
      'id': request.id,
      'ws_id': request.workspaceId,
      'user_id': request.userId,
      'task_id': request.taskId,
      'category_id': request.categoryId,
      'title': request.title,
      'description': request.description,
      'user': {
        'display_name': request.userDisplayName,
        'avatar_url': request.userAvatarUrl,
      },
      'start_time': request.startTime?.toIso8601String(),
      'end_time': request.endTime?.toIso8601String(),
      'images': request.images,
      'approval_status': approvalStatusToString(request.approvalStatus),
      'approved_by': request.approvedBy,
      'approved_by_user': {'display_name': request.approvedByName},
      'approved_at': request.approvedAt?.toIso8601String(),
      'rejected_by': request.rejectedBy,
      'rejected_by_user': {'display_name': request.rejectedByName},
      'rejected_at': request.rejectedAt?.toIso8601String(),
      'needs_info_requested_by_user': {
        'display_name': request.needsInfoRequestedByName,
      },
      'rejection_reason': request.rejectionReason,
      'needs_info_reason': request.needsInfoReason,
      'created_at': request.createdAt?.toIso8601String(),
      'updated_at': request.updatedAt?.toIso8601String(),
    };
  }

  static Map<String, dynamic> _stateToCachePayload(
    List<TimeTrackingRequest> requests,
  ) {
    return {
      'requests': requests.map(_requestToJson).toList(growable: false),
    };
  }

  static Map<String, dynamic> _decodeCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException(
        'Invalid time tracker requests cache payload.',
      );
    }

    return Map<String, dynamic>.from(json);
  }

  static TimeTrackerRequestsState? seedStateFor(
    String wsId, {
    String? selectedUserId,
    String? statusFilter,
  }) {
    final cached = CacheStore.instance.peek<Map<String, dynamic>>(
      key: _cacheKey(
        wsId,
        selectedUserId: selectedUserId,
        statusFilter: statusFilter,
      ),
      decode: _decodeCacheJson,
    );
    final json = cached.data;
    if (!cached.hasValue || json == null) {
      return null;
    }

    return TimeTrackerRequestsState(
      status: TimeTrackerRequestsStatus.loaded,
      workspaceId: wsId,
      requests: ((json['requests'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(TimeTrackingRequest.fromJson)
          .toList(growable: false),
      isFromCache: true,
      lastUpdatedAt: cached.fetchedAt,
    );
  }

  static Future<void> prewarm(
    String wsId, {
    required ITimeTrackerRepository repository,
    String? selectedUserId,
    String? statusFilter,
    bool forceRefresh = false,
  }) async {
    await CacheStore.instance.prefetch<Map<String, dynamic>>(
      key: _cacheKey(
        wsId,
        selectedUserId: selectedUserId,
        statusFilter: statusFilter,
      ),
      policy: _cachePolicy,
      decode: _decodeCacheJson,
      forceRefresh: forceRefresh,
      tags: [_cacheTag, 'workspace:$wsId', 'module:timer'],
      fetch: () async {
        final requests = await repository.getRequests(
          wsId,
          status: statusFilter,
          userId: selectedUserId,
        );
        return _stateToCachePayload(requests);
      },
    );
  }

  ApprovalStatus? _statusFromFilter(String? statusFilter) {
    final normalized = statusFilter?.trim().toLowerCase();
    return switch (normalized) {
      null || '' || 'all' => null,
      'pending' => ApprovalStatus.pending,
      'approved' => ApprovalStatus.approved,
      'rejected' => ApprovalStatus.rejected,
      'needs_info' || 'needsinfo' => ApprovalStatus.needsInfo,
      _ => null,
    };
  }

  bool _currentFilterIncludesStatus(ApprovalStatus status) {
    final selectedStatus = state.selectedStatus;
    return selectedStatus == null || selectedStatus == status;
  }

  TimeTrackingRequest _requestWithUpdatedStatus(
    TimeTrackingRequest request,
    ApprovalStatus status, {
    String? reason,
  }) {
    final now = DateTime.now();

    return TimeTrackingRequest(
      id: request.id,
      workspaceId: request.workspaceId,
      userId: request.userId,
      taskId: request.taskId,
      categoryId: request.categoryId,
      title: request.title,
      description: request.description,
      userDisplayName: request.userDisplayName,
      userAvatarUrl: request.userAvatarUrl,
      startTime: request.startTime,
      endTime: request.endTime,
      images: request.images,
      approvalStatus: status,
      approvedBy: status == ApprovalStatus.approved ? request.approvedBy : null,
      approvedByName: status == ApprovalStatus.approved
          ? request.approvedByName
          : null,
      approvedAt: status == ApprovalStatus.approved ? now : null,
      rejectedBy: status == ApprovalStatus.rejected ? request.rejectedBy : null,
      rejectedByName: status == ApprovalStatus.rejected
          ? request.rejectedByName
          : null,
      rejectedAt: status == ApprovalStatus.rejected ? now : null,
      needsInfoRequestedByName: status == ApprovalStatus.needsInfo
          ? request.needsInfoRequestedByName
          : null,
      rejectionReason: status == ApprovalStatus.rejected ? reason : null,
      needsInfoReason: status == ApprovalStatus.needsInfo ? reason : null,
      createdAt: request.createdAt,
      updatedAt: now,
    );
  }

  void _applyStatusMutationToCurrentState(
    String requestId,
    ApprovalStatus status, {
    String? reason,
  }) {
    final hasTarget = state.requests.any((request) => request.id == requestId);
    if (!hasTarget) {
      return;
    }

    final nextRequests = _currentFilterIncludesStatus(status)
        ? state.requests
              .map(
                (request) => request.id == requestId
                    ? _requestWithUpdatedStatus(request, status, reason: reason)
                    : request,
              )
              .toList(growable: false)
        : state.requests
              .where((request) => request.id != requestId)
              .toList(growable: false);

    emit(
      state.copyWith(
        requests: nextRequests,
        status: TimeTrackerRequestsStatus.loaded,
        isFromCache: false,
        isRefreshing: false,
        lastUpdatedAt: DateTime.now(),
        clearError: true,
      ),
    );
  }

  Future<List<TimeTrackingRequest>> _fetchRequests(
    String wsId, {
    required String? status,
    required String? userId,
  }) {
    if (userId == null || userId.isEmpty) {
      return _repo.getRequests(wsId, status: status);
    }

    return _repo.getRequests(wsId, status: status, userId: userId);
  }

  Future<void> loadRequests(
    String wsId, {
    Object? userId = _userIdNotProvided,
    String? statusOverride,
    bool forceRefresh = false,
  }) async {
    final loadToken = ++_latestLoadToken;
    final hasExplicitUserId = !identical(userId, _userIdNotProvided);
    final requestedUserId = hasExplicitUserId ? userId as String? : null;
    final userIdFromState = hasExplicitUserId
        ? requestedUserId
        : state.selectedUserId;
    final statusFilter =
        statusOverride ??
        (state.selectedStatus != null
            ? approvalStatusToString(state.selectedStatus!)
            : null);
    final selectedStatus = _statusFromFilter(statusFilter);
    final cacheKey = _cacheKey(
      wsId,
      selectedUserId: userIdFromState,
      statusFilter: statusFilter,
    );
    final cached = CacheStore.instance.peek<Map<String, dynamic>>(
      key: cacheKey,
      decode: _decodeCacheJson,
    );

    if (cached.hasValue && cached.data != null) {
      emit(
        state.copyWith(
          status: TimeTrackerRequestsStatus.loaded,
          workspaceId: wsId,
          requests:
              ((cached.data!['requests'] as List<dynamic>?) ??
                      const <dynamic>[])
                  .whereType<Map<String, dynamic>>()
                  .map(TimeTrackingRequest.fromJson)
                  .toList(growable: false),
          isFromCache: true,
          isRefreshing: forceRefresh || !cached.isFresh,
          lastUpdatedAt: cached.fetchedAt,
          selectedStatus: selectedStatus,
          clearSelectedStatus: selectedStatus == null,
          selectedUserId: hasExplicitUserId
              ? requestedUserId
              : state.selectedUserId,
          clearSelectedUserId: hasExplicitUserId && requestedUserId == null,
          clearError: true,
        ),
      );
      if (!forceRefresh && cached.isFresh) {
        return;
      }
    } else {
      emit(
        state.copyWith(
          status: TimeTrackerRequestsStatus.loading,
          workspaceId: wsId,
          requests: state.workspaceId == wsId ? state.requests : const [],
          isFromCache: false,
          isRefreshing: false,
          lastUpdatedAt: null,
          selectedStatus: selectedStatus,
          clearSelectedStatus: selectedStatus == null,
          selectedUserId: hasExplicitUserId
              ? requestedUserId
              : state.selectedUserId,
          clearSelectedUserId: hasExplicitUserId && requestedUserId == null,
          clearError: true,
        ),
      );
    }

    try {
      final requests = await _fetchRequests(
        wsId,
        status: statusFilter,
        userId: userIdFromState,
      );

      if (loadToken != _latestLoadToken) {
        return;
      }

      emit(
        state.copyWith(
          status: TimeTrackerRequestsStatus.loaded,
          workspaceId: wsId,
          requests: requests,
          isFromCache: false,
          isRefreshing: false,
          lastUpdatedAt: DateTime.now(),
        ),
      );
      await CacheStore.instance.write(
        key: cacheKey,
        policy: _cachePolicy,
        payload: _stateToCachePayload(requests),
        tags: [_cacheTag, 'workspace:$wsId', 'module:timer'],
      );
    } on Exception catch (e) {
      if (loadToken != _latestLoadToken) {
        return;
      }

      if (cached.hasValue) {
        emit(
          state.copyWith(
            status: TimeTrackerRequestsStatus.loaded,
            isRefreshing: false,
            error: e.toString(),
          ),
        );
        return;
      }

      emit(
        state.copyWith(
          status: TimeTrackerRequestsStatus.error,
          error: e.toString(),
        ),
      );
    }
  }

  Future<void> filterByStatus(
    ApprovalStatus? status,
    String wsId, {
    Object? userId = _userIdNotProvided,
    String? statusOverride,
  }) async {
    if (status == null) {
      emit(state.copyWith(clearSelectedStatus: true));
    } else {
      emit(state.copyWith(selectedStatus: status));
    }
    await loadRequests(
      wsId,
      userId: userId,
      statusOverride: statusOverride,
    );
  }

  void reset() {
    _latestLoadToken++;
    emit(const TimeTrackerRequestsState());
  }

  Future<void> approveRequest(String requestId, String wsId) async {
    try {
      await _repo.updateRequestStatus(
        wsId,
        requestId,
        status: ApprovalStatus.approved,
      );
      _applyStatusMutationToCurrentState(
        requestId,
        ApprovalStatus.approved,
      );
      await CacheStore.instance.invalidateTags([_cacheTag], workspaceId: wsId);
      await loadRequests(wsId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      rethrow;
    }
  }

  Future<void> rejectRequest(
    String requestId,
    String wsId, {
    String? reason,
  }) async {
    try {
      await _repo.updateRequestStatus(
        wsId,
        requestId,
        status: ApprovalStatus.rejected,
        reason: reason,
      );
      _applyStatusMutationToCurrentState(
        requestId,
        ApprovalStatus.rejected,
        reason: reason,
      );
      await CacheStore.instance.invalidateTags([_cacheTag], workspaceId: wsId);
      await loadRequests(wsId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      rethrow;
    }
  }

  Future<void> requestMoreInfo(
    String requestId,
    String wsId, {
    String? reason,
  }) async {
    try {
      await _repo.updateRequestStatus(
        wsId,
        requestId,
        status: ApprovalStatus.needsInfo,
        reason: reason,
      );
      _applyStatusMutationToCurrentState(
        requestId,
        ApprovalStatus.needsInfo,
        reason: reason,
      );
      await CacheStore.instance.invalidateTags([_cacheTag], workspaceId: wsId);
      await loadRequests(wsId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      rethrow;
    }
  }

  Future<void> resubmitRequest(String requestId, String wsId) async {
    try {
      await _repo.updateRequestStatus(
        wsId,
        requestId,
        status: ApprovalStatus.pending,
      );
      _applyStatusMutationToCurrentState(
        requestId,
        ApprovalStatus.pending,
      );
      await CacheStore.instance.invalidateTags([_cacheTag], workspaceId: wsId);
      await loadRequests(wsId);
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      rethrow;
    }
  }

  Future<TimeTrackingRequest?> updateRequest(
    String wsId,
    String requestId,
    String title,
    DateTime startTime,
    DateTime endTime, {
    String? description,
    List<String>? removedImages,
    List<String>? newImageLocalPaths,
  }) async {
    try {
      final updatedRequest = await _repo.updateRequest(
        wsId,
        requestId,
        title,
        startTime,
        endTime,
        description: description,
        removedImages: removedImages,
        newImageLocalPaths: newImageLocalPaths,
      );

      // Update only the specific request in the list instead of full reload
      final updatedRequests = state.requests.map((r) {
        return r.id == requestId ? updatedRequest : r;
      }).toList();

      emit(
        state.copyWith(
          requests: updatedRequests,
          status: TimeTrackerRequestsStatus.loaded,
          isRefreshing: false,
        ),
      );
      if (state.workspaceId != null) {
        await CacheStore.instance.write(
          key: _cacheKey(
            state.workspaceId!,
            selectedUserId: state.selectedUserId,
            statusFilter: state.selectedStatus == null
                ? null
                : approvalStatusToString(state.selectedStatus!),
          ),
          policy: _cachePolicy,
          payload: _stateToCachePayload(updatedRequests),
          tags: [_cacheTag, 'workspace:${state.workspaceId!}', 'module:timer'],
        );
      }

      return updatedRequest;
    } on Exception catch (e) {
      emit(state.copyWith(error: e.toString()));
      rethrow;
    }
  }
}
