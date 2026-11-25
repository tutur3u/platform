import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_stock_movement.dart';
import 'package:mobile/data/repositories/inventory_media_upload.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/inventory/inventory_stock_summary.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

InventoryStockEntry _row(
  String unit,
  double? amount, {
  double min = 2,
  double price = 10,
}) => InventoryStockEntry(
  unitId: unit,
  warehouseId: 'w-$unit-$amount',
  amount: amount,
  minAmount: min,
  price: price,
  unitName: unit,
);

InventoryProduct _product(List<InventoryStockEntry> rows) => InventoryProduct(
  id: 'p',
  categoryId: 'c',
  ownerId: 'o',
  wsId: 'ws',
  inventory: rows,
);

void main() {
  group('InventoryStockSummary', () {
    test('sums one unit and flags low rows', () {
      final summary = InventoryStockSummary.of(
        _product([_row('Bag', 24), _row('Bag', 1), _row('Bag', 0)]),
        stockVisible: true,
      );
      expect(summary.state, InventoryStockState.low);
      expect(summary.total, 25);
      expect(summary.unit, 'Bag');
      expect(summary.outCount, 1);
      expect(summary.lowCount, 1);
      expect(summary.matches(InventoryStockFilter.low), isTrue);
      expect(summary.matches(InventoryStockFilter.inStock), isFalse);
    });

    test('never sums unlike units', () {
      final summary = InventoryStockSummary.of(
        _product([_row('Bag', 4), _row('Cup', 9)]),
        stockVisible: true,
      );
      expect(summary.state, InventoryStockState.inStock);
      expect(summary.total, isNull);
      expect(summary.locations, 2);
    });

    test('unlimited, none, out and hidden stay distinct', () {
      expect(
        InventoryStockSummary.of(_product([_row('Seat', null)])).state,
        InventoryStockState.unlimited,
      );
      expect(
        InventoryStockSummary.of(_product(const [])).state,
        InventoryStockState.none,
      );
      expect(
        InventoryStockSummary.of(_product([_row('Bag', 0)])).state,
        InventoryStockState.out,
      );
      expect(
        InventoryStockSummary.of(
          _product([_row('Bag', 5)]),
          stockVisible: false,
        ).state,
        InventoryStockState.hidden,
      );
    });

    test('reports a price range from the lowest price', () {
      final summary = InventoryStockSummary.of(
        _product([_row('Bag', 5, price: 30), _row('Bag', 5, price: 12)]),
      );
      expect(summary.minPrice, 12);
      expect(summary.hasPriceRange, isTrue);
    });
  });

  test('stock history parses movements and paging', () {
    final page = InventoryStockHistoryPage.fromJson(const {
      'data': [
        {
          'id': 'm1',
          'delta': -3,
          'unitId': 'u',
          'warehouseId': 'w',
          'timestamp': '2026-11-20T03:30:00Z',
          'note': ' Sold out ',
          'unit': {'id': 'u', 'name': 'Bag'},
          'warehouse': {'id': 'w', 'name': 'Kiosk'},
          'operator': {'id': 'p', 'name': null, 'email': 'ops@example.com'},
          'beneficiary': null,
        },
      ],
      'pagination': {'hasMore': true, 'limit': 25, 'offset': 0},
    });
    final movement = page.movements.single;
    expect(page.hasMore, isTrue);
    expect(movement.added, isFalse);
    expect(movement.note, 'Sold out');
    expect(movement.unitName, 'Bag');
    expect(movement.warehouseName, 'Kiosk');
    expect(movement.operatorName, 'ops@example.com');
    expect(movement.beneficiaryName, isNull);
  });

  test('catalog query carries category and sort only when set', () {
    expect(
      InventoryEndpoints.products('ws', status: 'active', page: 1),
      '/api/v1/workspaces/ws/inventory/products?status=active&page=1',
    );
    expect(
      InventoryEndpoints.products(
        'ws',
        categoryId: 'c1',
        sortBy: InventoryProductSort.nameAsc.sortBy,
        sortOrder: InventoryProductSort.nameAsc.sortOrder,
      ),
      '/api/v1/workspaces/ws/inventory/products'
      '?categoryId=c1&sortBy=name&sortOrder=asc',
    );
  });

  group('uploadInventoryProductImage', () {
    late _Api api;

    setUp(() {
      api = _Api();
      registerFallbackValue(<String, dynamic>{});
    });

    test('uploads to the issued URL and returns the read URL', () async {
      when(() => api.postJson(any(), any())).thenAnswer((call) async {
        final path = call.positionalArguments.first as String;
        if (path.endsWith('upload-url')) {
          return {
            'signedUrl': 'https://storage.example/upload?sig=1',
            'path': 'ws/inventory/media/product-featured-image/a.png',
            'token': 'upload-token',
            'headers': {'x-upsert': 'false'},
            'provider': 'r2',
          };
        }
        return {'readUrl': 'https://storage.example/read/a.png'};
      });
      late http.Request sent;
      final client = MockClient((request) async {
        sent = request;
        return http.Response('', 200);
      });

      final url = await uploadInventoryProductImage(
        api: api,
        wsId: 'ws',
        bytes: utf8.encode('png'),
        fileName: 'a.png',
        contentType: 'image/png',
        httpClient: client,
      );

      expect(url, 'https://storage.example/read/a.png');
      expect(sent.method, 'PUT');
      expect(sent.url.host, 'storage.example');
      expect(sent.headers['Authorization'], 'Bearer upload-token');
      expect(sent.headers['x-upsert'], 'false');
      final ticket =
          verify(
                () => api.postJson(
                  InventoryEndpoints.mediaUploadUrl('ws'),
                  captureAny(),
                ),
              ).captured.single
              as Map<String, dynamic>;
      expect(ticket['target'], 'product-featured-image');
      expect(ticket['size'], 3);
      final read =
          verify(
                () => api.postJson(
                  InventoryEndpoints.mediaReadUrl('ws'),
                  captureAny(),
                ),
              ).captured.single
              as Map<String, dynamic>;
      expect(read, {
        'path': 'ws/inventory/media/product-featured-image/a.png',
        'provider': 'r2',
      });
    });

    test('rejects unsupported files before any request', () async {
      await expectLater(
        uploadInventoryProductImage(
          api: api,
          wsId: 'ws',
          bytes: utf8.encode('x'),
          fileName: 'a.heic',
          contentType: 'image/heic',
        ),
        throwsA(isA<ApiException>()),
      );
      verifyNever(() => api.postJson(any(), any()));
    });

    test('a failed upload never asks for a read URL', () async {
      when(() => api.postJson(any(), any())).thenAnswer(
        (_) async => {
          'signedUrl': 'https://storage.example/upload',
          'path': 'p',
        },
      );
      await expectLater(
        uploadInventoryProductImage(
          api: api,
          wsId: 'ws',
          bytes: utf8.encode('png'),
          fileName: 'a.png',
          contentType: 'image/png',
          httpClient: MockClient((_) async => http.Response('', 403)),
        ),
        throwsA(isA<ApiException>()),
      );
      verifyNever(
        () => api.postJson(InventoryEndpoints.mediaReadUrl('ws'), any()),
      );
    });
  });
}
