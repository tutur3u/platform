import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
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
  HabitTrackerRepository({ApiClient? apiClient})
    : _apiClient = apiClient ?? ApiClient(baseUrl: ApiConfig.tasksBaseUrl);

  final ApiClient _apiClient;

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
    final response = await readThroughJson(
      api: _apiClient,
      namespace: 'habits.trackers',
      workspaceId: wsId,
      path: _withQuery('/api/v1/workspaces/$wsId/habit-trackers', {
        'scope': scope.apiValue,
        if (scope == HabitTrackerScope.member) 'userId': userId,
      }),
    );
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
      pending: (await OfflineMutationQueue.instance.listPending())
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
    final response = await readThroughJson(
      api: _apiClient,
      namespace: 'habits.detail',
      workspaceId: wsId,
      path: _withQuery('/api/v1/workspaces/$wsId/habit-trackers/$trackerId', {
        'scope': scope.apiValue,
        if (scope == HabitTrackerScope.member) 'userId': userId,
      }),
    );
    final entries = (response['entries'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'habits',
      pathContains: '/habit-trackers/$trackerId/entries',
      source: entries,
      pending: await OfflineMutationQueue.instance.listPending(),
      normalizeCreate: (payload) => {
        ...payload,
        'ws_id': wsId,
        'tracker_id': trackerId,
        'user_id': payload['user_id'] ?? currentCacheUserId(),
      },
    );
    return HabitTrackerDetailResponse.fromJson({...response, 'entries': rows});
  }

  @override
  Future<HabitTracker> createTracker(
    String wsId,
    HabitTrackerInput input,
  ) async {
    final path = '/api/v1/workspaces/$wsId/habit-trackers';
    final payload = input.toJson();
    final result = await queueOrSendValue<HabitTracker>(
      feature: 'habits',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) =>
          HabitTracker.fromJson({...payload, 'id': id, 'ws_id': wsId}),
      send: () async {
        final response = await _apiClient.postJson(path, payload);
        return HabitTracker.fromJson(
          Map<String, dynamic>.from(
            (response['tracker'] as Map?) ?? const <String, dynamic>{},
          ),
        );
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:habits',
    }, workspaceId: wsId);
    return result;
  }

  @override
  Future<HabitTracker> updateTracker(
    String wsId,
    String trackerId,
    HabitTrackerInput input,
  ) async {
    final path = '/api/v1/workspaces/$wsId/habit-trackers/$trackerId';
    final payload = input.toJson();
    final result = await queueOrSendValue<HabitTracker>(
      feature: 'habits',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: trackerId,
      payload: payload,
      pendingValue: (id) =>
          HabitTracker.fromJson({...payload, 'id': id, 'ws_id': wsId}),
      send: () async {
        final response = await _apiClient.patchJson(path, payload);
        return HabitTracker.fromJson(
          Map<String, dynamic>.from(
            (response['tracker'] as Map?) ?? const <String, dynamic>{},
          ),
        );
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:habits',
    }, workspaceId: wsId);
    return result;
  }

  @override
  Future<void> archiveTracker(String wsId, String trackerId) async {
    final path = '/api/v1/workspaces/$wsId/habit-trackers/$trackerId';
    await queueOrSendVoid(
      feature: 'habits',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: trackerId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:habits',
    }, workspaceId: wsId);
  }

  @override
  Future<HabitTrackerEntry> createEntry(
    String wsId,
    String trackerId,
    HabitTrackerEntryInput input,
  ) async {
    final path = '/api/v1/workspaces/$wsId/habit-trackers/$trackerId/entries';
    final payload = input.toJson();
    final result = await queueOrSendValue<HabitTrackerEntry>(
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
        'user_id': payload['user_id'] ?? currentCacheUserId() ?? '',
      }),
      send: () async {
        final response = await _apiClient.postJson(path, payload);
        return HabitTrackerEntry.fromJson(
          Map<String, dynamic>.from(
            (response['entry'] as Map?) ?? const <String, dynamic>{},
          ),
        );
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:habits',
    }, workspaceId: wsId);
    return result;
  }

  @override
  Future<void> deleteEntry(
    String wsId,
    String trackerId,
    String entryId,
  ) async {
    final path =
        '/api/v1/workspaces/$wsId/habit-trackers/$trackerId/entries/$entryId';
    await queueOrSendVoid(
      feature: 'habits',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: entryId,
      send: () async {
        await _apiClient.deleteJson(path);
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:habits',
    }, workspaceId: wsId);
  }

  @override
  Future<void> createStreakAction(
    String wsId,
    String trackerId,
    HabitTrackerStreakActionInput input,
  ) async {
    final path =
        '/api/v1/workspaces/$wsId/habit-trackers/$trackerId/streak-actions';
    await queueOrSendVoid(
      feature: 'habits',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      entityId: trackerId,
      payload: input.toJson(),
      send: () async {
        await _apiClient.postJson(path, input.toJson());
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:habits',
    }, workspaceId: wsId);
  }
}
