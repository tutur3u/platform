import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/data/models/task_progress.dart';
import 'package:mobile/data/repositories/task_progress_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

const _path = '/api/v1/workspaces/workspace/task-progress';
const ProgressMetric _metric = (
  id: 'metric',
  name: 'Words',
  unit: 'words',
  total: true,
);

void main() {
  setUp(() {
    debugCacheUserIdOverride = () => 'owner';
    addTearDown(() => debugCacheUserIdOverride = null);
  });
  setUpAll(() => registerFallbackValue(() async {}));

  test('reads metrics, entries, goals and leaderboard rankings', () async {
    final api = _Api();
    final responses = {
      'metrics': {
        'metrics': [
          {
            'id': 'metric',
            'name': 'Words',
            'unit_label': 'words',
            'aggregation': 'latest_total',
          },
        ],
      },
      'entries?pageSize=50': {
        'entries': [
          {'entry_date': '2030-01-02', 'value': 12, 'metric_id': 'metric'},
        ],
      },
      'goals': {
        'goals': [
          {'name': 'Draft', 'target_value': 20, 'progress': 12},
        ],
      },
      'leaderboards?status=active': {
        'leaderboards': [
          {
            'name': 'Weekly',
            'rankings': [
              {'rank': 1, 'display_name': 'Member', 'value': 12},
            ],
          },
        ],
      },
    };
    for (final entry in responses.entries) {
      when(
        () => api.getJson('$_path/${entry.key}'),
      ).thenAnswer((_) async => entry.value);
    }
    final repo = TaskProgressRepository(apiClient: api);

    final result = await repo.load(userId: 'owner', workspaceId: 'workspace');
    expect(result.metrics.single, _metric);
    expect(result.entries.single.value, 12);
    expect(result.goals.single.target, 20);
    expect(result.leaderboards.single.rankings.single.rank, 1);
  });

  test(
    'quick log uses a calendar date and the metric aggregation mode',
    () async {
      final api = _Api();
      final repo = TaskProgressRepository(apiClient: api);
      final payload = {
        'metric_id': 'metric',
        'entry_date': '2030-01-02',
        'value': 12,
        'mode': 'total',
        'source_type': 'manual',
      };
      when(
        () => api.postJsonGuarded(
          '$_path/entries',
          payload,
          beforeDispatch: any(named: 'beforeDispatch'),
        ),
      ).thenAnswer((invocation) async {
        final guard =
            invocation.namedArguments[#beforeDispatch]
                as Future<void> Function();
        await guard();
        return {'ok': true};
      });
      await repo.quickLog(
        userId: 'owner',
        workspaceId: 'workspace',
        metric: _metric,
        value: 12,
        day: DateTime(2030, 1, 2),
        scopeIsCurrent: () => true,
      );
      verify(
        () => api.postJsonGuarded(
          '$_path/entries',
          payload,
          beforeDispatch: any(named: 'beforeDispatch'),
        ),
      ).called(1);
    },
  );

  test('does not write an entry for a retired account', () async {
    final api = _Api();
    final repo = TaskProgressRepository(apiClient: api);
    await expectLater(
      repo.quickLog(
        userId: 'former',
        workspaceId: 'workspace',
        metric: _metric,
        value: 12,
        day: DateTime(2030, 1, 2),
        scopeIsCurrent: () => true,
      ),
      throwsA(isA<ApiException>()),
    );
    verifyZeroInteractions(api);
  });
}
