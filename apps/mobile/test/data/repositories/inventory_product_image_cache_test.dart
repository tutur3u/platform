import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_download_manifest.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_product_image_cache.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_image.dart';
import 'package:mocktail/mocktail.dart';

class _SecureStorage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

class _Queue extends Mock implements OfflineMutationQueue {}

final Uint8List _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8Dw'
  'HwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
);

Map<String, dynamic> _productJson({String ws = 'ws'}) => {
  'id': 'product',
  'name': 'Product',
  'ws_id': ws,
  'avatar_url': 'https://storage.example.com/product.png',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late _SecureStorage secure;
  String? user;

  CacheStore newStore() => CacheStore.forTesting(
    secureStorage: secure,
    directoryResolver: () async => directory,
  );

  InventoryProductImageCache cache(Future<Uint8List> Function(String) fetch) =>
      InventoryProductImageCache(
        store: store,
        currentUserId: () => user,
        fetchBytes: fetch,
      );

  setUp(() async {
    user = 'user';
    directory = await Directory.systemTemp.createTemp('product-image-cache-');
    secure = _SecureStorage();
    final secrets = <String, String>{};
    when(
      () => secure.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => secure.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = newStore();
    await store.init();
  });

  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    directory.deleteSync(recursive: true);
  });

  test(
    'visited product images survive encrypted reopen with no network',
    () async {
      final product = InventoryProduct.fromJson(_productJson());
      expect(product.avatarUrl, 'https://storage.example.com/product.png');
      final online = cache((_) async => _png);
      expect(await online.load(product), _png);
      await store.closeForTesting();
      store = newStore();
      final offline = cache(
        (_) async => throw const SocketException('Offline'),
      );
      expect(await offline.load(product), _png);
      expect(offline.peek(product), _png);
    },
  );

  test(
    'unrelated resource eviction cannot cancel a pending product image',
    () async {
      final product = InventoryProduct.fromJson(_productJson());
      final started = Completer<void>();
      final bytes = Completer<Uint8List>();
      final images = cache((_) {
        started.complete();
        return bytes.future;
      });
      final other = images.key(
        InventoryProduct.fromJson({..._productJson(), 'id': 'other'}),
        'user',
      );
      await store.write(
        key: other,
        policy: CachePolicies.detail,
        payload: {'bytes': base64Encode(_png)},
      );
      final load = images.load(product);
      await started.future;
      await store.remove(other);
      bytes.complete(_png);
      expect(await load, _png);
      expect(images.peek(product), _png);
    },
  );

  test('redirect chain shares one overall image download deadline', () async {
    final client = MockClient((request) async {
      await Future<void>.delayed(const Duration(milliseconds: 60));
      return http.Response(
        '',
        302,
        headers: {'location': 'https://media.example.com/next'},
      );
    });
    await expectLater(
      InventoryProductImageCache.downloadBytes(
        'https://storage.example.com/start',
        client: client,
        maxDuration: const Duration(milliseconds: 100),
      ),
      throwsA(isA<TimeoutException>()),
    );
  });

  test('signed media URL tokens stay out of unencrypted cache keys', () {
    const signedUrl = 'https://media.example/image?token=private-token';
    final product = InventoryProduct.fromJson({
      ..._productJson(),
      'avatar_url': signedUrl,
    });
    final key = cache((_) async => _png).key(product, 'user');
    expect(key.value, isNot(contains('private-token')));
    expect(jsonEncode(key.toJson()), isNot(contains(signedUrl)));
    expect(key.params['urlDigest'], hasLength(64));
  });

  test(
    'checkout option normalization preserves server product images',
    () async {
      final api = _Api();
      final queue = _Queue();
      when(queue.listPending).thenAnswer((_) async => []);
      when(() => api.getJson(any())).thenAnswer(
        (_) async => {
          'data': [
            {
              ..._productJson(),
              'ws_id': null,
              'inventory_products': <Object?>[],
            },
          ],
        },
      );
      final repository = InventoryRepository(
        apiClient: api,
        cacheStore: store,
        cacheUserId: () => user,
        mutationQueue: queue,
        networkAvailable: () async => true,
      );
      final options = await repository.getProductOptions('ws');
      expect(options.single.avatarUrl, _productJson()['avatar_url']);
      expect(options.single.wsId, 'ws');
    },
  );

  test(
    'identical media URLs remain isolated by account and workspace',
    () async {
      var fetches = 0;
      final images = cache((_) async {
        fetches++;
        return _png;
      });
      final first = InventoryProduct.fromJson(_productJson());
      final otherWorkspace = InventoryProduct.fromJson(
        _productJson(ws: 'other'),
      );
      await images.load(first);
      expect(images.peek(otherWorkspace), isNull);
      await images.load(otherWorkspace);
      user = 'another';
      expect(images.peek(first), isNull);
      await images.load(first);
      expect(fetches, 3);
      user = 'user';
      expect(images.peek(first), _png);
    },
  );

  test('concurrent card and checkout reads share one image fetch', () async {
    var fetches = 0;
    final images = cache((_) async {
      fetches++;
      return _png;
    });
    final product = InventoryProduct.fromJson(_productJson());
    await Future.wait([images.load(product), images.load(product)]);
    expect(fetches, 1);
  });

  for (final accountChange in [true, false]) {
    test('late image cannot repopulate '
        '${accountChange ? 'old account' : 'cleared cache'}', () async {
      final started = Completer<void>();
      final bytes = Completer<Uint8List>();
      final images = cache((_) {
        started.complete();
        return bytes.future;
      });
      final product = InventoryProduct.fromJson(_productJson());
      final download = images.load(product);
      await started.future;
      if (accountChange) {
        user = 'another';
      } else {
        await store.clearResources(userId: 'user');
      }
      final failure = expectLater(download, throwsStateError);
      bytes.complete(_png);
      await failure;
      user = 'user';
      expect(images.peek(product), isNull);
    });
  }

  test('image removal invalidates a retained inventory download', () async {
    final images = cache((_) async => _png);
    final product = InventoryProduct.fromJson(_productJson());
    final manifest = OfflineDownloadManifest(store, 'user', () => user);
    await images.load(product, manifest: manifest);
    await manifest.verify();
    manifest.retain('inventory', 'ws');
    await store.remove(images.key(product, 'user'));
    await expectLater(
      OfflineDownloadManifest.verifyScope('user', 'ws'),
      throwsStateError,
    );
  });

  test('invalid or oversized images do not become offline-ready', () async {
    final product = InventoryProduct.fromJson(_productJson());
    for (final bytes in [
      Uint8List(4),
      Uint8List(InventoryProductImageCache.maxImageBytes + 1),
    ]) {
      final images = cache((_) async => bytes);
      final manifest = OfflineDownloadManifest(store, 'user', () => user);
      await expectLater(
        images.load(product, manifest: manifest),
        throwsA(isA<Exception>()),
      );
      expect(images.peek(product), isNull);
    }
  });

  test('Inventory Download all includes every product image '
      'and propagates failures', () async {
    final api = _Api();
    when(() => api.getJsonList(any())).thenAnswer((_) async => []);
    when(() => api.getJson(any())).thenAnswer((call) async {
      final path = call.positionalArguments.first as String;
      if (path.contains('/inventory/products?')) {
        return {
          'data': [_productJson()],
          'count': 1,
        };
      }
      if (path.endsWith('/products/product')) return _productJson();
      return {'data': <Map<String, dynamic>>[], 'count': 0};
    });
    var fetches = 0;
    final images = cache((_) async {
      fetches++;
      return _png;
    });
    final repository = InventoryRepository(
      apiClient: api,
      cacheStore: store,
      cacheUserId: () => user,
      productImageCache: images,
    );
    await repository.prepareOffline('ws');
    expect(fetches, 1);
    expect(images.peek(InventoryProduct.fromJson(_productJson())), _png);
    await store.clearResources(userId: 'user');
    final failing = InventoryRepository(
      apiClient: api,
      cacheStore: store,
      cacheUserId: () => user,
      productImageCache: cache(
        (_) async => throw const SocketException('Offline'),
      ),
    );
    await expectLater(
      failing.prepareOffline('ws'),
      throwsA(isA<SocketException>()),
    );
  });

  test(
    'Drive redirects remain bounded HTTPS and never receive credentials',
    () async {
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        expect(request.headers.containsKey('authorization'), isFalse);
        expect(request.headers.containsKey('cookie'), isFalse);
        if (request.url.host == 'drive.google.com') {
          return http.Response(
            '',
            302,
            headers: {'location': 'https://media.googleusercontent.com/image'},
          );
        }
        return http.Response.bytes(_png, 200);
      });
      expect(
        await InventoryProductImageCache.downloadBytes(
          'https://drive.google.com/uc?id=product',
          client: client,
        ),
        _png,
      );
      expect(requests.map((request) => request.url.host), [
        'drive.google.com',
        'media.googleusercontent.com',
      ]);
      for (final target in [
        'http://unsafe.example/image',
        'https://user:password@example.com/image',
      ]) {
        final invalid = MockClient(
          (_) async => http.Response('', 302, headers: {'location': target}),
        );
        await expectLater(
          InventoryProductImageCache.downloadBytes(
            'https://storage.example/image',
            client: invalid,
          ),
          throwsFormatException,
        );
      }
      var redirects = 0;
      final loop = MockClient((_) async {
        redirects++;
        return http.Response('', 302, headers: {'location': '/loop'});
      });
      await expectLater(
        InventoryProductImageCache.downloadBytes(
          'https://storage.example/image',
          client: loop,
        ),
        throwsStateError,
      );
      expect(redirects, 4);
    },
  );

  testWidgets('image widget paints cached bytes and clears on account switch', (
    tester,
  ) async {
    final images = cache((_) async => _png);
    final product = InventoryProduct.fromJson(_productJson());
    await tester.runAsync(() => images.load(product));
    Widget view() => MaterialApp(
      home: Scaffold(
        body: InventoryProductImage(product: product, cache: images),
      ),
    );
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(find.byType(Image), findsOneWidget);
    user = null;
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(find.byType(Image), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
