import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/cache/time_request_image_delivery.dart';
import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/data/models/time_tracking/break_record.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/data/models/time_tracking/period_stats.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/time_tracking/request_activity.dart';
import 'package:mobile/data/models/time_tracking/request_comment.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/session_page.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/workspace_settings.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

part 'time_tracker_repository_categories.dart';
part 'time_tracker_repository_goals.dart';
part 'time_tracker_repository_requests.dart';
part 'time_tracker_repository_helpers.dart';

const _pomodoroKey = 'pomodoro_settings';

abstract class ITimeTrackerRepository {
  Future<List<TimeTrackingSession>> getSessions(
    String wsId, {
    int limit = 50,
    int offset = 0,
  });

  Future<TimeTrackingSessionPage> getHistorySessions(
    String wsId, {
    required DateTime dateFrom,
    required DateTime dateTo,
    String? cursor,
    int limit = 10,
    String? userId,
  });

  Future<TimeTrackingSession?> getRunningSession(String wsId);

  Future<TimeTrackingSession> startSession(
    String wsId, {
    String? title,
    String? description,
    String? categoryId,
    String? taskId,
    String? userId,
    String? parentSessionId,
    bool wasResumed = false,
  });

  Future<TimeTrackingSession> stopSession(String wsId, String sessionId);

  Future<TimeTrackingSession> pauseSession(
    String wsId,
    String sessionId, {
    String? breakTypeId,
    String? breakTypeName,
  });

  Future<TimeTrackingSession> resumeSession(String wsId, String sessionId);

  Future<TimeTrackingSession> editSession(
    String wsId,
    String sessionId, {
    String? title,
    String? description,
    String? categoryId,
    String? taskId,
    DateTime? startTime,
    DateTime? endTime,
  });

  Future<void> deleteSession(String wsId, String sessionId);

  Future<TimeTrackingSession> createMissedEntry(
    String wsId, {
    required String title,
    required DateTime startTime,
    required DateTime endTime,
    String? categoryId,
    String? description,
  });

  Future<List<TimeTrackingCategory>> getCategories(String wsId);

  Future<TimeTrackingCategory> createCategory(
    String wsId,
    String name, {
    String? color,
    String? description,
  });

  Future<TimeTrackingBreak?> getActiveBreak(String wsId, String sessionId);

  Future<TimeTrackerStats> getStats(
    String wsId,
    String? userId, {
    bool isPersonal = false,
    String? timezone,
  });

  Future<TimeTrackingPeriodStats> getPeriodStats(
    String wsId, {
    required DateTime dateFrom,
    required DateTime dateTo,
    String? userId,
    String? timezone,
  });

  Future<List<TimeTrackingGoal>> getGoals(String wsId, {String? userId});

  Future<TimeTrackingGoal> createGoal(
    String wsId, {
    required int dailyGoalMinutes,
    String? categoryId,
    int? weeklyGoalMinutes,
    bool isActive = true,
  });

  Future<TimeTrackingGoal> updateGoal(
    String wsId,
    String goalId, {
    String? categoryId,
    bool includeCategoryId = false,
    bool includeWeeklyGoalMinutes = false,
    int? dailyGoalMinutes,
    int? weeklyGoalMinutes,
    bool? isActive,
  });

  Future<void> deleteGoal(String wsId, String goalId);

  Future<List<TimeTrackingRequest>> getRequests(
    String wsId, {
    String? status,
    String? userId,
    int limit = 50,
    int offset = 0,
  });

  Future<List<WorkspaceUserOption>> getRequestUsers(String wsId);

  Future<TimeTrackingRequest?> getRequestById(String wsId, String requestId);

  Future<TimeTrackingRequest> createRequest(
    String wsId, {
    required String title,
    String? description,
    String? categoryId,
    DateTime? startTime,
    DateTime? endTime,
    List<String>? imageLocalPaths,
  });

  Future<WorkspaceSettings?> getWorkspaceSettings(String wsId);

  Future<String?> getWorkspaceConfigValue(String wsId, String configId);

  Future<void> updateMissedEntryDateThreshold(
    String wsId,
    int? threshold, {
    int? statusChangeGracePeriodMinutes,
  });

