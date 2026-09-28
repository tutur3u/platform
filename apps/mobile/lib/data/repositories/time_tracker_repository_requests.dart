part of 'time_tracker_repository.dart';

extension _TimeTrackerRepositoryRequests on TimeTrackerRepository {
  Future<List<TimeTrackingRequest>> _getRequests(
    String wsId, {
    String? status,
    String? userId,
    int limit = 50,
    int offset = 0,
  }) async {
    final data = await _read(
      wsId,
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/requests', {
        'limit': '$limit',
        'page': '${(offset ~/ limit) + 1}',
        if (status != null) 'status': status,
        if (userId != null && userId.isNotEmpty) 'userId': userId,
      }),
    );

    final path = '/api/v1/workspaces/$wsId/time-tracking/requests';
    final rows = <String, Map<String, dynamic>>{
      for (final raw in data['requests'] as List<dynamic>? ?? const [])
        if (raw is Map<String, dynamic> && raw['id'] is String)
          raw['id'] as String: Map<String, dynamic>.from(raw),
    };
    for (final mutation in await OfflineMutationQueue.instance.listPending()) {
      if (mutation.feature != 'time_tracker' ||
          mutation.workspaceId != wsId ||
          mutation.method != 'PATCH' ||
          !mutation.path.startsWith('$path/') ||
          mutation.path.substring(path.length + 1).contains('/')) {
        continue;
      }
      final row = rows[mutation.entityId];
      if (row == null) continue;
      final action = mutation.payload?['action'];
      final nextStatus = switch (action) {
        'approve' => 'approved',
        'reject' => 'rejected',
        'needs_info' => 'needs_info',
        'resubmit' => 'pending',
        _ => null,
      };
      if (nextStatus == null) continue;
      row['approval_status'] = nextStatus;
      if (mutation.payload?['rejection_reason'] != null) {
        row['rejection_reason'] = mutation.payload!['rejection_reason'];
      }
      if (mutation.payload?['needs_info_reason'] != null) {
        row['needs_info_reason'] = mutation.payload!['needs_info_reason'];
      }
    }
    return rows.values
        .map(TimeTrackingRequest.fromJson)
        .where(
          (request) =>
              (status == null ||
                  status == 'all' ||
                  approvalStatusToString(request.approvalStatus) == status) &&
              (userId == null || request.userId == userId),
        )
        .toList(growable: false);
  }

  Future<void> _updateRequestStatus(
    String wsId,
    String requestId, {
    required ApprovalStatus status,
    String? reason,
  }) async {
    final body = <String, dynamic>{
      'action': switch (status) {
        ApprovalStatus.approved => 'approve',
        ApprovalStatus.rejected => 'reject',
        ApprovalStatus.needsInfo => 'needs_info',
        ApprovalStatus.pending => 'resubmit',
      },
    };

    if (status == ApprovalStatus.rejected && reason != null) {
      body['rejection_reason'] = reason;
    }
    if (status == ApprovalStatus.needsInfo && reason != null) {
      body['needs_info_reason'] = reason;
    }

    final path = '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId';
    await queueOrSendVoid(
      feature: 'time_tracker',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: requestId,
      payload: body,
      send: () async {
        final data = await _api.patchJson(path, body);

        // Actions may return either a request or a success envelope.
        // Callers reload the list after checking the response.
        // to ensure the response indicates success.
        final request = data['request'];
        final isSuccess = data['success'] == true;
        final hasId =
            data.containsKey('id') ||
            (request is Map && request.containsKey('id'));

        if (isSuccess || hasId || request != null) return;

        throw const ApiException(
          message: 'Invalid response from updateRequestStatus',
          statusCode: 0,
        );
      },
    );
  }

  Future<List<TimeTrackingRequestComment>> _getRequestComments(
    String wsId,
    String requestId,
  ) async {
    final data = await _read(
      wsId,
      '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments',
    );

    final path =
        '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments';
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'time_tracker',
      pathContains: path,
      source: (data['comments'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList(growable: false),
      pending: await OfflineMutationQueue.instance.listPending(),
      normalizeCreate: (payload) => {
        ...payload,
        'request_id': requestId,
        'user_id': currentCacheUserId(),
        'created_at': DateTime.now().toUtc().toIso8601String(),
      },
    );
    return rows
        .map(TimeTrackingRequestComment.fromJson)
        .toList(growable: false);
  }

  Future<TimeTrackingRequestComment> _addRequestComment(
    String wsId,
    String requestId,
    String content,
  ) async {
    final path =
        '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments';
    return await queueOrSendValue<TimeTrackingRequestComment>(
      feature: 'time_tracker',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: {'content': content},
      pendingValue: (id) => TimeTrackingRequestComment(
        id: id,
        requestId: requestId,
        userId: currentCacheUserId(),
        content: content,
        createdAt: DateTime.now().toUtc(),
      ),
      send: () async => TimeTrackingRequestComment.fromJson(
        await _api.postJson(path, {'content': content}),
      ),
    );
  }

  Future<TimeTrackingRequestComment> _updateRequestComment(
    String wsId,
    String requestId,
    String commentId,
    String content,
  ) async {
    final path =
        '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments/$commentId';
    return await queueOrSendValue<TimeTrackingRequestComment>(
      feature: 'time_tracker',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: commentId,
      payload: {'content': content},
      pendingValue: (_) => TimeTrackingRequestComment(
        id: commentId,
        requestId: requestId,
        userId: currentCacheUserId(),
        content: content,
        updatedAt: DateTime.now().toUtc(),
      ),
      send: () async => TimeTrackingRequestComment.fromJson(
        await _api.patchJson(path, {'content': content}),
      ),
    );
  }

  Future<void> _deleteRequestComment(
    String wsId,
    String requestId,
    String commentId,
  ) async {
    final path =
        '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments/$commentId';
    await queueOrSendVoid(
      feature: 'time_tracker',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: commentId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }
}
