import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/inventory/inventory_stock_movement.dart';
import 'package:mobile/data/repositories/inventory_media_upload.dart';
import 'package:mobile/data/repositories/inventory_media_urls.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
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

    test('an unlimited location keeps the item from reading out', () {
      final summary = InventoryStockSummary.of(
        _product([_row('Seat', null), _row('Bag', 0)]),
      );
      expect(summary.state, InventoryStockState.low);
      expect(summary.matches(InventoryStockFilter.out), isFalse);
    });

    test('stock rows compare by location regardless of order', () {
      final a = [_row('Bag', 1), _row('Cup', 2)];
      expect(inventoryStockRowsEqual(a, a.reversed.toList()), isTrue);
      expect(inventoryStockRowsEqual(a, [_row('Bag', 1)]), isFalse);
    });

    test('reports a price range from the lowest price', () {
      final summary = InventoryStockSummary.of(
        _product([_row('Bag', 5, price: 30), _row('Bag', 5, price: 12)]),
      );
      expect(summary.minPrice, 12);
      expect(summary.hasPriceRange, isTrue);
    });
  });

  test('single-product reads take names from the parallel stock list', () {
    final product = InventoryProduct.fromJson(const {
      'id': 'p',
      'inventory': [
        {'unit_id': 'u', 'warehouse_id': 'w', 'amount': 3, 'price': 45000},
        {
          'unit_id': 'u2',
          'warehouse_id': 'w2',
          'amount': null,
          'unit_name': 'Kept',
        },
      ],
      'stock': [
        {'unit': 'Pack', 'warehouse': 'QA Kiosk'},
        {'unit': 'Ignored', 'warehouse': 'Van'},
      ],
    });
    expect(product.inventory.first.unitName, 'Pack');
    expect(product.inventory.first.warehouseName, 'QA Kiosk');
    expect(product.inventory.last.unitName, 'Kept');
    expect(product.inventory.last.warehouseName, 'Van');
  });

  group('stored image URLs', () {
    const ws = '82cf845a-49b0-459d-a5ee-1005e8de4fae';
    const origin = 'https://tuturuuu.com';

    test('share and legacy signed URLs resolve to the workspace object', () {
      final share = inventoryImageShareUrl(
        ws,
        'inventory/media/a b.png',
        origin: origin,
      );
      expect(share, startsWith('https://tuturuuu.com/api/v1/workspaces/$ws/'));
      expect(inventoryImageStorageTarget(share, origin: origin), (
        wsId: ws,
        path: 'inventory/media/a b.png',
      ));
      expect(
        inventoryImageStorageTarget(
          origin: origin,
          'https://x.supabase.co/storage/v1/object/sign/workspaces/$ws/'
          'inventory/media/a.png?token=t',
        ),
        (wsId: ws, path: 'inventory/media/a.png'),
      );
      for (final other in [
        'https://evil.example/api/v1/workspaces/$ws/storage/share?path=a',
        'https://tuturuuu.com/api/v1/workspaces/$ws/storage/share?path=../a',
        'https://cdn.tuturuuu.com/public/a.png',
        'http://tuturuuu.com/api/v1/workspaces/$ws/storage/share?path=a',
      ]) {
        expect(
          inventoryImageStorageTarget(other, origin: origin),
          isNull,
          reason: other,
        );
      }
    });

    test('loads workspace objects through a fresh signed URL', () async {
      final api = _Api();
      when(
        () => api.postJson(any(), any()),
      ).thenAnswer((_) async => {'signedUrl': 'https://storage.example/fresh'});
      final fetched = <String>[];
      await fetchInventoryProductImage(
        inventoryImageShareUrl(ws, 'inventory/media/a.png', origin: origin),
        origin: origin,
        api: api,
        download: (url) async {
          fetched.add(url);
          return Uint8List(0);
        },
      );
      expect(fetched, ['https://storage.example/fresh']);
      verify(
        () => api.postJson('/api/v1/workspaces/$ws/storage/share', {
          'path': 'inventory/media/a.png',
        }),
      ).called(1);
    });

    test('a refused legacy signed URL falls back to itself', () async {
      final api = _Api();
      when(
        () => api.postJson(any(), any()),
      ).thenThrow(const ApiException(message: 'Forbidden', statusCode: 403));
      const legacy =
          'https://x.supabase.co/storage/v1/object/sign/workspaces/$ws/a.png'
          '?token=t';
      final fetched = <String>[];
      await fetchInventoryProductImage(
        legacy,
        origin: origin,
        api: api,
        download: (url) async {
          fetched.add(url);
          return Uint8List(0);
        },
      );
      expect(fetched, [legacy]);
    });
  });

  test('queued creates join the page where the sort puts them', () {
    InventoryProduct named(String id, String name) => InventoryProduct(
      id: id,
      name: name,
      categoryId: 'c',
      ownerId: 'o',
      wsId: 'ws',
      inventory: const [],
      createdAt: DateTime.utc(2026, 11, id == 'new' ? 25 : 1),
    );
    // The server page arrives in the sort's own order.
    List<String> order(InventoryProductSort sort) {
      final server = sort == InventoryProductSort.nameDesc
          ? [named('c', 'Cherry'), named('a', 'Apple')]
          : [named('a', 'Apple'), named('c', 'Cherry')];
      final rows = [...server, named('new', 'Banana')];
      return [
        for (final row in placePendingInventoryCreates(rows, server, sort))
          row.id,
      ];
    }

    expect(order(InventoryProductSort.nameAsc), ['a', 'new', 'c']);
    expect(order(InventoryProductSort.nameDesc), ['c', 'new', 'a']);
    expect(order(InventoryProductSort.newest), ['new', 'a', 'c']);
    expect(order(InventoryProductSort.oldest), ['a', 'c', 'new']);
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

    test('uploads to the issued URL and keeps the stable share URL', () async {
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

      // A signed read URL expires; the product keeps the sign-on-read link.
      expect(
        url,
        '${ApiConfig.baseUrlForPath(DriveEndpoints.share('ws'))}'
        '/api/v1/workspaces/ws/storage/share'
        '?path=ws%2Finventory%2Fmedia%2Fproduct-featured-image%2Fa.png',
      );
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

    test('retries without Content-Type and refuses plain http', () async {
      var ticketUrl = 'https://storage.example/upload';
      when(() => api.postJson(any(), any())).thenAnswer((call) async {
        final path = call.positionalArguments.first as String;
        return path.endsWith('upload-url')
            ? {'signedUrl': ticketUrl, 'path': 'p/a.png'}
            : {'readUrl': 'https://storage.example/read/a.png'};
      });
      final sent = <http.Request>[];
      final client = MockClient((request) async {
        sent.add(request);
        return http.Response('', sent.length == 1 ? 400 : 200);
      });
      await uploadInventoryProductImage(
        api: api,
        wsId: 'ws',
        bytes: utf8.encode('png'),
        fileName: 'a.png',
        contentType: 'image/png',
        httpClient: client,
      );
      expect(sent, hasLength(2));
      expect(sent.first.headers['Content-Type'], startsWith('image/png'));
      expect(sent.last.headers.containsKey('Content-Type'), isFalse);

      ticketUrl = 'http://storage.example/upload';
      sent.clear();
      await expectLater(
        uploadInventoryProductImage(
          api: api,
          wsId: 'ws',
          bytes: utf8.encode('png'),
          fileName: 'a.png',
          contentType: 'image/png',
          httpClient: client,
        ),
        throwsA(isA<ApiException>()),
      );
      expect(sent, isEmpty);
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