  Future<void> updateRequestStatus(
    String wsId,
    String requestId, {
    required ApprovalStatus status,
    String? reason,
  });

  Future<List<TimeTrackingRequestComment>> getRequestComments(
    String wsId,
    String requestId,
  );

  Future<TimeTrackingRequestComment> addRequestComment(
    String wsId,
    String requestId,
    String content,
  );

  Future<TimeTrackingRequest> updateRequest(
    String wsId,
    String requestId,
    String title,
    DateTime startTime,
    DateTime endTime, {
    String? description,
    List<String>? removedImages,
    List<String>? newImageLocalPaths,
  });

  Future<TimeTrackingRequestComment> updateRequestComment(
    String wsId,
    String requestId,
    String commentId,
    String content,
  );

  Future<void> deleteRequestComment(
    String wsId,
    String requestId,
    String commentId,
  );

  Future<TimeTrackingRequestActivityResponse> getRequestActivities(
    String wsId,
    String requestId, {
    int page = 1,
    int limit = 5,
  });

  Future<List<TimeTrackingSession>> getManagementSessions(
    String wsId, {
    String? search,
    DateTime? dateFrom,
    DateTime? dateTo,
    int limit = 50,
    int offset = 0,
  });

  Future<void> savePomodoroSettings(PomodoroSettings settings);

  Future<PomodoroSettings> loadPomodoroSettings();

  /// Fetches minimal task display info (name, ticket label) for a single task.
  Future<TaskLinkOption?> getTaskLinkOptionById(String wsId, String taskId);
}

/// Repository for time tracking operations using API endpoints.
class TimeTrackerRepository implements ITimeTrackerRepository {
  TimeTrackerRepository({ApiClient? apiClient, http.Client? httpClient})
    : _api = apiClient ?? ApiClient(),
      _httpClient = httpClient ?? http.Client();

  final ApiClient _api;
  final http.Client _httpClient;
  static final Random _uuidRandom = Random.secure();

