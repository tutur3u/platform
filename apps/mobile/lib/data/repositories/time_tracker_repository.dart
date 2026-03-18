import 'dart:io';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
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
import 'package:mobile/data/sources/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
    String? categoryId,
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
    int limit = 50,
    int offset = 0,
  });

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
}

/// Repository for time tracking operations using API endpoints.
class TimeTrackerRepository implements ITimeTrackerRepository {
  TimeTrackerRepository({ApiClient? apiClient, http.Client? httpClient})
    : _api = apiClient ?? ApiClient(),
      _httpClient = httpClient ?? http.Client();

  final ApiClient _api;
  final http.Client _httpClient;
  static final Random _uuidRandom = Random.secure();

  String _withQuery(String path, Map<String, String?> query) {
    final entries = query.entries.where((entry) {
      final value = entry.value;
      return value != null && value.isNotEmpty;
    }).toList();

    if (entries.isEmpty) {
      return path;
    }

    final encoded = entries
        .map(
          (entry) {
            final key = Uri.encodeQueryComponent(entry.key);
            final value = Uri.encodeQueryComponent(entry.value!);
            return '$key=$value';
          },
        )
        .join('&');
    return '$path?$encoded';
  }

  String _toApiIso(DateTime value) => value.toUtc().toIso8601String();

  String _filenameFromPath(String path) {
    final normalized = path.replaceAll(RegExp(r'\\'), '/');
    final slashIndex = normalized.lastIndexOf('/');
    if (slashIndex == -1 || slashIndex == normalized.length - 1) {
      return normalized;
    }
    return normalized.substring(slashIndex + 1);
  }

  String _generateUuidV4() {
    final bytes = List<int>.generate(16, (_) => _uuidRandom.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    String hex(int value) => value.toRadixString(16).padLeft(2, '0');

    return '${hex(bytes[0])}${hex(bytes[1])}${hex(bytes[2])}${hex(bytes[3])}-'
        '${hex(bytes[4])}${hex(bytes[5])}-'
        '${hex(bytes[6])}${hex(bytes[7])}-'
        '${hex(bytes[8])}${hex(bytes[9])}-'
        '${hex(bytes[10])}'
        '${hex(bytes[11])}'
        '${hex(bytes[12])}'
        '${hex(bytes[13])}'
        '${hex(bytes[14])}'
        '${hex(bytes[15])}';
  }

  Future<List<String>> _uploadRequestImages(
    String wsId,
    String requestId,
    List<String> localImagePaths,
  ) async {
    if (localImagePaths.isEmpty) {
      return const <String>[];
    }

    final signedUploadResponse = await _api.postJson(
      '/api/v1/workspaces/$wsId/time-tracking/requests/upload-url',
      {
        'requestId': requestId,
        'files': localImagePaths
            .map((path) => {'filename': _filenameFromPath(path)})
            .toList(),
      },
    );

    final uploads = signedUploadResponse['uploads'];
    if (uploads is! List || uploads.length != localImagePaths.length) {
      throw const ApiException(
        message: 'Invalid upload URL response',
        statusCode: 0,
      );
    }

    final uploadedPaths = <String>[];

    for (var i = 0; i < uploads.length; i++) {
      final upload = uploads[i];
      if (upload is! Map<String, dynamic>) {
        throw const ApiException(
          message: 'Invalid upload URL response',
          statusCode: 0,
        );
      }

      final signedUrl = upload['signedUrl'] as String?;
      final token = upload['token'] as String?;
      final storagePath = upload['path'] as String?;
      if (signedUrl == null || token == null || storagePath == null) {
        throw const ApiException(
          message: 'Invalid upload URL response',
          statusCode: 0,
        );
      }

      final localPath = localImagePaths[i];
      final fileBytes = await File(localPath).readAsBytes();
      final contentType =
          lookupMimeType(localPath) ?? 'application/octet-stream';

      final uploadResponse = await _httpClient
          .put(
            Uri.parse(signedUrl),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': contentType,
            },
            body: fileBytes,
          )
          .timeout(const Duration(seconds: 60));

      if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
        throw ApiException(
          message: 'Failed to upload image (${uploadResponse.statusCode})',
          statusCode: uploadResponse.statusCode,
        );
      }

      uploadedPaths.add(storagePath);
    }

