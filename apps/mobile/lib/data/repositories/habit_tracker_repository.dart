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
    : _apiClient = apiClient ?? ApiClient();

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
    final response = await _apiClient.getJson(
      _withQuery('/api/v1/workspaces/$wsId/habit-trackers', {
        'scope': scope.apiValue,
        if (scope == HabitTrackerScope.member) 'userId': userId,
      }),
    );
    return HabitTrackerListResponse.fromJson(response);
  }

  @override
  Future<HabitTrackerDetailResponse> getTrackerDetail(
    String wsId,
    String trackerId, {
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
  }) async {
    final response = await _apiClient.getJson(
      _withQuery('/api/v1/workspaces/$wsId/habit-trackers/$trackerId', {
        'scope': scope.apiValue,
        if (scope == HabitTrackerScope.member) 'userId': userId,
      }),
    );
    return HabitTrackerDetailResponse.fromJson(response);
  }

  @override
  Future<HabitTracker> createTracker(
    String wsId,
    HabitTrackerInput input,
  ) async {
    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/habit-trackers',
      input.toJson(),
    );
    return HabitTracker.fromJson(
      Map<String, dynamic>.from(
        (response['tracker'] as Map?) ?? const <String, dynamic>{},
      ),
    );
  }

  @override
  Future<HabitTracker> updateTracker(
    String wsId,
    String trackerId,
    HabitTrackerInput input,
  ) async {
    final response = await _apiClient.patchJson(
      '/api/v1/workspaces/$wsId/habit-trackers/$trackerId',
      input.toJson(),
    );
    return HabitTracker.fromJson(
      Map<String, dynamic>.from(
        (response['tracker'] as Map?) ?? const <String, dynamic>{},
      ),
    );
  }

  @override
  Future<void> archiveTracker(String wsId, String trackerId) async {
    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/habit-trackers/$trackerId',
    );
  }

  @override
  Future<HabitTrackerEntry> createEntry(
    String wsId,
    String trackerId,
    HabitTrackerEntryInput input,
  ) async {
    final response = await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/habit-trackers/$trackerId/entries',
      input.toJson(),
    );
    return HabitTrackerEntry.fromJson(
      Map<String, dynamic>.from(
        (response['entry'] as Map?) ?? const <String, dynamic>{},
      ),
    );
  }

  @override
  Future<void> deleteEntry(
    String wsId,
    String trackerId,
    String entryId,
  ) async {
    await _apiClient.deleteJson(
      '/api/v1/workspaces/$wsId/habit-trackers/$trackerId/entries/$entryId',
    );
  }

  @override
  Future<void> createStreakAction(
    String wsId,
    String trackerId,
    HabitTrackerStreakActionInput input,
  ) async {
    await _apiClient.postJson(
      '/api/v1/workspaces/$wsId/habit-trackers/$trackerId/streak-actions',
      input.toJson(),
    );
  }
}
