import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/sources/api_client.dart';

abstract class IHabitTrackerRepository {
  Future<HabitTrackerListResponse> listTrackers(
    String wsId, {
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
  });

  Future<HabitTrackerDetailResponse> getTrackerDetail(
    String wsId,
    String trackerId, {
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
  });

  Future<HabitTracker> createTracker(String wsId, HabitTrackerInput input);

  Future<HabitTracker> updateTracker(
    String wsId,
    String trackerId,
    HabitTrackerInput input,
  );

  Future<void> archiveTracker(String wsId, String trackerId);

  Future<HabitTrackerEntry> createEntry(
    String wsId,
    String trackerId,
    HabitTrackerEntryInput input,
  );

  Future<void> deleteEntry(String wsId, String trackerId, String entryId);

  Future<void> createStreakAction(
    String wsId,
    String trackerId,
    HabitTrackerStreakActionInput input,
  );
}

class HabitTrackerRepository implements IHabitTrackerRepository {
  HabitTrackerRepository({
    ApiClient? apiClient,
    CacheStore? cacheStore,
    OfflineMutationQueue? mutationQueue,
    String? Function()? currentUserId,
    this.expectedUserId,
  }) : _apiClient =
           apiClient ??
           ApiClient(
             baseUrl: ApiConfig.tasksBaseUrl,
             expectedUserId: expectedUserId,
           ),
       _store = cacheStore ?? CacheStore.instance,
       _queue = mutationQueue ?? OfflineMutationQueue.instance,
       _currentUserId = currentUserId ?? currentCacheUserId;

  final ApiClient _apiClient;
  final CacheStore _store;
  final OfflineMutationQueue _queue;
  final String? Function() _currentUserId;
  final String? expectedUserId;
  String? get _actor => expectedUserId ?? _currentUserId();

  void _checkActor(String? actor) {
    if (actor != null) _apiClient.checkUser(actor);
    if (_actor != actor) {
      throw const ApiException(message: 'Account changed', statusCode: 401);
    }
  }

  String _writeActor() {
    final actor = _actor;
    _checkActor(actor);
    if (actor == null) {
      throw const ApiException(
        message: 'Authentication required',
        statusCode: 401,
      );
    }
    return actor;
  }

  Future<List<PendingMutationRecord>> _pending(String? actor) async {
    _checkActor(actor);
    if (actor == null) return const [];
    final records = await _queue.listPending();
    _checkActor(actor);
    return records.where((record) => record.userId == actor).toList();
  }

  Future<void> _invalidate(String wsId, String actor) async {
    _checkActor(actor);
    await _store.invalidateTags(
      {'module:habits'},
      workspaceId: wsId,
      userId: actor,
    );
  }

  String _withQuery(String path, Map<String, String?> query) {
    final values = query.entries
        .where((entry) {
          final value = entry.value;
          return value != null && value.isNotEmpty;
        })
        .toList(growable: false);

    if (values.isEmpty) {
      return path;
    }

    final encoded = Uri(
      queryParameters: Map<String, String>.fromEntries(
        values.map((entry) => MapEntry(entry.key, entry.value!)),
      ),
    ).query;
    return '$path?$encoded';
  }

