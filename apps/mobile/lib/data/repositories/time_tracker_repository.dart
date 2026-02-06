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

/// Repository for time tracking operations.
class TimeTrackerRepository {
  // ── Sessions ────────────────────────────────────────────────────

  Future<List<TimeTrackingSession>> getSessions(
    String wsId, {
    int limit = 50,
    int offset = 0,
  }) async {
    final response = await supabase
        .from('time_tracking_sessions')
        .select()
        .eq('ws_id', wsId)
        .eq('is_running', false)
        .eq('pending_approval', false)
        .order('start_time', ascending: false)
        .range(offset, offset + limit - 1);

    return (response as List<dynamic>)
        .map((e) => TimeTrackingSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<TimeTrackingSession?> getRunningSession(String wsId) async {
    final response = await supabase
        .from('time_tracking_sessions')
        .select()
        .eq('ws_id', wsId)
        .eq('is_running', true)
        .order('start_time', ascending: false)
        .limit(1);

    final rows = response as List<dynamic>;
    if (rows.isEmpty) return null;
    return TimeTrackingSession.fromJson(rows.first as Map<String, dynamic>);
  }

  Future<TimeTrackingSession> startSession(
    String wsId, {
    String? title,
    String? categoryId,
    String? userId,
    String? parentSessionId,
    bool wasResumed = false,
  }) async {
    final response = await supabase
        .from('time_tracking_sessions')
        .insert({
          'ws_id': wsId,
          'title': title ?? 'Work session',
          'start_time': DateTime.now().toUtc().toIso8601String(),
          'is_running': true,
          if (categoryId != null) 'category_id': categoryId,
          if (userId != null) 'user_id': userId,
          if (parentSessionId != null) 'parent_session_id': parentSessionId,
          if (wasResumed) 'was_resumed': true,
        })
        .select()
        .single();

    return TimeTrackingSession.fromJson(response);
  }

  Future<TimeTrackingSession> stopSession(String sessionId) async {
    // Read current session to calculate duration
    final current = await supabase
        .from('time_tracking_sessions')
        .select()
        .eq('id', sessionId)
        .single();

    final startTime = DateTime.parse(current['start_time'] as String);
    final endTime = DateTime.now().toUtc();
    final durationSeconds = endTime.difference(startTime).inSeconds;

    final response = await supabase
        .from('time_tracking_sessions')
        .update({
          'end_time': endTime.toIso8601String(),
          'is_running': false,
          'duration_seconds': durationSeconds,
        })
        .eq('id', sessionId)
        .select()
        .single();

    return TimeTrackingSession.fromJson(response);
  }

  Future<TimeTrackingSession> pauseSession(String sessionId) async {
    // Stop the session
    final session = await stopSession(sessionId);

    // Create a break record
    await supabase.from('time_tracking_breaks').insert({
      'session_id': sessionId,
      'break_start': DateTime.now().toUtc().toIso8601String(),
    });

    return session;
  }

  Future<TimeTrackingSession> resumeSession(
    TimeTrackingSession pausedSession,
  ) async {
    // Close the active break
    final activeBreak = await getActiveBreak(pausedSession.id);
    if (activeBreak != null) {
      await supabase
          .from('time_tracking_breaks')
          .update({
            'break_end': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('id', activeBreak.id);
    }

    // Create a new chained session
    return startSession(
      pausedSession.wsId!,
      title: pausedSession.title,
      categoryId: pausedSession.categoryId,
      userId: pausedSession.userId,
      parentSessionId: pausedSession.id,
      wasResumed: true,
    );
  }

  Future<TimeTrackingSession> editSession(
    String sessionId, {
    String? title,
    String? description,
    String? categoryId,
    String? taskId,
    DateTime? startTime,
    DateTime? endTime,
  }) async {
    final updates = <String, dynamic>{};
    if (title != null) updates['title'] = title;
    if (description != null) updates['description'] = description;
    if (categoryId != null) updates['category_id'] = categoryId;
    if (taskId != null) updates['task_id'] = taskId;
    if (startTime != null) {
      updates['start_time'] = startTime.toUtc().toIso8601String();
    }
    if (endTime != null) {
      updates['end_time'] = endTime.toUtc().toIso8601String();
    }

    if (startTime != null || endTime != null) {
      // Recalculate duration if times changed
      final current = await supabase
          .from('time_tracking_sessions')
          .select()
          .eq('id', sessionId)
          .single();

      final start =
          startTime ?? DateTime.parse(current['start_time'] as String);
      final end =
          endTime ??
          (current['end_time'] != null
              ? DateTime.parse(current['end_time'] as String)
              : null);
      if (end != null) {
        updates['duration_seconds'] = end.difference(start).inSeconds;
      }
    }

    final response = await supabase
        .from('time_tracking_sessions')
        .update(updates)
        .eq('id', sessionId)
        .select()
        .single();

    return TimeTrackingSession.fromJson(response);
  }

  Future<void> deleteSession(String sessionId) async {
    await supabase.from('time_tracking_sessions').delete().eq('id', sessionId);
  }

  Future<TimeTrackingSession> createMissedEntry(
    String wsId, {
    required String title,
    required DateTime startTime,
    required DateTime endTime,
    String? categoryId,
    String? description,
  }) async {
    final durationSeconds = endTime.difference(startTime).inSeconds;

    final response = await supabase
        .from('time_tracking_sessions')
        .insert({
          'ws_id': wsId,
          'title': title,
          'start_time': startTime.toUtc().toIso8601String(),
          'end_time': endTime.toUtc().toIso8601String(),
          'is_running': false,
          'duration_seconds': durationSeconds,
          if (categoryId != null) 'category_id': categoryId,
          if (description != null) 'description': description,
        })
        .select()
        .single();

    return TimeTrackingSession.fromJson(response);
  }

  // ── Categories ──────────────────────────────────────────────────

  Future<List<TimeTrackingCategory>> getCategories(String wsId) async {
    final response = await supabase
        .from('time_tracking_categories')
        .select()
        .eq('ws_id', wsId)
        .order('name');

    return (response as List<dynamic>)
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
    final response = await supabase
        .from('time_tracking_categories')
        .insert({
          'ws_id': wsId,
          'name': name,
          if (color != null) 'color': color,
          if (description != null) 'description': description,
        })
        .select()
        .single();

    return TimeTrackingCategory.fromJson(response);
  }

  // ── Breaks ──────────────────────────────────────────────────────

  Future<TimeTrackingBreak?> getActiveBreak(String sessionId) async {
    final response = await supabase
        .from('time_tracking_breaks')
        .select()
        .eq('session_id', sessionId)
        .isFilter('break_end', null)
        .limit(1);

    final rows = response as List<dynamic>;
    if (rows.isEmpty) return null;
    return TimeTrackingBreak.fromJson(rows.first as Map<String, dynamic>);
  }

  // ── Stats ───────────────────────────────────────────────────────

  Future<TimeTrackerStats> getStats(
    String wsId,
    String userId, {
    bool isPersonal = false,
    String? timezone,
  }) async {
    try {
      final response = await supabase.rpc<Map<String, dynamic>?>(
        'get_time_tracker_stats',
        params: {
          '_ws_id': wsId,
          '_user_id': userId,
          if (timezone != null) '_timezone': timezone,
        },
      );

      if (response == null) return const TimeTrackerStats();
      return TimeTrackerStats.fromJson(response);
    } on Exception {
      // If the RPC doesn't exist or fails, compute basic stats client-side
      return _computeBasicStats(wsId);
    }
  }

  Future<TimeTrackerStats> _computeBasicStats(String wsId) async {
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    final weekStart = todayStart.subtract(Duration(days: now.weekday - 1));
    final monthStart = DateTime(now.year, now.month);

    final sessions = await supabase
        .from('time_tracking_sessions')
        .select('duration_seconds, start_time')
        .eq('ws_id', wsId)
        .eq('is_running', false)
        .gte('start_time', monthStart.toUtc().toIso8601String())
        .order('start_time', ascending: false);

    var todayTime = 0;
    var weekTime = 0;
    var monthTime = 0;

    for (final row in sessions as List<dynamic>) {
      final map = row as Map<String, dynamic>;
      final dur = (map['duration_seconds'] as num?)?.toInt() ?? 0;
      final start = DateTime.parse(map['start_time'] as String).toLocal();
      monthTime += dur;
      if (start.isAfter(weekStart)) weekTime += dur;
      if (start.isAfter(todayStart)) todayTime += dur;
    }

    return TimeTrackerStats(
      todayTime: todayTime,
      weekTime: weekTime,
      monthTime: monthTime,
    );
  }

  // ── Requests ────────────────────────────────────────────────────

  Future<List<TimeTrackingRequest>> getRequests(
    String wsId, {
    String? status,
    int limit = 50,
    int offset = 0,
  }) async {
    var query = supabase
        .from('time_tracking_requests')
        .select()
        .eq('ws_id', wsId);

    if (status != null) {
      query = query.eq('approval_status', status);
    }

    final response = await query
        .order('created_at', ascending: false)
        .range(offset, offset + limit - 1);

    return (response as List<dynamic>)
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
    final response = await supabase
        .from('time_tracking_requests')
        .insert({
          'ws_id': wsId,
          'title': title,
          'approval_status': 'pending',
          if (description != null) 'description': description,
          if (categoryId != null) 'category_id': categoryId,
          if (startTime != null)
            'start_time': startTime.toUtc().toIso8601String(),
          if (endTime != null) 'end_time': endTime.toUtc().toIso8601String(),
        })
        .select()
        .single();

    return TimeTrackingRequest.fromJson(response);
  }

  Future<TimeTrackingRequest> updateRequestStatus(
    String requestId, {
    required ApprovalStatus status,
    String? reason,
  }) async {
    final updates = <String, dynamic>{
      'approval_status': approvalStatusToString(status),
    };

    final now = DateTime.now().toUtc().toIso8601String();
    final userId = supabase.auth.currentUser?.id;

    switch (status) {
      case ApprovalStatus.approved:
        updates['approved_by'] = userId;
        updates['approved_at'] = now;
      case ApprovalStatus.rejected:
        updates['rejected_by'] = userId;
        updates['rejected_at'] = now;
        if (reason != null) updates['rejection_reason'] = reason;
      case ApprovalStatus.needsInfo:
        if (reason != null) updates['needs_info_reason'] = reason;
      case ApprovalStatus.pending:
        break;
    }

    final response = await supabase
        .from('time_tracking_requests')
        .update(updates)
        .eq('id', requestId)
        .select()
        .single();

    return TimeTrackingRequest.fromJson(response);
  }

  // ── Request Comments ────────────────────────────────────────────

  Future<List<TimeTrackingRequestComment>> getRequestComments(
    String requestId,
  ) async {
    final response = await supabase
        .from('time_tracking_request_comments')
        .select()
        .eq('request_id', requestId)
        .order('created_at');

    return (response as List<dynamic>)
        .map(
          (e) => TimeTrackingRequestComment.fromJson(e as Map<String, dynamic>),
        )
        .toList();
  }

  Future<TimeTrackingRequestComment> addRequestComment(
    String requestId,
    String content,
  ) async {
    final response = await supabase
        .from('time_tracking_request_comments')
        .insert({
          'request_id': requestId,
          'content': content,
        })
        .select()
        .single();

    return TimeTrackingRequestComment.fromJson(response);
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
    var query = supabase
        .from('time_tracking_sessions')
        .select()
        .eq('ws_id', wsId)
        .eq('is_running', false);

    if (dateFrom != null) {
      query = query.gte('start_time', dateFrom.toUtc().toIso8601String());
    }
    if (dateTo != null) {
      query = query.lte('start_time', dateTo.toUtc().toIso8601String());
    }
    if (search != null && search.isNotEmpty) {
      query = query.ilike('title', '%$search%');
    }

    final response = await query
        .order('start_time', ascending: false)
        .range(offset, offset + limit - 1);

    return (response as List<dynamic>)
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
