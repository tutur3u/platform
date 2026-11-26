import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/data/models/task_progress.dart';
import 'package:mobile/data/sources/api_client.dart';

class TaskProgressUnavailable implements Exception {
  const TaskProgressUnavailable();
}

class TaskProgressRepository {
  TaskProgressRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  String _path(String workspaceId, String resource) =>
      '/api/v1/workspaces/${Uri.encodeComponent(workspaceId)}'
      '/task-progress/$resource';

  Future<TaskProgressSnapshot> load({
    required String userId,
    required String workspaceId,
  }) async {
    final rows = await ApiClient.runForUser(
      userId,
      () => Future.wait([
        _read(workspaceId, 'metrics', 'metrics'),
        _read(workspaceId, 'entries?pageSize=50', 'entries'),
        _read(workspaceId, 'goals', 'goals'),
        _read(workspaceId, 'leaderboards?status=active', 'leaderboards'),
      ]),
    );
    _verifyUser(userId);
    final [metrics, entries, goals, leaderboards] = rows;
    return TaskProgressSnapshot(
      metrics: metrics
          .map(
            (row) => (
              id: row['id'] as String,
              name: row['name'] as String,
              unit: row['unit_label'] as String,
              total: row['aggregation'] == 'latest_total',
            ),
          )
          .toList(growable: false),
      entries: entries
          .map(
            (row) => (
              date: row['entry_date'] as String,
              value: row['value'] as num,
              metricId: row['metric_id'] as String,
              note: row['note'] as String?,
            ),
          )
          .toList(growable: false),
      goals: goals
          .map(
            (row) => (
              name: row['name'] as String,
              value: row['progress'] as num? ?? 0,
              target: row['target_value'] as num,
              unit:
                  (row['metric'] as Map<String, dynamic>?)?['unit_label']
                      as String?,
            ),
          )
          .toList(growable: false),
      leaderboards: leaderboards
          .map(
            (row) => (
              name: row['name'] as String,
              rankings: ((row['rankings'] as List<Object?>?) ?? const [])
                  .cast<Map<String, dynamic>>()
                  .map(
                    (rank) => (
                      name: rank['display_name'] as String?,
                      rank: rank['rank'] as int?,
                      value: rank['value'] as num? ?? 0,
                    ),
                  )
                  .toList(growable: false),
            ),
          )
          .toList(growable: false),
    );
  }

  Future<List<Map<String, dynamic>>> _read(
    String workspaceId,
    String resource,
    String key,
  ) async {
    final response = await _api.getJson(_path(workspaceId, resource));
    if (response['schemaAvailable'] == false) {
      throw const TaskProgressUnavailable();
    }
    return (response[key] as List<Object?>).cast<Map<String, dynamic>>();
  }

  Future<void> quickLog({
    required String userId,
    required String workspaceId,
    required ProgressMetric metric,
    required num value,
    required DateTime day,
    required bool Function() scopeIsCurrent,
    String? note,
  }) async {
    _verifyUser(userId);
    await ApiClient.runForUser(
      userId,
      () => _api.postJsonGuarded(
        _path(workspaceId, 'entries'),
        {
          'metric_id': metric.id,
          'entry_date': day.toIso8601String().split('T').first,
          'value': value,
          'mode': metric.total ? 'total' : 'delta',
          'source_type': 'manual',
          'note': ?note,
        },
        beforeDispatch: () async {
          _verifyUser(userId);
          if (!scopeIsCurrent()) throw const TaskProgressUnavailable();
        },
      ),
    );
  }

  void _verifyUser(String userId) {
    if (currentCacheUserId() != userId) {
      throw const ApiException(
        message: 'Tasks account changed.',
        statusCode: 401,
      );
    }
  }

  void dispose() => _api.dispose();
}