  @override
  Future<HabitTrackerListResponse> listTrackers(
    String wsId, {
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
  }) async {
    final actor = _actor;
    _checkActor(actor);
    final response = await readThroughJson(
      api: _apiClient,
      cacheStore: _store,
      cacheUserId: () => actor,
      namespace: 'habits.trackers',
      workspaceId: wsId,
      path: _withQuery('/api/v1/workspaces/$wsId/habit-trackers', {
        'scope': scope.apiValue,
        if (scope == HabitTrackerScope.member) 'userId': userId,
      }),
    );
    _checkActor(actor);
    final base = '/api/v1/workspaces/$wsId/habit-trackers';
    final cards = (response['trackers'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final source = cards
        .map((card) => card['tracker'])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'habits',
      pathContains: base,
      source: source,
      pending: (await _pending(actor))
          .where(
            (record) =>
                record.path == base ||
                record.path == '$base/${record.entityId}',
          )
          .toList(growable: false),
      normalizeCreate: (payload) => {...payload, 'ws_id': wsId},
      includeCreates: scope == HabitTrackerScope.self,
    );
    final cardsById = {
      for (final card in cards)
        if (card['tracker'] is Map<String, dynamic>)
          (card['tracker'] as Map<String, dynamic>)['id'] as String: card,
    };
    return HabitTrackerListResponse.fromJson({
      ...response,
      'trackers': rows
          .map((row) => {...?cardsById[row['id']], 'tracker': row})
          .toList(growable: false),
    });
  }

  @override
  Future<HabitTrackerDetailResponse> getTrackerDetail(
    String wsId,
    String trackerId, {
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
  }) async {
    final actor = _actor;
    _checkActor(actor);
    final response = await readThroughJson(
      api: _apiClient,
      cacheStore: _store,
      cacheUserId: () => actor,
      namespace: 'habits.detail',
      workspaceId: wsId,
      path: _withQuery('/api/v1/workspaces/$wsId/habit-trackers/$trackerId', {
        'scope': scope.apiValue,
        if (scope == HabitTrackerScope.member) 'userId': userId,
      }),
    );
    _checkActor(actor);
    final entries = (response['entries'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'habits',
      pathContains: '/habit-trackers/$trackerId/entries',
      source: entries,
      pending: (await _pending(actor))
          .where(
            (record) =>
                scope != HabitTrackerScope.member ||
                record.method != 'POST' ||
                (record.payload?['user_id'] ?? actor) == userId,
          )
          .toList(),
      normalizeCreate: (payload) => {
        ...payload,
        'ws_id': wsId,
        'tracker_id': trackerId,
        'user_id': payload['user_id'] ?? actor,
      },
    );
    return HabitTrackerDetailResponse.fromJson({...response, 'entries': rows});
  }

  @override
  Future<HabitTracker> createTracker(
    String wsId,
    HabitTrackerInput input,
  ) async {
    final actor = _writeActor();
    final path = '/api/v1/workspaces/$wsId/habit-trackers';
    final payload = input.toJson();
    final result = await queueOrSendValue<HabitTracker>(
      queue: _queue,
      expectedUserId: actor,
      feature: 'habits',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) =>
          HabitTracker.fromJson({...payload, 'id': id, 'ws_id': wsId}),
      send: () async {
        _checkActor(actor);
        final response = await _apiClient.postJson(path, payload);
        return HabitTracker.fromJson(
          Map<String, dynamic>.from(
            (response['tracker'] as Map?) ?? const <String, dynamic>{},
          ),
        );
      },
    );
    await _invalidate(wsId, actor);
    return result;
  }

  @override
  Future<HabitTracker> updateTracker(
    String wsId,
    String trackerId,
    HabitTrackerInput input,
  ) async {
    final actor = _writeActor();
    final path = '/api/v1/workspaces/$wsId/habit-trackers/$trackerId';
    final payload = input.toJson();
    final result = await queueOrSendValue<HabitTracker>(
      queue: _queue,
      expectedUserId: actor,
      feature: 'habits',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: trackerId,
      payload: payload,
      pendingValue: (id) =>
          HabitTracker.fromJson({...payload, 'id': id, 'ws_id': wsId}),
      send: () async {
        _checkActor(actor);
        final response = await _apiClient.patchJson(path, payload);
        return HabitTracker.fromJson(
          Map<String, dynamic>.from(
            (response['tracker'] as Map?) ?? const <String, dynamic>{},
          ),
        );
      },
    );
    await _invalidate(wsId, actor);
    return result;
  }

  @override
  Future<void> archiveTracker(String wsId, String trackerId) async {
    final actor = _writeActor();
    final path = '/api/v1/workspaces/$wsId/habit-trackers/$trackerId';
    await queueOrSendVoid(
      queue: _queue,
      expectedUserId: actor,
      feature: 'habits',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: trackerId,
      send: () async {
        _checkActor(actor);
        await _apiClient.deleteJson(path);
      },
    );
    await _invalidate(wsId, actor);
  }

  @override
  Future<HabitTrackerEntry> createEntry(
    String wsId,
    String trackerId,
    HabitTrackerEntryInput input,
  ) async {
    final actor = _writeActor();
    final path = '/api/v1/workspaces/$wsId/habit-trackers/$trackerId/entries';
    final payload = input.toJson();
    final result = await queueOrSendValue<HabitTrackerEntry>(
      queue: _queue,
      expectedUserId: actor,
      feature: 'habits',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => HabitTrackerEntry.fromJson({
        ...payload,
        'id': id,
        'ws_id': wsId,
        'tracker_id': trackerId,
        'user_id': payload['user_id'] ?? actor,
      }),
      send: () async {
        _checkActor(actor);
        final response = await _apiClient.postJson(path, payload);
        return HabitTrackerEntry.fromJson(
          Map<String, dynamic>.from(
            (response['entry'] as Map?) ?? const <String, dynamic>{},
          ),
        );
      },
    );
    await _invalidate(wsId, actor);
    return result;
  }

  @override
  Future<void> deleteEntry(
    String wsId,
    String trackerId,
    String entryId,
  ) async {
    final actor = _writeActor();
    final path =
        '/api/v1/workspaces/$wsId/habit-trackers/$trackerId/entries/$entryId';
    await queueOrSendVoid(
      queue: _queue,
      expectedUserId: actor,
      feature: 'habits',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: entryId,
      send: () async {
        _checkActor(actor);
        await _apiClient.deleteJson(path);
      },
    );
    await _invalidate(wsId, actor);
  }

  @override
  Future<void> createStreakAction(
    String wsId,
    String trackerId,
    HabitTrackerStreakActionInput input,
  ) async {
    final actor = _writeActor();
    final path =
        '/api/v1/workspaces/$wsId/habit-trackers/$trackerId/streak-actions';
    await queueOrSendVoid(
      queue: _queue,
      expectedUserId: actor,
      feature: 'habits',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      entityId: trackerId,
      payload: input.toJson(),
      send: () async {
        _checkActor(actor);
        await _apiClient.postJson(path, input.toJson());
      },
    );
    await _invalidate(wsId, actor);
  }
}
