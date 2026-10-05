import 'dart:async';

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/local_replica_query.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
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
  CalendarRepository({
    ApiClient? apiClient,
    OfflineMutationQueue? offlineQueue,
    String? Function()? currentUserId,
  }) : _api = apiClient ?? ApiClient(),
       _owner = currentUserId ?? currentCacheUserId,
       _offlineQueue = offlineQueue ?? OfflineMutationQueue.instance;

  final ApiClient _api;
  final OfflineMutationQueue _offlineQueue;
  final String? Function() _owner;

  void _checkOwner(String? userId) {
    if (_owner() != userId) {
      throw const ApiException(
        message: 'Calendar account changed.',
        statusCode: 401,
      );
    }
  }

  Future<Map<String, dynamic>> _readForOwner(
    String path,
    String? userId,
  ) async {
    _checkOwner(userId);
    final value = userId == null
        ? await _api.getJson(path)
        : await ApiClient.runForUser(userId, () => _api.getJson(path));
    _checkOwner(userId);
    return value;
  }

  final Map<String, DateTime> _historyWarmups = {};

  /// Download supported calendar years in bounded cursor pages and preserve
  /// every page plus the lookup metadata required for offline event editing.
  Future<void> prepareOffline(
    String wsId, {
    String? Function()? cacheUserId,
  }) async {
    final owner = cacheUserId ?? _owner;
    final userId = owner();
    if (userId == null) {
      throw StateError('Sign in before preparing offline data.');
    }
    final manifest = OfflineDownloadManifest(
      CacheStore.instance,
      userId,
      owner,
    );
    String? cursor;
    final seen = <String>{};
    for (var page = 0; page < 1000; page++) {
      manifest.checkScope();
      final query = Uri(
        queryParameters: {
          'start_at': '0001-01-01T00:00:00.000Z',
          'end_at': '9999-12-31T23:59:59.999Z',
          'page_size': '200',
          if (cursor != null) 'cursor': cursor,
        },
      ).query;
      final response = await ApiClient.runForUser(
        userId,
        () => _api.getJson('${_basePath(wsId)}?$query'),
      );
      manifest.checkScope();
      if (response['data'] is! List || response['has_more'] is! bool) {
        throw const FormatException('Missing paginated calendar data.');
      }
      final rows = (response['data'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      await manifest.save(
        CacheKey(
          namespace: 'calendar.events',
          userId: userId,
          workspaceId: wsId,
          params: {'query': '?$query'},
        ),
        rows,
      );
      if (response['has_more'] != true) break;
      cursor = response['next_cursor'] as String?;
      if (cursor == null || cursor.isEmpty || !seen.add(cursor)) {
        throw StateError('Calendar download cursor did not advance.');
      }
      if (page == 999) {
        throw StateError('Calendar download pagination limit reached.');
      }
    }
    for (final entry in {
      'accounts': '/api/v1/calendar/auth/accounts?wsId=$wsId',
      'connections': '/api/v1/calendar/connections?wsId=$wsId',
    }.entries) {
      if (owner() != userId) {
        throw StateError('Account changed during offline preparation.');
      }
      final response = await readThroughJson(
        api: _api,
        namespace: 'calendar.${entry.key}',
        workspaceId: wsId,
        path: entry.value,
        forceRefresh: true,
        policy: CachePolicies.offlineCatalog,
        cacheUserId: owner,
      );
      await manifest.save(
        CacheKey(
          namespace: 'calendar.${entry.key}',
          userId: userId,
          workspaceId: wsId,
          params: {'path': entry.value},
        ),
        response,
      );
    }
    await manifest.verify();
    await manifest.reconcile(
      workspaceId: wsId,
      namespaces: {
        'calendar.events',
        'calendar.events.utc.v2',
        'calendar.event.detail',
      },
    );
    manifest.retain('calendar', wsId);
  }

  static String _basePath(String wsId) =>
      '/api/v1/workspaces/$wsId/calendar/events';

  CacheKey _listKey(String wsId, String query, {String? userId}) => CacheKey(
    namespace: 'calendar.events',
    userId: userId ?? _owner(),
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

    final userId = _owner();
    void checkOwner() {
      if (_owner() != userId) {
        throw const ApiException(
          message: 'Calendar account changed.',
          statusCode: 401,
        );
      }
    }

    final key = _listKey(wsId, query, userId: userId);
    final existing = await CacheStore.instance.read<List<CalendarEvent>>(
      key: key,
      decode: _decodeEvents,
    );
    checkOwner();
    if (!existing.hasValue && !await hasNetworkConnection()) {
      checkOwner();
      final local = await _localEvents(wsId);
      checkOwner();
      if (local.isNotEmpty) {
        final matching = overlayPendingCalendarEvents(
          wsId,
          local,
          const [],
          start: start,
          end: end,
        );
        await CacheStore.instance.write(
          key: key,
          checkScope: checkOwner,
          policy: CachePolicies.moduleData,
          payload: matching.map((event) => event.toJson()).toList(),
          tags: ['module:calendar', 'workspace:$wsId'],
        );
      }
    }
    List<CalendarEvent> events;
    try {
      final cached = await CacheStore.instance.prefetch<List<CalendarEvent>>(
        key: key,
        checkScope: checkOwner,
        policy: CachePolicies.moduleData,
        decode: _decodeEvents,
        fetch: () async {
          checkOwner();
          final response = await _readForOwner(
            '${_basePath(wsId)}$query',
            userId,
          );
          checkOwner();
          return response['data'] as List<dynamic>? ?? const [];
        },
        tags: ['module:calendar', 'workspace:$wsId'],
      );
      checkOwner();
      events = cached.data ?? const [];
    } on Object catch (error) {
      checkOwner();
      if (error is ApiException &&
          (error.statusCode == 401 ||
              (error.statusCode == 403 && !error.isVerificationRequired))) {
        try {
          await CacheStore.instance.clearNamespacePrefix(
            prefix: 'calendar.',
            workspaceId: wsId,
            userId: userId,
          );
        } on Exception {
          // Keep the authorization failure visible if storage is unavailable.
        }
        rethrow;
      }
      if (!isOfflineTransportFailure(error)) {
        rethrow;
      }
      final retained = await CacheStore.instance.read<List<CalendarEvent>>(
        key: key,
        decode: _decodeEvents,
      );
      checkOwner();
      events = retained.hasValue
          ? retained.data ?? const []
          : await _localEvents(wsId);
      if (!retained.hasValue &&
          events.isEmpty &&
          overlayPendingCalendarEvents(
            wsId,
            const [],
            await OfflineMutationQueue.instance.listPending(),
          ).isEmpty) {
        rethrow;
      }
    }
    checkOwner();
    if (start != null && !start.isAfter(DateTime.now())) {
      unawaited(_warmEarlierEvents(wsId, start));
    }
    final pending = await OfflineMutationQueue.instance.listPending();
    checkOwner();
    return overlayPendingCalendarEvents(
      wsId,
      events,
      pending,
      start: start,
      end: end,
    );
  }

  /// Warm three earlier months after a calendar visit, independently of the
  /// visible range. This is bounded and never delays the stored projection.
  Future<void> _warmEarlierEvents(String wsId, DateTime start) =>
      ApiClient.offlinePreparation(
        () => _warmEarlierEventsImpl(wsId, start),
        allowChallenge: false,
      );

  Future<void> _warmEarlierEventsImpl(String wsId, DateTime start) async {
    final userId = _owner();
    if (userId == null) {
      return;
    }
    final earlier = DateTime.utc(start.year, start.month - 3);
    final key = '$userId:$wsId:${earlier.toIso8601String()}';
    final last = _historyWarmups[key];
    if (last != null &&
        DateTime.now().difference(last) < const Duration(minutes: 15)) {
      return;
    }
    final query = Uri(
      queryParameters: {
        'start_at': earlier.toIso8601String(),
        'end_at': start.toUtc().toIso8601String(),
      },
    ).query;
    try {
      if (!await hasNetworkConnection() || userId != _owner()) {
        return;
      }
      _historyWarmups[key] = DateTime.now();
      if (_historyWarmups.length > 64) {
        _historyWarmups.remove(_historyWarmups.keys.first);
      }
      await CacheStore.instance.prefetch<List<CalendarEvent>>(
        key: _listKey(wsId, '?$query', userId: userId),
        checkScope: () {
          if (userId != _owner()) throw StateError('Calendar account changed.');
        },
        policy: CachePolicies.moduleData,
        decode: _decodeEvents,
        forceRefresh: true,
        fetch: () async {
          if (userId != _owner()) throw StateError('Calendar account changed.');
          final response = await ApiClient.runForUser(
            userId,
            () => _api.getJson('${_basePath(wsId)}?$query'),
          );
          if (userId != _owner()) throw StateError('Calendar account changed.');
          return response['data'] as List<dynamic>? ?? const [];
        },
        tags: ['module:calendar', 'workspace:$wsId'],
      );
    } on Object {
      _historyWarmups.remove(key);
    }
  }

  Future<CalendarEvent?> getEventById(String wsId, String eventId) async {
    final userId = _owner();
    try {
      final result = await CacheStore.instance.prefetch<CalendarEvent>(
        key: CacheKey(
          namespace: 'calendar.event.detail',
          userId: userId,
          workspaceId: wsId,
          params: {'id': eventId},
        ),
        checkScope: () => _checkOwner(userId),
        policy: CachePolicies.detail,
        decode: (payload) => CalendarEvent.fromJson(
          (payload! as Map<String, dynamic>).cast<String, dynamic>(),
        ),
        fetch: () => _readForOwner('${_basePath(wsId)}/$eventId', userId),
        tags: ['module:calendar', 'workspace:$wsId'],
      );
      _checkOwner(userId);
      final events = overlayPendingCalendarEvents(wsId, [
        if (result.data != null) result.data!,
      ], await OfflineMutationQueue.instance.listPending());
      _checkOwner(userId);
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
      if (isOfflineTransportFailure(e)) {
        final local = overlayPendingCalendarEvents(
          wsId,
          await _localEvents(wsId),
          await OfflineMutationQueue.instance.listPending(),
        );
        for (final event in local) {
          if (event.id == eventId) {
            return event;
          }
        }
      }
      rethrow;
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) {
        rethrow;
      }
      final events = overlayPendingCalendarEvents(
        wsId,
        await _localEvents(wsId),
        await OfflineMutationQueue.instance.listPending(),
      );
      for (final event in events) {
        if (event.id == eventId) {
          return event;
        }
      }
      rethrow;
    }
  }

  Future<List<CalendarEvent>> _localEvents(String wsId) async =>
      (await queryLocalRows(
        store: CacheStore.instance,
        userId: _owner(),
        workspaceId: wsId,
        namespaces: const [
          'calendar.events',
          'calendar.events.utc.v2',
          'calendar.event.detail',
        ],
      )).map(CalendarEvent.fromJson).toList(growable: false);

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
