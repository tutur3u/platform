import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/google_calendar_color.dart';
import 'package:mobile/data/repositories/calendar_pending_overlay.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Repository for calendar event operations.
///
/// Calls the web API endpoints (which handle E2EE encryption/decryption
/// server-side) instead of querying Supabase directly. This ensures
/// that encrypted fields (title, description, location) are returned
/// as plaintext to the client.
class CalendarRepository {
  CalendarRepository({ApiClient? apiClient, OfflineMutationQueue? offlineQueue})
    : _api = apiClient ?? ApiClient(),
      _offlineQueue = offlineQueue ?? OfflineMutationQueue.instance;

  final ApiClient _api;
  final OfflineMutationQueue _offlineQueue;

  static String _basePath(String wsId) =>
      '/api/v1/workspaces/$wsId/calendar/events';

  CacheKey _listKey(String wsId, String query) => CacheKey(
    namespace: 'calendar.events',
    userId: currentCacheUserId(),
    workspaceId: wsId,
    params: {'query': query},
  );

  static List<CalendarEvent> _decodeEvents(Object? payload) =>
      (payload as List<Object?>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CalendarEvent.fromJson)
          .toList(growable: false);

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

    final cached = await CacheStore.instance.prefetch<List<CalendarEvent>>(
      key: _listKey(wsId, query),
      policy: CachePolicies.moduleData,
      decode: _decodeEvents,
      fetch: () async {
        final response = await _api.getJson('${_basePath(wsId)}$query');
        return response['data'] as List<dynamic>? ?? const [];
      },
      tags: ['module:calendar', 'workspace:$wsId'],
    );
    return overlayPendingCalendarEvents(
      wsId,
      cached.data ?? const [],
      await OfflineMutationQueue.instance.listPending(),
      start: start,
      end: end,
    );
  }

  Future<CalendarEvent?> getEventById(String wsId, String eventId) async {
    try {
      final result = await CacheStore.instance.prefetch<CalendarEvent>(
        key: CacheKey(
          namespace: 'calendar.event.detail',
          userId: currentCacheUserId(),
          workspaceId: wsId,
          params: {'id': eventId},
        ),
        policy: CachePolicies.detail,
        decode: (payload) => CalendarEvent.fromJson(
          (payload! as Map<String, dynamic>).cast<String, dynamic>(),
        ),
        fetch: () => _api.getJson('${_basePath(wsId)}/$eventId'),
        tags: ['module:calendar', 'workspace:$wsId'],
      );
      final events = overlayPendingCalendarEvents(wsId, [
        if (result.data != null) result.data!,
      ], await OfflineMutationQueue.instance.listPending());
      for (final event in events) {
        if (event.id == eventId) {
          return event;
        }
      }
      return null;
    } on ApiException catch (e) {
      if (e.statusCode == 404) {
        return null;
      }
      if (e.statusCode == 0) {
        final local = overlayPendingCalendarEvents(
          wsId,
          const [],
          await OfflineMutationQueue.instance.listPending(),
        );
        for (final event in local) {
          if (event.id == eventId) {
            return event;
          }
        }
      }
      rethrow;
    }
  }

  Future<CalendarEvent> createEvent(
    String wsId,
    Map<String, dynamic> data,
  ) async {
    final id = newLocalMutationId(timeOrdered: true);
    final payload = {...data, 'requestId': id};
    final path = _basePath(wsId);
    if (await _offlineQueue.enqueueIfOffline(
      feature: 'calendar',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: id,
    )) {
      return CalendarEvent.fromJson({...payload, 'id': id, 'ws_id': wsId});
    }
    try {
      final response = await _api.postJson(path, payload);
      await CacheStore.instance.invalidateTags({
        'module:calendar',
        'workspace:$wsId',
      });
      return CalendarEvent.fromJson(response);
    } on ApiException catch (error) {
      if (await _offlineQueue.enqueueAfterNetworkFailure(
        error: error,
        feature: 'calendar',
        method: 'POST',
        path: path,
        workspaceId: wsId,
        payload: payload,
        entityId: id,
        replaySafe: false,
      )) {
        return CalendarEvent.fromJson({...payload, 'id': id, 'ws_id': wsId});
      }
      rethrow;
    }
  }

  Future<GoogleCalendarColorOptions?> getGoogleColorOptionsForEvent(
    String wsId,
    CalendarEvent event,
  ) async {
    if (event.provider != 'google' || event.sourceCalendarId == null) {
      return null;
    }
    final response = await _api.getJson(
      '/api/v1/workspaces/$wsId/calendar/default-source',
    );
    final matches = (response['options'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .where(
          (connection) =>
              connection['workspaceCalendarId'] == event.sourceCalendarId &&
              connection['provider'] == 'google',
        )
        .toList();
    if (matches.length != 1 || matches.single['connectionId'] is! String) {
      return null;
    }
    return await getGoogleColorOptions(
      wsId,
      matches.single['connectionId'] as String,
    );
  }

  Future<GoogleCalendarColorOptions> getGoogleColorOptions(
    String wsId,
    String connectionId,
  ) async {
    final query = Uri(queryParameters: {'connectionId': connectionId}).query;
    final response = await _api.getJson(
      '/api/v1/workspaces/$wsId/calendar/colors?$query',
    );
    return GoogleCalendarColorOptions.fromJson(response, connectionId);
  }

  /// Provider choices need a fresh connection and are never queued offline.
  Future<CalendarEvent?> updateProviderColor(
    String wsId,
    String eventId,
    GoogleCalendarColorChoice choice,
  ) async {
    await _api.putJson('${_basePath(wsId)}/$eventId', {
      'providerColor': choice.toJson(),
    });
    await CacheStore.instance.invalidateTags({
      'module:calendar',
      'workspace:$wsId',
    });
    return await getEventById(wsId, eventId);
  }

  Future<void> updateEvent(
    String wsId,
    String eventId,
    Map<String, dynamic> data,
  ) async {
    final path = '${_basePath(wsId)}/$eventId';
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'calendar',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      payload: data,
      entityId: eventId,
    )) {
      return;
    }
    try {
      await _api.putJson(path, data);
    } on ApiException catch (error) {
      if (!await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
        error: error,
        feature: 'calendar',
        method: 'PUT',
        path: path,
        workspaceId: wsId,
        payload: data,
        entityId: eventId,
        replaySafe: false,
      )) {
        rethrow;
      }
    }
    await CacheStore.instance.invalidateTags({
      'module:calendar',
      'workspace:$wsId',
    });
  }

  Future<void> deleteEvent(String wsId, String eventId) async {
    // An explicit JSON body keeps DELETE compatible with the signed gateway.
    final path = '${_basePath(wsId)}/$eventId';
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'calendar',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      payload: {},
      entityId: eventId,
    )) {
      return;
    }
    try {
      await _api.deleteJson(path, body: {});
    } on ApiException catch (error) {
      if (!await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
        error: error,
        feature: 'calendar',
        method: 'DELETE',
        path: path,
        workspaceId: wsId,
        payload: {},
        entityId: eventId,
        replaySafe: false,
      )) {
        rethrow;
      }
    }
    await CacheStore.instance.invalidateTags({
      'module:calendar',
      'workspace:$wsId',
    });
  }

  void dispose() => _api.dispose();
}
