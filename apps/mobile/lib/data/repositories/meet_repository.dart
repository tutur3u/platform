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
    String meetingId, {
    String? deviceId,
    String? joinMode,
  }) => _api.postJson(MeetEndpoints.realtimeToken(wsId, meetingId), {
    'mode': 'call',
    if (deviceId != null) 'deviceId': deviceId,
    if (joinMode != null) 'joinMode': joinMode,
  });

  Future<Map<String, dynamic>> getRoomCosts(String wsId, String meetingId) =>
      _api.getJson(MeetEndpoints.costs(wsId, meetingId));

  Future<String> askPersonalMira(
    String wsId,
    String meetingId, {
    required String requestId,
    required int startedAt,
    required String question,
    required String timezone,
    required List<Map<String, dynamic>> history,
  }) async {
    final response = await _api
        .postJson(MeetEndpoints.personalAssistant(wsId, meetingId), {
          'requestId': requestId,
          'startedAt': startedAt,
          'question': question,
          'timezone': timezone,
          'history': history,
        }, timeout: const Duration(seconds: 125));
    final text = response['text'] as String?;
    if (text == null || text.trim().isEmpty) {
      throw StateError('Meet private answer unavailable');
    }
    return text;
  }

  Future<Map<String, dynamic>> askRoomMira(
    String wsId,
    String meetingId, {
    required String messageId,
    required String timezone,
  }) => _api.postJson(MeetEndpoints.roomAssistant(wsId, meetingId), {
    'messageId': messageId,
    'timezone': timezone,
  }, timeout: const Duration(seconds: 125));

  Future<List<dynamic>> listMiraReviews(String wsId, String meetingId) =>
      _api.getJsonList(MeetEndpoints.assistantReviews(wsId, meetingId));

  Future<Map<String, dynamic>> getMiraReview(
    String wsId,
    String meetingId,
    String messageId,
  ) => _api.getJson(
    MeetEndpoints.assistantReviews(wsId, meetingId, messageId: messageId),
  );

  Future<Map<String, dynamic>> decideMiraReview(
    String wsId,
    String meetingId, {
    required String messageId,
    required int revision,
    required String action,
  }) => _api.postJson(MeetEndpoints.assistantReviews(wsId, meetingId), {
    'messageId': messageId,
    'revision': revision,
    'action': action,
  }, timeout: const Duration(seconds: 125));

  void dispose() {
    _api.dispose();
  }
}
