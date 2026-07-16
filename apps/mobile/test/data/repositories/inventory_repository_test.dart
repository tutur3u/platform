import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  test(
    'period edits send content fields and allow clearing dates and notes',
    () async {
      final apiClient = _MockApiClient();
      final repository = InventoryRepository(apiClient: apiClient);
      Map<String, dynamic>? requestBody;

      when(() => apiClient.patchJson(any(), any())).thenAnswer((
        invocation,
      ) async {
        requestBody = invocation.positionalArguments[1] as Map<String, dynamic>;
        return {
          'data': {
            'id': 'period-1',
            'name': 'Summer 2027',
            'status': 'active',
            'sale_count': 0,
          },
        };
      });

      await repository.updateSalesPeriod(
        wsId: 'ws-1',
        periodId: 'period-1',
        name: 'Summer 2027',
        productScope: 'blocklist',
        productIds: const ['product-1'],
      );

      expect(requestBody, {
        'name': 'Summer 2027',
        'description': null,
        'starts_at': null,
        'ends_at': null,
        'product_scope': 'blocklist',
        'product_ids': ['product-1'],
      });
    },
  );
}
