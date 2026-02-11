import 'dart:convert';

import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';
import 'package:mobile/data/models/time_tracking/break_record.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/time_tracking/request_activity.dart';
import 'package:mobile/data/models/time_tracking/request_comment.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _pomodoroKey = 'pomodoro_settings';

abstract class ITimeTrackerRepository {
  Future<List<TimeTrackingSession>> getSessions(
    String wsId, {
    int limit = 50,
    int offset = 0,
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
    String userId, {
    bool isPersonal = false,
    String? timezone,
  });

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
  });

  Future<TimeTrackingRequest> updateRequestStatus(
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
    List<String>? newImagePaths,
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
  TimeTrackerRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

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

  MediaType? _getImageMimeType(String filePath) {
    final mimeType = lookupMimeType(filePath);
    if (mimeType == null) return null;
    final parts = mimeType.split('/');
    if (parts.length != 2) return null;
    return MediaType(parts[0], parts[1]);
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
    if (startTime != null) body['startTime'] = startTime.toIso8601String();
    if (endTime != null) body['endTime'] = endTime.toIso8601String();

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
        'startTime': startTime.toIso8601String(),
        'endTime': endTime.toIso8601String(),
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
    String userId, {
    bool isPersonal = false,
    String? timezone,
  }) async {
    final data = await _api.getJson(
      _withQuery('/api/v1/workspaces/$wsId/time-tracker/stats', {
        'userId': userId,
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
  }) async {
    final data = await _api.postJson(
      '/api/v1/workspaces/$wsId/time-tracking/requests',
      {
        'title': title,
        if (description != null) 'description': description,
        if (categoryId != null) 'categoryId': categoryId,
        if (startTime != null) 'startTime': startTime.toIso8601String(),
        if (endTime != null) 'endTime': endTime.toIso8601String(),
      },
    );

    return TimeTrackingRequest.fromJson(
      data['request'] as Map<String, dynamic>,
    );
  }

  @override
  Future<TimeTrackingRequest> updateRequestStatus(
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

    final request = data['request'];
    if (request is Map<String, dynamic>) {
      return TimeTrackingRequest.fromJson(request);
    }

    return TimeTrackingRequest.fromJson(data);
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
    List<String>? newImagePaths,
  }) async {
    final fields = <String, String>{
      'title': title,
      'startTime': startTime.toIso8601String(),
      'endTime': endTime.toIso8601String(),
      if (description != null) 'description': description,
      if (removedImages != null && removedImages.isNotEmpty)
        'removedImages': jsonEncode(removedImages),
    };

    final files = <ApiMultipartFile>[];
    if (newImagePaths != null && newImagePaths.isNotEmpty) {
      for (var i = 0; i < newImagePaths.length; i++) {
        final imagePath = newImagePaths[i];
        if (imagePath.isEmpty) {
          continue;
        }
        files.add(
          ApiMultipartFile(
            field: 'image_$i',
            filePath: imagePath,
            contentType: _getImageMimeType(imagePath),
          ),
        );
      }
    }

    final data = await _api.sendMultipart(
      'PUT',
      '/api/v1/workspaces/$wsId/time-tracking/requests/$requestId',
      fields: fields,
      files: files,
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
        if (dateFrom != null) 'dateFrom': dateFrom.toIso8601String(),
        if (dateTo != null) 'dateTo': dateTo.toIso8601String(),
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
