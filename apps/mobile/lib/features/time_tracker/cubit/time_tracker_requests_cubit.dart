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
          isRefreshing: !cached.isFresh,
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
      if (cached.isFresh) {
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