    return uploadedPaths;
  }

  @override
  Future<List<TimeTrackingSession>> getSessions(
    String wsId, {
    int limit = 50,
    int offset = 0,
  }) async {
    final data = await _api.getJson(
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/sessions', {
        'type': 'recent',
        'limit': '$limit',
      }),
    );

    final sessions = data['sessions'] as List<dynamic>? ?? [];
    return sessions
        .map((e) => TimeTrackingSession.fromJson(e as Map<String, dynamic>))
        .toList();
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
    final data = await _api.getJson(
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/sessions', {
        'type': 'history',
        'limit': '$limit',
        'dateFrom': _toApiIso(dateFrom),
        'dateTo': _toApiIso(dateTo),
        if (cursor != null) 'cursor': cursor,
        if (userId != null) 'userId': userId,
      }),
    );
    return TimeTrackingSessionPage.fromJson(data);
  }

  @override
  Future<TimeTrackingSession?> getRunningSession(String wsId) async {
    final data = await _api.getJson(
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/sessions', {
        'type': 'running',
      }),
    );

    final session = data['session'];
    if (session == null) return null;
    return TimeTrackingSession.fromJson(session as Map<String, dynamic>);
  }

  @override
  Future<TimeTrackingSession> startSession(
    String wsId, {
    String? title,
    String? categoryId,
    String? userId,
    String? parentSessionId,
    bool wasResumed = false,
  }) async {
    final data = await _api.postJson(
      '/api/v1/workspaces/$wsId/time-tracking/sessions',
      {
        'title': title ?? 'Work session',
        if (categoryId != null) 'categoryId': categoryId,
        if (userId != null) 'userId': userId,
        if (parentSessionId != null) 'parentSessionId': parentSessionId,
        if (wasResumed) 'wasResumed': true,
      },
    );

    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  @override
  Future<TimeTrackingSession> stopSession(String wsId, String sessionId) async {
    final data = await _api.patchJson(
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      {'action': 'stop'},
    );

    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  @override
  Future<TimeTrackingSession> pauseSession(
    String wsId,
    String sessionId, {
    String? breakTypeId,
    String? breakTypeName,
  }) async {
    final data = await _api.patchJson(
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      {
        'action': 'pause',
        if (breakTypeId != null) 'breakTypeId': breakTypeId,
        if (breakTypeName != null) 'breakTypeName': breakTypeName,
      },
    );

    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  @override
  Future<TimeTrackingSession> resumeSession(
    String wsId,
    String sessionId,
  ) async {
    final data = await _api.patchJson(
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      {'action': 'resume'},
    );

    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
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

    final data = await _api.patchJson(
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      body,
    );

    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  @override
  Future<void> deleteSession(String wsId, String sessionId) async {
    await _api.deleteJson(
      '/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
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
    final data = await _api.postJson(
      '/api/v1/workspaces/$wsId/time-tracking/sessions',
      {
        'title': title,
        'startTime': _toApiIso(startTime),
        'endTime': _toApiIso(endTime),
        if (categoryId != null) 'categoryId': categoryId,
        if (description != null) 'description': description,
      },
    );

    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  @override
  Future<List<TimeTrackingCategory>> getCategories(String wsId) async {
    final data = await _api.getJson(
      '/api/v1/workspaces/$wsId/time-tracking/categories',
    );
    final categories = data['categories'] as List<dynamic>? ?? [];
    return categories
        .map((e) => TimeTrackingCategory.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<TimeTrackingCategory> createCategory(
    String wsId,
    String name, {
    String? color,
    String? description,
  }) async {
    final data = await _api.postJson(
      '/api/v1/workspaces/$wsId/time-tracking/categories',
      {
        'name': name,
        if (color != null) 'color': color,
        if (description != null) 'description': description,
      },
    );

    return TimeTrackingCategory.fromJson(
      data['category'] as Map<String, dynamic>,
    );
  }

  @override
  Future<TimeTrackingBreak?> getActiveBreak(
    String wsId,
    String sessionId,
  ) async {
    final data = await _api.getJson(
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
    final data = await _api.getJson(
      _withQuery('/api/v1/workspaces/$wsId/time-tracker/stats', {
        if (userId != null && userId.isNotEmpty) 'userId': userId,
        'isPersonal': isPersonal.toString(),
        'summaryOnly': 'true',
        if (timezone != null) 'timezone': timezone,
      }),
    );

    return TimeTrackerStats(
      todayTime: data['todayTime'] as int? ?? 0,
      weekTime: data['weekTime'] as int? ?? 0,
      monthTime: data['monthTime'] as int? ?? 0,
      streak: data['streak'] as int? ?? 0,
    );
  }

  @override
  Future<TimeTrackingPeriodStats> getPeriodStats(
    String wsId, {
    required DateTime dateFrom,
    required DateTime dateTo,
    String? userId,
  }) async {
    final data = await _api.getJson(
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/stats/period', {
        'dateFrom': _toApiIso(dateFrom),
        'dateTo': _toApiIso(dateTo),
        if (userId != null) 'userId': userId,
      }),
    );
    return TimeTrackingPeriodStats.fromJson(data);
  }

  @override
  Future<List<TimeTrackingGoal>> getGoals(String wsId, {String? userId}) async {
    final data = await _api.getJson(
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/goals', {
        if (userId != null && userId.isNotEmpty) 'userId': userId,
      }),
    );

    final goals = data['goals'] as List<dynamic>? ?? [];
    return goals
        .map((e) => TimeTrackingGoal.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<TimeTrackingGoal> createGoal(
    String wsId, {
    required int dailyGoalMinutes,
    String? categoryId,
    int? weeklyGoalMinutes,
    bool isActive = true,
  }) async {
    final body = <String, dynamic>{
      'dailyGoalMinutes': dailyGoalMinutes,
      'isActive': isActive,
      if (categoryId != null) 'categoryId': categoryId,
      if (weeklyGoalMinutes != null) 'weeklyGoalMinutes': weeklyGoalMinutes,
    };

    final data = await _api.postJson(
      '/api/v1/workspaces/$wsId/time-tracking/goals',
      body,
    );

    return TimeTrackingGoal.fromJson(data['goal'] as Map<String, dynamic>);
  }

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
  }) async {
    final body = <String, dynamic>{
      if (includeCategoryId || categoryId != null) 'categoryId': categoryId,
      if (dailyGoalMinutes != null) 'dailyGoalMinutes': dailyGoalMinutes,
      if (includeWeeklyGoalMinutes || weeklyGoalMinutes != null)
        'weeklyGoalMinutes': weeklyGoalMinutes,
      if (isActive != null) 'isActive': isActive,
    };

    final data = await _api.patchJson(
      '/api/v1/workspaces/$wsId/time-tracking/goals/$goalId',
      body,
    );

    return TimeTrackingGoal.fromJson(data['goal'] as Map<String, dynamic>);
  }

  @override
  Future<void> deleteGoal(String wsId, String goalId) async {
    await _api.deleteJson(
      '/api/v1/workspaces/$wsId/time-tracking/goals/$goalId',
    );
  }

  @override
  Future<List<TimeTrackingRequest>> getRequests(
    String wsId, {
    String? status,
    int limit = 50,
    int offset = 0,
  }) async {
    final data = await _api.getJson(
      _withQuery('/api/v1/workspaces/$wsId/time-tracking/requests', {
        'limit': '$limit',
        'page': '${(offset ~/ limit) + 1}',
        if (status != null) 'status': status,
      }),
    );

    final requests = data['requests'] as List<dynamic>? ?? [];
    return requests
        .map((e) => TimeTrackingRequest.fromJson(e as Map<String, dynamic>))
        .toList();
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
    final uploadedImagePaths = await _uploadRequestImages(
      wsId,
      requestId,
      localPaths,
    );

    final fields = <String, dynamic>{
      'requestId': requestId,
      'title': title,
      if (description != null) 'description': description,
      if (categoryId != null) 'categoryId': categoryId,
      if (startTime != null) 'startTime': _toApiIso(startTime),
      if (endTime != null) 'endTime': _toApiIso(endTime),
      if (uploadedImagePaths.isNotEmpty) 'imagePaths': uploadedImagePaths,
    };

    final data = await _api.postJson(
      '/api/v1/workspaces/$wsId/time-tracking/requests',
      fields,
    );

    return TimeTrackingRequest.fromJson(
      data['request'] as Map<String, dynamic>,
    );
  }

  @override
  Future<WorkspaceSettings?> getWorkspaceSettings(String wsId) async {
    final data = await _api.getJson('/api/v1/workspaces/$wsId/settings');
    if (data.isEmpty) {
      return null;
    }
    return WorkspaceSettings.fromJson(data);
  }

  @override
  Future<String?> getWorkspaceConfigValue(String wsId, String configId) async {
    final data = await _api.getJson(
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

    await _api.putJson(
      '/api/v1/workspaces/$wsId/time-tracking/threshold',
      body,
    );
  }

  @override
  Future<void> updateRequestStatus(
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

    final data = await _api.patchJson(
      '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId',
      body,
    );

    // Some actions return the full request, others return a success envelope.
    // Since callers ignore the return value and reload the list, we just need
    // to ensure the response indicates success.
    final request = data['request'];
    final isSuccess = data['success'] == true;
    final hasId =
        data.containsKey('id') || (request is Map && request.containsKey('id'));

    if (isSuccess || hasId || request != null) {
      return;
    }

    throw const ApiException(
      message: 'Invalid response from updateRequestStatus',
      statusCode: 0,
    );
  }

  @override
  Future<List<TimeTrackingRequestComment>> getRequestComments(
    String wsId,
    String requestId,
  ) async {
    final data = await _api.getJson(
      '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments',
    );

    final comments = data['comments'] as List<dynamic>? ?? [];
    return comments
        .map(
          (e) => TimeTrackingRequestComment.fromJson(e as Map<String, dynamic>),
        )
        .toList();
  }

  @override
  Future<TimeTrackingRequestComment> addRequestComment(
    String wsId,
    String requestId,
    String content,
  ) async {
    final data = await _api.postJson(
      '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments',
      {'content': content},
    );

    return TimeTrackingRequestComment.fromJson(data);
  }

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
    final uploadedImagePaths = await _uploadRequestImages(
      wsId,
      requestId,
      newImageLocalPaths ?? const <String>[],
    );

    final body = <String, dynamic>{
      'title': title,
      'startTime': _toApiIso(startTime),
      'endTime': _toApiIso(endTime),
      if (description != null) 'description': description,
      if (removedImages != null && removedImages.isNotEmpty)
        'removedImages': removedImages,
      if (uploadedImagePaths.isNotEmpty) 'newImagePaths': uploadedImagePaths,
    };

    final data = await _api.putJson(
      '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId',
      body,
    );

    return TimeTrackingRequest.fromJson(
      data['request'] as Map<String, dynamic>,
    );
  }

  @override
  Future<TimeTrackingRequestComment> updateRequestComment(
    String wsId,
    String requestId,
    String commentId,
    String content,
  ) async {
    final data = await _api.patchJson(
      '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments/$commentId',
      {'content': content},
    );

    return TimeTrackingRequestComment.fromJson(data);
  }

  @override
  Future<void> deleteRequestComment(
    String wsId,
    String requestId,
    String commentId,
  ) async {
    await _api.deleteJson(
      '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments/$commentId',
    );
  }

  @override
  Future<TimeTrackingRequestActivityResponse> getRequestActivities(
    String wsId,
    String requestId, {
    int page = 1,
    int limit = 5,
  }) async {
    final data = await _api.getJson(
      _withQuery(
        '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/activity',
        {
          'page': '$page',
          'limit': '$limit',
        },
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
    final data = await _api.getJson(
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
}
