import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Repository for time tracking operations.
class TimeTrackerRepository {
  Future<List<TimeTrackingSession>> getSessions(
    String wsId, {
    int limit = 50,
    int offset = 0,
  }) async {
    final response = await supabase
        .from('time_tracking_sessions')
        .select()
        .eq('ws_id', wsId)
        .order('start_at', ascending: false)
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
        .isFilter('end_at', null)
        .order('start_at', ascending: false)
        .maybeSingle();

    if (response == null) return null;
    return TimeTrackingSession.fromJson(response);
  }

  Future<TimeTrackingSession> startSession(
    String wsId, {
    String? title,
    String? categoryId,
  }) async {
    final response = await supabase
        .from('time_tracking_sessions')
        .insert({
          'ws_id': wsId,
          'start_at': DateTime.now().toUtc().toIso8601String(),
          if (title != null) 'title': title,
          if (categoryId != null) 'category_id': categoryId,
        })
        .select()
        .single();

    return TimeTrackingSession.fromJson(response);
  }

  Future<TimeTrackingSession> stopSession(String sessionId) async {
    final response = await supabase
        .from('time_tracking_sessions')
        .update({'end_at': DateTime.now().toUtc().toIso8601String()})
        .eq('id', sessionId)
        .select()
        .single();

    return TimeTrackingSession.fromJson(response);
  }

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
}
