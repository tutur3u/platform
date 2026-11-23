import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/offline_api_request.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Api api;
  late TaskRepository repository;

  setUp(() async {
    debugCacheUserIdOverride = () => 'task-reader';
    await CacheStore.instance.clearScope();
    api = _Api();
    repository = TaskRepository(apiClient: api);
    await CacheStore.instance.write(
      key: const CacheKey(
        namespace: 'tasks.boardTasks',
        userId: 'task-reader',
        workspaceId: 'ws',
        params: {'path': 'replica'},
      ),
      policy: CachePolicies.moduleData,
      payload: {
        'tasks': [
          {'id': 'local-task', 'name': 'Stored task', 'list_id': 'list'},
        ],
      },
    );
  });

  tearDown(() async {
    await CacheStore.instance.clearScope();
    debugCacheUserIdOverride = null;
  });

  test('replica-backed task reads refresh without the bulk marker', () async {
    final bulkMarkers = <bool>[];
    when(() => api.getJson(any())).thenAnswer((_) async {
      bulkMarkers.add(OfflineApiRequest.active);
      return <String, dynamic>{'tasks': <Object>[]};
    });

    await repository.getTasks('ws');
    await pumpEventQueue();

    expect(bulkMarkers, isNotEmpty);
    expect(bulkMarkers, everyElement(isFalse));
  });
}