  @override
  Future<List<TimeTrackingSession>> getSessions(
    String wsId, {
    int limit = 50,
    int offset = 0,
  }) async {
    final data = await _read(
      wsId,
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/sessions', {
        'type': 'recent',
        'limit': '$limit',
      }),
    );

    final sessions = await _sessionRows(
      wsId,
      data,
      includeCreates: offset == 0,
    );
    return sessions.map(TimeTrackingSession.fromJson).toList();
  }

  @override
  Future<TimeTrackingSessionPage> getHistorySessions(
    String wsId, {
    required DateTime dateFrom,
    required DateTime dateTo,
    String? cursor,
    int limit = 10,
    String? userId,
  }) async {
    final data = await _read(
      wsId,
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/sessions', {
        'type': 'history',
        'limit': '$limit',
        'dateFrom': _toApiIso(dateFrom),
        'dateTo': _toApiIso(dateTo),
        if (cursor != null) 'cursor': cursor,
        if (userId != null) 'userId': userId,
      }),
    );
    return TimeTrackingSessionPage.fromJson({
      ...data,
      'sessions': await _sessionRows(
        wsId,
        data,
        includeCreates: cursor == null,
      ),
    });
  }

  @override
  Future<TimeTrackingSession?> getRunningSession(String wsId) async {
    final data = await _read(
      wsId,
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/sessions', {
        'type': 'running',
      }),
    );

    return await _pendingRunningSession(wsId, data['session']);
  }

  @override
  Future<TimeTrackingSession> startSession(
    String wsId, {
    String? title,
    String? description,
    String? categoryId,
    String? taskId,
    String? userId,
    String? parentSessionId,
    bool wasResumed = false,
  }) async {
    return await _writeSession(
      wsId,
      'POST',
      '/api/v1/workspaces/$wsId/time-tracking/sessions',
      {
        'title': title ?? 'Work session',
        if (description != null) 'description': description,
        if (categoryId != null) 'categoryId': categoryId,
        if (taskId != null) 'taskId': taskId,
        if (userId != null) 'userId': userId,
        if (parentSessionId != null) 'parentSessionId': parentSessionId,
        if (wasResumed) 'wasResumed': true,
      },
    );
  }

  @override
  Future<TimeTrackingSession> stopSession(String wsId, String sessionId) async {
    return await _writeSession(
      wsId,
      'PATCH',
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      {'action': 'stop'},
      sessionId: sessionId,
    );
  }

  @override
  Future<TimeTrackingSession> pauseSession(
    String wsId,
    String sessionId, {
    String? breakTypeId,
    String? breakTypeName,
  }) async {
    return await _writeSession(
      wsId,
      'PATCH',
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      {
        'action': 'pause',
        if (breakTypeId != null) 'breakTypeId': breakTypeId,
        if (breakTypeName != null) 'breakTypeName': breakTypeName,
      },
      sessionId: sessionId,
    );
  }

  @override
  Future<TimeTrackingSession> resumeSession(
    String wsId,
    String sessionId,
  ) async {
    return await _writeSession(
      wsId,
      'PATCH',
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      {'action': 'resume'},
      sessionId: sessionId,
    );
  }

  @override
  Future<TimeTrackingSession> editSession(
    String wsId,
    String sessionId, {
    String? title,
    String? description,
    String? categoryId,
    String? taskId,
    DateTime? startTime,
    DateTime? endTime,
  }) async {
    final body = <String, dynamic>{'action': 'edit'};
    if (title != null) body['title'] = title;
    if (description != null) body['description'] = description;
    if (categoryId != null) body['categoryId'] = categoryId;
    if (taskId != null) body['taskId'] = taskId;
    if (startTime != null) body['startTime'] = _toApiIso(startTime);
    if (endTime != null) body['endTime'] = _toApiIso(endTime);

    return await _writeSession(
      wsId,
      'PATCH',
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      body,
      sessionId: sessionId,
    );
  }

  @override
  Future<void> deleteSession(String wsId, String sessionId) async {
    final path = '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId';
    await queueOrSendVoid(
      feature: 'time_tracker',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: sessionId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }

  @override
  Future<TimeTrackingSession> createMissedEntry(
    String wsId, {
    required String title,
    required DateTime startTime,
    required DateTime endTime,
    String? categoryId,
    String? description,
  }) async {
    return await _writeSession(
      wsId,
      'POST',
      '/api/v1/workspaces/$wsId/time-tracking/sessions',
      {
        'title': title,
        'startTime': _toApiIso(startTime),
        'endTime': _toApiIso(endTime),
        if (categoryId != null) 'categoryId': categoryId,
        if (description != null) 'description': description,
      },
    );
  }

  @override
  Future<List<TimeTrackingCategory>> getCategories(String wsId) =>
      _getCategories(wsId);

  @override
  Future<TimeTrackingCategory> createCategory(
    String wsId,
    String name, {
    String? color,
    String? description,
  }) => _createCategory(wsId, name, color: color, description: description);

  @override
  Future<TimeTrackingBreak?> getActiveBreak(
    String wsId,
    String sessionId,
  ) async {
    final data = await _read(
      wsId,
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId/breaks/active',
    );

    final breakData = data['break'];
    if (breakData == null) return null;
    return TimeTrackingBreak.fromJson(breakData as Map<String, dynamic>);
  }

  @override
  Future<TimeTrackerStats> getStats(
    String wsId,
    String? userId, {
    bool isPersonal = false,
    String? timezone,
  }) async {
    final resolvedTimezone = (timezone != null && timezone.isNotEmpty)
        ? timezone
        : 'UTC';
    final data = await _read(
      wsId,
      _withQuery('/api/v1/workspaces/$wsId/time-tracker/stats', {
        if (userId != null && userId.isNotEmpty) 'userId': userId,
        'isPersonal': isPersonal.toString(),
        'timezone': resolvedTimezone,
      }),
    );

    return TimeTrackerStats(
      todayTime: data['todayTime'] as int? ?? 0,
      weekTime: data['weekTime'] as int? ?? 0,
      monthTime: data['monthTime'] as int? ?? 0,
      streak: data['streak'] as int? ?? 0,
      dailyActivity:
          (data['dailyActivity'] as List<dynamic>?)
              ?.map(
                (entry) =>
                    DailyActivity.fromJson(entry as Map<String, dynamic>),
              )
              .toList() ??
          const <DailyActivity>[],
    );
  }

  @override
  Future<TimeTrackingPeriodStats> getPeriodStats(
    String wsId, {
    required DateTime dateFrom,
    required DateTime dateTo,
    String? userId,
    String? timezone,
  }) async {
    final resolvedTimezone = (timezone != null && timezone.isNotEmpty)
        ? timezone
        : 'UTC';
    final data = await _read(
      wsId,
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/stats/period', {
        'dateFrom': _toApiIso(dateFrom),
        'dateTo': _toApiIso(dateTo),
        if (userId != null) 'userId': userId,
        'timezone': resolvedTimezone,
      }),
    );
    return TimeTrackingPeriodStats.fromJson(data);
  }

  @override
  Future<List<TimeTrackingGoal>> getGoals(String wsId, {String? userId}) =>
      _getGoals(wsId, userId: userId);

  @override
  Future<TimeTrackingGoal> createGoal(
    String wsId, {
    required int dailyGoalMinutes,
    String? categoryId,
    int? weeklyGoalMinutes,
    bool isActive = true,
  }) => _createGoal(
    wsId,
    dailyGoalMinutes: dailyGoalMinutes,
    categoryId: categoryId,
    weeklyGoalMinutes: weeklyGoalMinutes,
    isActive: isActive,
  );

  @override
  Future<TimeTrackingGoal> updateGoal(
    String wsId,
    String goalId, {
    String? categoryId,
    bool includeCategoryId = false,
    bool includeWeeklyGoalMinutes = false,
    int? dailyGoalMinutes,
    int? weeklyGoalMinutes,
    bool? isActive,
  }) => _updateGoal(
    wsId,
    goalId,
    categoryId: categoryId,
    includeCategoryId: includeCategoryId,
    includeWeeklyGoalMinutes: includeWeeklyGoalMinutes,
    dailyGoalMinutes: dailyGoalMinutes,
    weeklyGoalMinutes: weeklyGoalMinutes,
    isActive: isActive,
  );

  @override
  Future<void> deleteGoal(String wsId, String goalId) =>
      _deleteGoal(wsId, goalId);

  @override
  Future<List<TimeTrackingRequest>> getRequests(
    String wsId, {
    String? status,
    String? userId,
    int limit = 50,
    int offset = 0,
  }) => _getRequests(
    wsId,
    status: status,
    userId: userId,
    limit: limit,
    offset: offset,
  );

  @override
  Future<List<WorkspaceUserOption>> getRequestUsers(String wsId) async {
    final data = await _readList(
      wsId,
      '/api/v1/workspaces/$wsId/time-tracking/requests/users',
    );

    return data
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceUserOption.fromJson)
        .toList();
  }

  @override
  Future<TimeTrackingRequest?> getRequestById(
    String wsId,
    String requestId,
  ) async {
    final normalizedRequestId = normalizeUuid(requestId);
    if (normalizedRequestId == null) {
      return null;
    }

    final data = await _read(
      wsId,
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/requests', {
        'status': 'all',
        'limit': '1',
        'requestId': normalizedRequestId,
      }),
    );

    final requests = data['requests'] as List<dynamic>? ?? const <dynamic>[];
    final first = requests.firstOrNull;
    var raw = first is Map<String, dynamic> ? {...first} : null;
    for (final mutation in await OfflineMutationQueue.instance.listPending()) {
      if (mutation.feature != 'time_tracker' ||
          mutation.workspaceId != wsId ||
          mutation.entityId != normalizedRequestId) {
        continue;
      }
      final fields = mutation.payload?['fields'];
      if (fields is! Map<String, dynamic>) continue;
      if (mutation.method == 'TIME_REQUEST_CREATE') {
        raw = {
          'id': normalizedRequestId,
          'ws_id': wsId,
          'user_id': currentCacheUserId(),
          'title': fields['title'],
          'description': fields['description'],
          'category_id': fields['categoryId'],
          'start_time': fields['startTime'],
          'end_time': fields['endTime'],
        };
      } else if (mutation.method == 'TIME_REQUEST_UPDATE') {
        raw = {
          ...?raw,
          'id': normalizedRequestId,
          'title': fields['title'],
          if (fields.containsKey('description'))
            'description': fields['description'],
          'start_time': fields['startTime'],
          'end_time': fields['endTime'],
        };
      }
    }
    return raw == null ? null : TimeTrackingRequest.fromJson(raw);
  }

  @override
  Future<TimeTrackingRequest> createRequest(
    String wsId, {
    required String title,
    String? description,
    String? categoryId,
    DateTime? startTime,
    DateTime? endTime,
    List<String>? imageLocalPaths,
  }) async {
    final localPaths = imageLocalPaths ?? const <String>[];
    final requestId = _generateUuidV4();
    final images = await _stageRequestImages(localPaths);

    final fields = <String, dynamic>{
      'requestId': requestId,
      'title': title,
      if (description != null) 'description': description,
      if (categoryId != null) 'categoryId': categoryId,
      if (startTime != null) 'startTime': _toApiIso(startTime),
      if (endTime != null) 'endTime': _toApiIso(endTime),
    };

    final path = '/api/v1/workspaces/$wsId/time-tracking/requests';
    return await queueOrSendValue<TimeTrackingRequest>(
      feature: 'time_tracker',
      method: 'TIME_REQUEST_CREATE',
      path: path,
      workspaceId: wsId,
      entityId: requestId,
      payload: {'requestId': requestId, 'fields': fields, 'images': images},
      pendingValue: (_) => TimeTrackingRequest.fromJson({
        'id': requestId,
        'ws_id': wsId,
        'user_id': currentCacheUserId(),
        'title': title,
        'description': description,
        'category_id': categoryId,
        'start_time': startTime?.toUtc().toIso8601String(),
        'end_time': endTime?.toUtc().toIso8601String(),
        'created_at': DateTime.now().toUtc().toIso8601String(),
      }),
      send: () async {
        final uploaded = await deliverTimeRequestImages(
          api: _api,
          httpClient: _httpClient,
          workspaceId: wsId,
          requestId: requestId,
          images: images,
        );
        final data = await _api.postJson(path, {
          ...fields,
          if (uploaded.isNotEmpty) 'imagePaths': uploaded,
        });
        return TimeTrackingRequest.fromJson(
          data['request'] as Map<String, dynamic>,
        );
      },
    );
  }

  @override
  Future<WorkspaceSettings?> getWorkspaceSettings(String wsId) async {
    final data = await _read(wsId, '/api/v1/workspaces/$wsId/settings');
    if (data.isEmpty) {
      return null;
    }
    return WorkspaceSettings.fromJson(data);
  }

  @override
  Future<String?> getWorkspaceConfigValue(String wsId, String configId) async {
    final data = await _read(
      wsId,
      '/api/v1/workspaces/$wsId/settings/$configId',
    );
    final value = data['value'];
    return value is String ? value : null;
  }

  @override
  Future<void> updateMissedEntryDateThreshold(
    String wsId,
    int? threshold, {
    int? statusChangeGracePeriodMinutes,
  }) async {
    final body = <String, dynamic>{'threshold': threshold};
    if (statusChangeGracePeriodMinutes != null) {
      body['statusChangeGracePeriodMinutes'] = statusChangeGracePeriodMinutes;
    }

    final path = '/api/v1/workspaces/$wsId/time-tracking/threshold';
    await queueOrSendVoid(
      feature: 'time_tracker',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      payload: body,
      send: () async {
        await _api.putJson(path, body);
      },
    );
  }

  @override
  Future<void> updateRequestStatus(
    String wsId,
    String requestId, {
    required ApprovalStatus status,
    String? reason,
  }) => _updateRequestStatus(wsId, requestId, status: status, reason: reason);

  @override
  Future<List<TimeTrackingRequestComment>> getRequestComments(
    String wsId,
    String requestId,
  ) => _getRequestComments(wsId, requestId);

  @override
  Future<TimeTrackingRequestComment> addRequestComment(
    String wsId,
    String requestId,
    String content,
  ) => _addRequestComment(wsId, requestId, content);

  @override
  Future<TimeTrackingRequest> updateRequest(
    String wsId,
    String requestId,
    String title,
    DateTime startTime,
    DateTime endTime, {
    String? description,
    List<String>? removedImages,
    List<String>? newImageLocalPaths,
  }) async {
    final images = await _stageRequestImages(
      newImageLocalPaths ?? const <String>[],
    );

    final body = <String, dynamic>{
      'title': title,
      'startTime': _toApiIso(startTime),
      'endTime': _toApiIso(endTime),
      if (description != null) 'description': description,
      if (removedImages != null && removedImages.isNotEmpty)
        'removedImages': removedImages,
    };

    final path = '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId';
    return await queueOrSendValue<TimeTrackingRequest>(
      feature: 'time_tracker',
      method: 'TIME_REQUEST_UPDATE',
      path: path,
      workspaceId: wsId,
      entityId: requestId,
      payload: {'requestId': requestId, 'fields': body, 'images': images},
      pendingValue: (_) => TimeTrackingRequest.fromJson({
        'id': requestId,
        'ws_id': wsId,
        'title': title,
        'description': description,
        'start_time': startTime.toUtc().toIso8601String(),
        'end_time': endTime.toUtc().toIso8601String(),
      }),
      send: () async {
        final uploaded = await deliverTimeRequestImages(
          api: _api,
          httpClient: _httpClient,
          workspaceId: wsId,
          requestId: requestId,
          images: images,
        );
        final data = await _api.putJson(path, {
          ...body,
          if (uploaded.isNotEmpty) 'newImagePaths': uploaded,
        });
        return TimeTrackingRequest.fromJson(
          data['request'] as Map<String, dynamic>,
        );
      },
    );
  }

  @override
  Future<TimeTrackingRequestComment> updateRequestComment(
    String wsId,
    String requestId,
    String commentId,
    String content,
  ) => _updateRequestComment(wsId, requestId, commentId, content);

  @override
  Future<void> deleteRequestComment(
    String wsId,
    String requestId,
    String commentId,
  ) => _deleteRequestComment(wsId, requestId, commentId);

  @override
  Future<TimeTrackingRequestActivityResponse> getRequestActivities(
    String wsId,
    String requestId, {
    int page = 1,
    int limit = 5,
  }) async {
    final data = await _read(
      wsId,
      _withQuery(
        '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/activity',
        {'page': '$page', 'limit': '$limit'},
      ),
    );

    return TimeTrackingRequestActivityResponse.fromJson(data);
  }

  @override
  Future<List<TimeTrackingSession>> getManagementSessions(
    String wsId, {
    String? search,
    DateTime? dateFrom,
    DateTime? dateTo,
    int limit = 50,
    int offset = 0,
  }) async {
    final data = await _read(
      wsId,
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/sessions', {
        'type': 'history',
        'limit': '$limit',
        if (search != null && search.isNotEmpty) 'searchQuery': search,
        if (dateFrom != null) 'dateFrom': _toApiIso(dateFrom),
        if (dateTo != null) 'dateTo': _toApiIso(dateTo),
      }),
    );

    final sessions = data['sessions'] as List<dynamic>? ?? [];
    return sessions
        .map((e) => TimeTrackingSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<void> savePomodoroSettings(PomodoroSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_pomodoroKey, settings.toJsonString());
  }

  @override
  Future<PomodoroSettings> loadPomodoroSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_pomodoroKey);
    if (raw == null) return const PomodoroSettings();
    return PomodoroSettings.fromJsonString(raw);
  }

  @override
  Future<TaskLinkOption?> getTaskLinkOptionById(
    String wsId,
    String taskId,
  ) async {
    try {
      final response = await _read(
        wsId,
        '/api/v1/workspaces/$wsId/tasks/$taskId',
      );
      final task = response['task'];
      if (task is! Map<String, dynamic>) return null;
      return TaskLinkOption.fromJson(task);
    } on ApiException catch (error) {
      if (error.statusCode == 404) return null;
      rethrow;
    }
  }
}
