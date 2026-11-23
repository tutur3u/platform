import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
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
  });

  tearDown(() async {
    await CacheStore.instance.clearScope();
    debugCacheUserIdOverride = null;
  });

  test('repeated My Tasks reads fetch only the requested page', () async {
    final requestedPaths = <String>[];
    when(() => api.getJson(any())).thenAnswer((invocation) async {
      final path = invocation.positionalArguments.single as String;
      requestedPaths.add(path);
      final page = Uri.parse(path).queryParameters['completedPage'];
      if (page != '0') {
        throw const ApiException(message: 'Download inactive', statusCode: 503);
      }
      return <String, dynamic>{
        'overdue': <Object>[],
        'today': <Object>[],
        'upcoming': <Object>[],
        'completed': <Object>[],
        'hasMoreCompleted': true,
      };
    });

    for (var read = 0; read < 4; read++) {
      await CacheStore.awaitRevalidation(
        () => repository.getMyTasks(wsId: 'ws', isPersonal: false),
      );
      await pumpEventQueue();
    }

    expect(requestedPaths, isNotEmpty);
    expect(requestedPaths, everyElement(contains('completedPage=0')));
  });
}
