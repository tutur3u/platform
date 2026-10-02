import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/offline_inventory_harness.dart';

class _Api extends Mock implements ApiClient {}

class _Cache extends Mock implements CacheStore {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Api api;
  late OfflineInventoryHarness harness;
  late InventoryRepository repository;
  const products = <Map<String, dynamic>>[
    {
      'product_id': 'product',
      'unit_id': 'unit',
      'warehouse_id': 'warehouse',
      'quantity': 2,
      'price': 12.5,
    },
  ];
  setUpAll(
    () => registerFallbackValue(
      const ApiException(message: 'Failure', statusCode: 422),
    ),
  );
  setUp(() async {
    api = _Api();
    harness = await OfflineInventoryHarness.create(api);
    final cache = _Cache();
    when(
      () => cache.invalidateTags(any(), workspaceId: any(named: 'workspaceId')),
    ).thenAnswer((_) async {});
    repository = InventoryRepository(
      apiClient: api,
      cacheStore: cache,
      mutationQueue: harness.queue,
      cacheUserId: () => 'actor',
    );
  });
  tearDown(() async {
    await harness.dispose();
  });
  Future<String> create() => repository.createSale(
    wsId: 'ws',
    walletId: 'wallet',
    categoryId: 'category',
    products: products,
    periodId: 'legacy-period',
  );
  test('legacy period is validated and committed '
      'in one idempotent invoice request', () async {
    when(
      () => api.postJson(any(), any()),
    ).thenAnswer((_) async => {'invoice_id': 'invoice'});
    expect(await create(), 'invoice');
    final body =
        verify(
              () =>
                  api.postJson(InventoryEndpoints.invoices('ws'), captureAny()),
            ).captured.single
            as Map;
    expect(body['inventory_period_id'], 'legacy-period');
    expect(body['price_mode'], 'custom');
    expect(
      body['inventory_request_id'],
      matches(
        RegExp(
          '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-'
          r'[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      ),
    );
    expect(body['products'], products);
    verifyNever(() => api.putJson(any(), any()));
    verifyNever(() => api.patchJson(any(), any()));
    verifyNever(() => api.deleteJson(any()));
  });
  test('rejected product rules do not cause '
      'a second assignment request or claim success', () async {
    when(
      () => api.postJson(any(), any()),
    ).thenThrow(const ApiException(message: 'Rules changed', statusCode: 422));
    await expectLater(
      create(),
      throwsA(
        isA<ApiException>().having((error) => error.statusCode, 'status', 422),
      ),
    );
    verify(
      () => api.postJson(InventoryEndpoints.invoices('ws'), any()),
    ).called(1);
    verifyNever(() => api.putJson(any(), any()));
    verifyNever(() => api.patchJson(any(), any()));
    verifyNever(() => api.deleteJson(any()));
  });
}
