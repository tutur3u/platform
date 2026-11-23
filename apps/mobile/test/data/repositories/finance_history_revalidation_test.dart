import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(CacheStore.instance.clearScope);
  tearDown(CacheStore.instance.clearScope);

  test('repeated transaction reads fetch only the requested page', () async {
    final api = _Api();
    final repository = FinanceRepository(
      apiClient: api,
      cacheUserId: () => 'finance-reader',
      networkAvailable: () async => true,
    );
    final requestedPaths = <String>[];
    when(() => api.getJson(any())).thenAnswer((invocation) async {
      final path = invocation.positionalArguments.single as String;
      if (!path.contains('/transactions/infinite')) {
        return <String, dynamic>{};
      }
      requestedPaths.add(path);
      if (path.contains('cursor=')) {
        throw const ApiException(message: 'Download inactive', statusCode: 503);
      }
      return <String, dynamic>{
        'data': <Object>[],
        'hasMore': true,
        'nextCursor': 'older',
      };
    });

    for (var read = 0; read < 4; read++) {
      await CacheStore.awaitRevalidation(
        () => repository.getTransactionsInfinite(wsId: 'ws'),
      );
      await pumpEventQueue();
    }

    expect(requestedPaths, isNotEmpty);
    expect(
      requestedPaths,
      everyElement(allOf(contains('limit=20'), isNot(contains('cursor=')))),
    );
  });
}
