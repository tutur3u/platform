import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Repository for calendar event operations.
///
/// Calls the web API endpoints (which handle E2EE encryption/decryption
/// server-side) instead of querying Supabase directly. This ensures
/// that encrypted fields (title, description, location) are returned
/// as plaintext to the client.
class CalendarRepository {
  CalendarRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  static String _basePath(String wsId) =>
      '/api/v1/workspaces/$wsId/calendar/events';

  Future<List<CalendarEvent>> getEvents(
    String wsId, {
    DateTime? start,
    DateTime? end,
  }) async {
    final params = <String, String>{};
    if (start != null) params['start_at'] = start.toUtc().toIso8601String();
    if (end != null) params['end_at'] = end.toUtc().toIso8601String();

    var query = '';
    if (params.isNotEmpty) {
      final pairs = params.entries.map(
        (e) => '${e.key}=${Uri.encodeComponent(e.value)}',
      );
      query = '?${pairs.join('&')}';
    }

    final response = await _api.getJson('${_basePath(wsId)}$query');

    final data = response['data'] as List<dynamic>? ?? [];
    return data
        .map((e) => CalendarEvent.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<CalendarEvent?> getEventById(String wsId, String eventId) async {
    try {
      final response = await _api.getJson('${_basePath(wsId)}/$eventId');
      return CalendarEvent.fromJson(response);
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<CalendarEvent> createEvent(
    String wsId,
    Map<String, dynamic> data,
  ) async {
    final response = await _api.postJson(_basePath(wsId), data);
    return CalendarEvent.fromJson(response);
  }

  Future<void> updateEvent(
    String wsId,
    String eventId,
    Map<String, dynamic> data,
  ) async {
    await _api.putJson('${_basePath(wsId)}/$eventId', data);
  }

  Future<void> deleteEvent(String wsId, String eventId) async {
    await _api.deleteJson('${_basePath(wsId)}/$eventId');
  }

  void dispose() => _api.dispose();
}
