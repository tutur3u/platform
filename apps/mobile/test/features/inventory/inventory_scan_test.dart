import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/inventory/inventory_scan.dart';

void main() {
  group('resolveInventoryScan', () {
    test('ignores empty codes', () {
      expect(resolveInventoryScan(null), isNull);
      expect(resolveInventoryScan('   '), isNull);
    });

    test('plain codes become a name search', () {
      final result = resolveInventoryScan(' 8934567890123 ');
      expect(result, isA<InventoryScanSearch>());
      expect((result! as InventoryScanSearch).query, '8934567890123');
    });

    test('Tuturuuu product links open the product', () {
      for (final link in [
        'https://tuturuuu.com/ws-1/inventory/products/product-1',
        'https://www.tuturuuu.com/vi/ws-1/inventory/products/product-1',
      ]) {
        final result = resolveInventoryScan(link);
        expect(result, isA<InventoryScanProduct>(), reason: link);
        expect((result! as InventoryScanProduct).productId, 'product-1');
      }
    });

    test('other links are rejected instead of searched', () {
      for (final link in [
        'https://example.com/ws-1/inventory/products/product-1',
        'https://tuturuuu.com/ws-1/inventory/products',
        'https://tuturuuu.com/ws-1/inventory/products/create',
        'https://tuturuuu.com/ws-1/tasks',
      ]) {
        expect(
          resolveInventoryScan(link),
          isA<InventoryScanUnsupported>(),
          reason: link,
        );
      }
    });
  });
}
