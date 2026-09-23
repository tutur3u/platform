import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/meet/meet_meeting.dart';
import 'package:mobile/data/repositories/meet_cache.dart';
import 'package:mobile/data/sources/api_client.dart';

class MeetRepository {
  MeetRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;
  final _cache = MeetCache();

  MeetMeetingsPage? cachedMeetings(String wsId, {String? search}) =>
      _cache.peek(
        wsId,
        MeetEndpoints.meetings(wsId, search: search, page: 1, pageSize: 20),
      );

  Future<MeetMeetingsPage> listMeetings(
    String wsId, {
    String? search,
    int page = 1,
    int pageSize = 20,
    bool forceRefresh = false,
  }) async {
    final path = MeetEndpoints.meetings(
      wsId,
      search: search,
      page: page,
      pageSize: pageSize,
    );
    final response = await _cache.read(
      wsId,
      path,
      () => _api.getJson(path),
      forceRefresh: forceRefresh,
    );
    return MeetMeetingsPage.fromJson(response);
  }

  Future<MeetMeeting> createMeeting(
    String wsId, {
    required String name,
    required DateTime time,
  }) async {
    final response = await _api.postJson(MeetEndpoints.meetings(wsId), {
      'name': name,
      'time': time.toUtc().toIso8601String(),
    });
    await _cache.invalidate(wsId);
    return MeetMeeting.fromJson(
      response['meeting'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<MeetMeeting> updateMeeting(
    String wsId,
    String meetingId, {
    required String name,
    required DateTime time,
  }) async {
    final response = await _api.putJson(
      MeetEndpoints.meeting(wsId, meetingId),
      {'name': name, 'time': time.toUtc().toIso8601String()},
    );
    await _cache.invalidate(wsId);
    return MeetMeeting.fromJson(
      response['meeting'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<void> deleteMeeting(String wsId, String meetingId) async {
    await _api.deleteJson(MeetEndpoints.meeting(wsId, meetingId));
    await _cache.invalidate(wsId);
  }

  Future<Map<String, dynamic>> createRealtimeSession(
    String wsId,
    String meetingId,
  ) => _api.postJson(MeetEndpoints.realtimeToken(wsId, meetingId), {
    'mode': 'call',
  });

  void dispose() {
    _api.dispose();
  }
}
