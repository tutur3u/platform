import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/time_tracking/break_record.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/request.dart';
import 'package:mobile/data/models/time_tracking/request_comment.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _pomodoroKey = 'pomodoro_settings';

/// Repository for time tracking operations using API endpoints.
class TimeTrackerRepository {
  /// Get the API base URL from ApiConfig
  String get _baseUrl => ApiConfig.baseUrl;

  /// Get authorization headers with current session token
  Future<Map<String, String>> _getHeaders() async {
    final session = supabase.auth.currentSession;
    if (session == null) {
      throw Exception('No active session');
    }

    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ${session.accessToken}',
    };
  }

  // ── Sessions ────────────────────────────────────────────────────

  Future<List<TimeTrackingSession>> getSessions(
    String wsId, {
    int limit = 50,
    int offset = 0,
  }) async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions?type=recent&limit=$limit',
      ),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load sessions: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    final sessions = data['sessions'] as List<dynamic>;
    return sessions
        .map((e) => TimeTrackingSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<TimeTrackingSession?> getRunningSession(String wsId) async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions?type=running',
      ),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load running session: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    final session = data['session'];
    if (session == null) return null;
    return TimeTrackingSession.fromJson(session as Map<String, dynamic>);
  }

  Future<TimeTrackingSession> startSession(
    String wsId, {
    String? title,
    String? categoryId,
    String? userId,
    String? parentSessionId,
    bool wasResumed = false,
  }) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse('$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions'),
      headers: headers,
      body: json.encode({
        'title': title ?? 'Work session',
        if (categoryId != null) 'categoryId': categoryId,
        if (userId != null) 'userId': userId,
        if (parentSessionId != null) 'parentSessionId': parentSessionId,
        if (wasResumed) 'wasResumed': true,
      }),
    );

    if (response.statusCode != 201) {
      throw Exception('Failed to start session: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  Future<TimeTrackingSession> stopSession(String wsId, String sessionId) async {
    final headers = await _getHeaders();
    final response = await http.patch(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      ),
      headers: headers,
      body: json.encode({'action': 'stop'}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to stop session: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  Future<TimeTrackingSession> pauseSession(
    String wsId,
    String sessionId, {
    String? breakTypeId,
    String? breakTypeName,
  }) async {
    final headers = await _getHeaders();
    final response = await http.patch(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      ),
      headers: headers,
      body: json.encode({
        'action': 'pause',
        if (breakTypeId != null) 'breakTypeId': breakTypeId,
        if (breakTypeName != null) 'breakTypeName': breakTypeName,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to pause session: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  Future<TimeTrackingSession> resumeSession(
    String wsId,
    String sessionId,
  ) async {
    final headers = await _getHeaders();
    final response = await http.patch(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      ),
      headers: headers,
      body: json.encode({'action': 'resume'}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to resume session: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

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
    final headers = await _getHeaders();
    final body = <String, dynamic>{'action': 'edit'};

    if (title != null) body['title'] = title;
    if (description != null) body['description'] = description;
    if (categoryId != null) body['categoryId'] = categoryId;
    if (taskId != null) body['taskId'] = taskId;
    if (startTime != null) body['startTime'] = startTime.toIso8601String();
    if (endTime != null) body['endTime'] = endTime.toIso8601String();

    final response = await http.patch(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      ),
      headers: headers,
      body: json.encode(body),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to edit session: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  Future<void> deleteSession(String wsId, String sessionId) async {
    final headers = await _getHeaders();
    final response = await http.delete(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId',
      ),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to delete session: ${response.body}');
    }
  }

  Future<TimeTrackingSession> createMissedEntry(
    String wsId, {
    required String title,
    required DateTime startTime,
    required DateTime endTime,
    String? categoryId,
    String? description,
  }) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse('$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions'),
      headers: headers,
      body: json.encode({
        'title': title,
        'startTime': startTime.toIso8601String(),
        'endTime': endTime.toIso8601String(),
        if (categoryId != null) 'categoryId': categoryId,
        if (description != null) 'description': description,
      }),
    );

    if (response.statusCode != 201) {
      throw Exception('Failed to create missed entry: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingSession.fromJson(
      data['session'] as Map<String, dynamic>,
    );
  }

  // ── Categories ──────────────────────────────────────────────────

  Future<List<TimeTrackingCategory>> getCategories(String wsId) async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/categories',
      ),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load categories: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    final categories = data['categories'] as List<dynamic>;
    return categories
        .map(
          (e) => TimeTrackingCategory.fromJson(e as Map<String, dynamic>),
        )
        .toList();
  }

  Future<TimeTrackingCategory> createCategory(
    String wsId,
    String name, {
    String? color,
    String? description,
  }) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/categories',
      ),
      headers: headers,
      body: json.encode({
        'name': name,
        if (color != null) 'color': color,
        if (description != null) 'description': description,
      }),
    );

    if (response.statusCode != 201) {
      throw Exception('Failed to create category: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingCategory.fromJson(
      data['category'] as Map<String, dynamic>,
    );
  }

  // ── Breaks ──────────────────────────────────────────────────────

  Future<TimeTrackingBreak?> getActiveBreak(
    String wsId,
    String sessionId,
  ) async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions/$sessionId/breaks/active',
      ),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load active break: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    final breakData = data['break'];
    if (breakData == null) return null;
    return TimeTrackingBreak.fromJson(breakData as Map<String, dynamic>);
  }

  // ── Stats ───────────────────────────────────────────────────────

  Future<TimeTrackerStats> getStats(
    String wsId,
    String userId, {
    bool isPersonal = false,
    String? timezone,
  }) async {
    final headers = await _getHeaders();
    final queryParams = {
      'userId': userId,
      'isPersonal': isPersonal.toString(),
      if (timezone != null) 'timezone': timezone,
      'summaryOnly': 'true',
    };

    final uri = Uri.parse(
      '$_baseUrl/api/v1/workspaces/$wsId/time-tracker/stats',
    ).replace(queryParameters: queryParams);

    final response = await http.get(uri, headers: headers);

    if (response.statusCode != 200) {
      throw Exception('Failed to load stats: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackerStats(
      todayTime: data['todayTime'] as int? ?? 0,
      weekTime: data['weekTime'] as int? ?? 0,
      monthTime: data['monthTime'] as int? ?? 0,
      streak: data['streak'] as int? ?? 0,
    );
  }

  // ── Requests ────────────────────────────────────────────────────

  Future<List<TimeTrackingRequest>> getRequests(
    String wsId, {
    String? status,
    int limit = 50,
    int offset = 0,
  }) async {
    final headers = await _getHeaders();
    final queryParams = <String, String>{
      'limit': limit.toString(),
      'page': ((offset ~/ limit) + 1).toString(),
    };

    if (status != null) {
      queryParams['status'] = status;
    }

    final uri = Uri.parse(
      '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/requests',
    ).replace(queryParameters: queryParams);

    final response = await http.get(uri, headers: headers);

    if (response.statusCode != 200) {
      throw Exception('Failed to load requests: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    final requests = data['requests'] as List<dynamic>;
    return requests
        .map(
          (e) => TimeTrackingRequest.fromJson(e as Map<String, dynamic>),
        )
        .toList();
  }

  Future<TimeTrackingRequest> createRequest(
    String wsId, {
    required String title,
    String? description,
    String? categoryId,
    DateTime? startTime,
    DateTime? endTime,
  }) async {
    final headers = await _getHeaders();

    // For requests, we need to use multipart/form-data
    // as the API expects FormData for image uploads
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$_baseUrl/api/v1/workspaces/$wsId/time-tracking/requests'),
    );

    request.headers.addAll({
      'Authorization': headers['Authorization']!,
    });

    request.fields['title'] = title;
    if (description != null) request.fields['description'] = description;
    if (categoryId != null) request.fields['categoryId'] = categoryId;
    if (startTime != null) {
      request.fields['startTime'] = startTime.toIso8601String();
    }
    if (endTime != null) {
      request.fields['endTime'] = endTime.toIso8601String();
    }

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode != 201) {
      throw Exception('Failed to create request: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingRequest.fromJson(
      data['request'] as Map<String, dynamic>,
    );
  }

  Future<TimeTrackingRequest> updateRequestStatus(
    String wsId,
    String requestId, {
    required ApprovalStatus status,
    String? reason,
  }) async {
    final headers = await _getHeaders();
    final body = <String, dynamic>{};

    switch (status) {
      case ApprovalStatus.approved:
        body['action'] = 'approve';
      case ApprovalStatus.rejected:
        body['action'] = 'reject';
        if (reason != null) body['rejection_reason'] = reason;
      case ApprovalStatus.needsInfo:
        body['action'] = 'needs_info';
        if (reason != null) body['needs_info_reason'] = reason;
      case ApprovalStatus.pending:
        body['action'] = 'resubmit';
    }

    final response = await http.patch(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/requests/$requestId',
      ),
      headers: headers,
      body: json.encode(body),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to update request status: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingRequest.fromJson(data);
  }

  // ── Request Comments ────────────────────────────────────────────

  Future<List<TimeTrackingRequestComment>> getRequestComments(
    String wsId,
    String requestId,
  ) async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments',
      ),
      headers: headers,
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to load request comments: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    final comments = data['comments'] as List<dynamic>;
    return comments
        .map(
          (e) => TimeTrackingRequestComment.fromJson(e as Map<String, dynamic>),
        )
        .toList();
  }

  Future<TimeTrackingRequestComment> addRequestComment(
    String wsId,
    String requestId,
    String content,
  ) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse(
        '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/requests/$requestId/comments',
      ),
      headers: headers,
      body: json.encode({'content': content}),
    );

    if (response.statusCode != 201) {
      throw Exception('Failed to add request comment: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    return TimeTrackingRequestComment.fromJson(data);
  }

  // ── Management ──────────────────────────────────────────────────

  Future<List<TimeTrackingSession>> getManagementSessions(
    String wsId, {
    String? search,
    DateTime? dateFrom,
    DateTime? dateTo,
    int limit = 50,
    int offset = 0,
  }) async {
    final headers = await _getHeaders();
    final queryParams = <String, String>{
      'type': 'history',
      'limit': limit.toString(),
    };

    if (search != null && search.isNotEmpty) {
      queryParams['searchQuery'] = search;
    }
    if (dateFrom != null) {
      queryParams['dateFrom'] = dateFrom.toIso8601String();
    }
    if (dateTo != null) {
      queryParams['dateTo'] = dateTo.toIso8601String();
    }

    final uri = Uri.parse(
      '$_baseUrl/api/v1/workspaces/$wsId/time-tracking/sessions',
    ).replace(queryParameters: queryParams);

    final response = await http.get(uri, headers: headers);

    if (response.statusCode != 200) {
      throw Exception('Failed to load management sessions: ${response.body}');
    }

    final data = json.decode(response.body) as Map<String, dynamic>;
    final sessions = data['sessions'] as List<dynamic>;
    return sessions
        .map((e) => TimeTrackingSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Pomodoro Settings (local) ───────────────────────────────────

  Future<void> savePomodoroSettings(PomodoroSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_pomodoroKey, settings.toJsonString());
  }

  Future<PomodoroSettings> loadPomodoroSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_pomodoroKey);
    if (raw == null) return const PomodoroSettings();
    return PomodoroSettings.fromJsonString(raw);
  }
}
