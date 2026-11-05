import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/inventory/inventory_scan.dart';

const _id = '3f2b8c1e-6a4d-4e2f-9b1a-7c5d0e8f9a10';

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

    test('plain codes over the server search limit are rejected', () {
      final limit = 'A' * inventoryScanMaxSearchLength;
      expect(resolveInventoryScan(limit), isA<InventoryScanSearch>());
      expect(
        resolveInventoryScan('${limit}A'),
        isA<InventoryScanUnsupported>(),
      );
    });

    test('Tuturuuu product links with a UUID open the product', () {
      for (final link in [
        'https://tuturuuu.com/ws-1/inventory/products/$_id',
        'https://www.tuturuuu.com/vi/ws-1/inventory/products/${_id.toUpperCase()}',
      ]) {
        final result = resolveInventoryScan(link);
        expect(result, isA<InventoryScanProduct>(), reason: link);
        expect((result! as InventoryScanProduct).productId, _id);
      }
    });

    test('other links and malformed product ids are rejected', () {
      for (final link in [
        'https://example.com/ws-1/inventory/products/$_id',
        'https://tuturuuu.com/ws-1/inventory/products',
        'https://tuturuuu.com/ws-1/inventory/products/create',
        'https://tuturuuu.com/ws-1/inventory/products/product-1',
        'https://tuturuuu.com/ws-1/inventory/products/..%2Fsecrets',
        'https://tuturuuu.com/ws-1/tasks',
      ]) {
        expect(
          resolveInventoryScan(link),
          isA<InventoryScanUnsupported>(),
          reason: link,
        );
      }
    });

    test('payloads with any other scheme are never searched', () {
      for (final payload in [
        'otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP&issuer=Acme',
        'WIFI:T:WPA;S:Booth;P:hunter2;;',
        'intent://scan/#Intent;scheme=zxing;end',
        'tuturuuu://inventory/products/$_id',
        'mailto:ada@example.com',
        'tel:+84123456789',
        'javascript:alert(1)',
        'BEGIN:VCARD',
        'ftp://files.example.com/price-list',
      ]) {
        expect(
          resolveInventoryScan(payload),
          isA<InventoryScanUnsupported>(),
          reason: payload,
        );
      }
    });
  });
}
