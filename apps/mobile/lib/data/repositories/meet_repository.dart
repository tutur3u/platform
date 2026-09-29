import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
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
    final source = (response['meetings'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final base = MeetEndpoints.meetings(wsId);
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'meet',
      pathContains: base,
      source: source,
      pending: (await OfflineMutationQueue.instance.listPending())
          .where(
            (item) =>
                item.path == base ||
                item.path == MeetEndpoints.meeting(wsId, item.entityId ?? ''),
          )
          .toList(growable: false),
      includeCreates: page == 1 && (search == null || search.isEmpty),
      matchesQuery: search == null || search.isEmpty
          ? null
          : (row) => (row['name'] as String? ?? '').toLowerCase().contains(
              search.toLowerCase(),
            ),
    );
    return MeetMeetingsPage.fromJson({
      ...response,
      'meetings': rows,
      'totalCount':
          (response['totalCount'] as int? ?? source.length) +
          rows.length -
          source.length,
    });
  }

  Future<MeetMeeting> createMeeting(
    String wsId, {
    required String name,
    required DateTime time,
    DateTime? scheduleEndTime,
  }) async {
    final path = MeetEndpoints.meetings(wsId);
    final payload = <String, dynamic>{
      'name': name,
      'time': time.toUtc().toIso8601String(),
      if (scheduleEndTime != null)
        'schedule': {'endTime': scheduleEndTime.toUtc().toIso8601String()},
    };
    final result = await queueOrSendValue<MeetMeeting>(
      feature: 'meet',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => MeetMeeting.fromJson({...payload, 'id': id}),
      send: () async {
        final response = await _api.postJson(path, payload);
        return MeetMeeting.fromJson(
          response['meeting'] as Map<String, dynamic>? ??
              const <String, dynamic>{},
        );
      },
    );
    await _cache.invalidate(wsId);
    return result;
  }

  Future<MeetMeeting> updateMeeting(
    String wsId,
    String meetingId, {
    required String name,
    required DateTime time,
  }) async {
    final path = MeetEndpoints.meeting(wsId, meetingId);
    final payload = {'name': name, 'time': time.toUtc().toIso8601String()};
    final result = await queueOrSendValue<MeetMeeting>(
      feature: 'meet',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      entityId: meetingId,
      payload: payload,
      pendingValue: (id) => MeetMeeting.fromJson({...payload, 'id': id}),
      send: () async {
        final response = await _api.putJson(path, payload);
        return MeetMeeting.fromJson(
          response['meeting'] as Map<String, dynamic>? ??
              const <String, dynamic>{},
        );
      },
    );
    await _cache.invalidate(wsId);
    return result;
  }

  Future<void> deleteMeeting(String wsId, String meetingId) async {
    final path = MeetEndpoints.meeting(wsId, meetingId);
    await queueOrSendVoid(
      feature: 'meet',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: meetingId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
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
      readThroughJson(
        api: _api,
        namespace: 'meet.costs',
        workspaceId: wsId,
        path: MeetEndpoints.costs(wsId, meetingId),
      );

  Future<Map<String, dynamic>> getMeetingReview(
    String wsId,
    String meetingId,
  ) => readThroughJson(
    api: _api,
    namespace: 'meet.review',
    workspaceId: wsId,
    path: MeetEndpoints.review(wsId, meetingId),
  );

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
      readThroughJsonList(
        api: _api,
        namespace: 'meet.assistantReviews',
        workspaceId: wsId,
        path: MeetEndpoints.assistantReviews(wsId, meetingId),
      );

  Future<Map<String, dynamic>> getMiraReview(
    String wsId,
    String meetingId,
    String messageId,
  ) => readThroughJson(
    api: _api,
    namespace: 'meet.assistantReview',
    workspaceId: wsId,
    path: MeetEndpoints.assistantReviews(wsId, meetingId, messageId: messageId),
  );

  Future<Map<String, dynamic>> decideMiraReview(
    String wsId,
    String meetingId, {
    required String messageId,
    required int revision,
    required String action,
  }) async {
    final path = MeetEndpoints.assistantReviews(wsId, meetingId);
    final payload = {
      'messageId': messageId,
      'revision': revision,
      'action': action,
    };
    return await queueOrSendValue<Map<String, dynamic>>(
      feature: 'meet',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      entityId: messageId,
      payload: payload,
      pendingValue: (_) => {'pending': true},
      send: () =>
          _api.postJson(path, payload, timeout: const Duration(seconds: 125)),
    );
  }

  void dispose() {
    _api.dispose();
  }
}
