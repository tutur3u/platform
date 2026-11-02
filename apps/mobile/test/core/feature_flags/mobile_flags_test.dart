import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/feature_flags/mobile_flags.dart';

Map<String, dynamic> payload({bool master = true, int ttl = 30}) => {
  'version': '"v1"',
  'ttlSeconds': ttl,
  'flags': {
    'mobile_offline': master,
    'offline_read_habits': true,
    'unknown': true,
  },
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final manifest = File('../../config/feature-flags.json');
  test(
    'generated keys exactly match the canonical manifest',
    () {
      final rows = jsonDecode(manifest.readAsStringSync()) as List<dynamic>;
      expect(
        MobileFlag.values.map((flag) => flag.key),
        unorderedEquals(rows.map((dynamic row) => (row as Map)['key'])),
      );
    },
    skip: manifest.existsSync()
        ? false
        : 'config/feature-flags.json is absent; parallel web lane owns it.',
  );

  group('reader', () {
    late Directory directory;
    late CacheStore cache;
    late MobileFlags flags;
    setUp(() async {
      FlutterSecureStorage.setMockInitialValues({});
      directory = await Directory.systemTemp.createTemp('mobile-flags-');
      cache = CacheStore.forTesting(
        secureStorage: const FlutterSecureStorage(),
        directoryResolver: () async => directory,
      );
      await cache.init();
    });
    tearDown(() async {
      await flags.close();
      await cache.closeForTesting();
      await directory.delete(recursive: true);
    });
    test(
      '200 publishes known flags and 304 retains payload and ETag',
      () async {
        final versions = <String?>[];
        flags = MobileFlags(
          networkEvents: const Stream.empty(),
          cache: cache,
          fetch: (ws, version) async {
            expect(ws, 'workspace');
            versions.add(version);
            return versions.length == 1 ? payload() : null;
          },
        );
        await flags.setScope(userId: 'user', workspaceId: 'workspace');
        expect(flags.enabled(MobileFlag.offlineReadHabits), isTrue);
        expect(flags.enabled(MobileFlag.offlineReadMail), isFalse);
        final cached = await cache.read<Map<String, dynamic>>(
          key: const CacheKey(
            namespace: 'mobile.featureFlags',
            userId: 'user',
            workspaceId: 'workspace',
          ),
          decode: (json) => Map<String, dynamic>.from(json! as Map),
        );
        expect((cached.data!['flags'] as Map).containsKey('unknown'), isFalse);
        await flags.refresh();
        expect(versions, [null, '"v1"']);
        expect(flags.enabled(MobileFlag.offlineReadHabits), isTrue);
      },
    );
    test('network error without cache defaults all keys false', () async {
      flags = MobileFlags(
        networkEvents: const Stream.empty(),
        cache: cache,
        fetch: (_, _) async => throw Exception(),
      );
      await flags.setScope(userId: 'user', workspaceId: 'workspace');
      expect(MobileFlag.values.any(flags.enabled), isFalse);
    });
    test('network error restores persisted payload in a new reader', () async {
      flags = MobileFlags(
        networkEvents: const Stream.empty(),
        cache: cache,
        fetch: (_, _) async => payload(),
      );
      await flags.setScope(userId: 'user', workspaceId: 'workspace');
      await flags.close();
      flags = MobileFlags(
        networkEvents: const Stream.empty(),
        cache: cache,
        fetch: (_, _) async => throw Exception(),
      );
      await flags.setScope(userId: 'user', workspaceId: 'workspace');
      expect(flags.enabled(MobileFlag.offlineReadHabits), isTrue);
    });
    test(
      'old payload migrates to non-expiring retention and survives pruning',
      () async {
        const key = CacheKey(
          namespace: 'mobile.featureFlags',
          userId: 'user',
          workspaceId: 'workspace',
        );
        await cache.write(
          key: key,
          policy: const CachePolicy(
            staleAfter: Duration.zero,
            expireAfter: Duration(days: -1),
          ),
          payload: payload(),
        );
        await cache.closeForTesting();
        cache = CacheStore.forTesting(
          secureStorage: const FlutterSecureStorage(),
          directoryResolver: () async => directory,
        );
        await cache.init();
        flags = MobileFlags(
          cache: cache,
          networkEvents: const Stream.empty(),
          fetch: (_, _) async => throw Exception('unreachable'),
        );
        await flags.setScope(userId: 'user', workspaceId: 'workspace');
        await cache.write(
          key: const CacheKey(namespace: 'expired.fixture'),
          policy: const CachePolicy(
            staleAfter: Duration.zero,
            expireAfter: Duration(days: -1),
          ),
          payload: 'x' * 2000,
        );
        await cache.pruneForTesting(1000);
        await flags.close();
        await cache.closeForTesting();
        cache = CacheStore.forTesting(
          secureStorage: const FlutterSecureStorage(),
          directoryResolver: () async => directory,
        );
        flags = MobileFlags(
          cache: cache,
          networkEvents: const Stream.empty(),
          fetch: (_, _) async => throw Exception('unreachable'),
        );
        await flags.setScope(userId: 'user', workspaceId: 'workspace');
        final cached = await cache.read<Object?>(
          key: key,
          decode: (json) => json,
        );
        expect(cached.isExpired, isFalse);
        expect(flags.enabled(MobileFlag.offlineReadHabits), isTrue);
      },
    );

    test(
      'kill switch forces all offline flags false including overrides',
      () async {
        flags = MobileFlags(
          networkEvents: const Stream.empty(),
          cache: cache,
          fetch: (_, _) async => payload(master: false),
        );
        await flags.setScope(userId: 'user', workspaceId: 'workspace');
        expect(MobileFlag.values.any(flags.enabled), isFalse);
        flags.debugOverride = {
          for (final flag in MobileFlag.values)
            flag: flag != MobileFlag.mobileOffline,
        };
        expect(MobileFlag.values.any(flags.enabled), isFalse);
      },
    );
    test('scope switch ignores late responses', () async {
      final response = Completer<Map<String, dynamic>?>();
      final started = Completer<void>();
      flags = MobileFlags(
        networkEvents: const Stream.empty(),
        cache: cache,
        fetch: (ws, _) {
          if (ws == 'old') {
            started.complete();
            return response.future;
          }
          return Future.value(payload(master: false));
        },
      );
      final oldScope = flags.setScope(userId: 'user', workspaceId: 'old');
      await started.future;
      await flags.setScope(userId: 'other', workspaceId: 'new');
      response.complete(payload());
      await oldScope;
      expect(MobileFlag.values.any(flags.enabled), isFalse);
    });
    test(
      'logout clears every workspace for the account and fences late refresh',
      () async {
        var offline = false;
        final pending = Completer<Map<String, dynamic>?>();
        flags = MobileFlags(
          networkEvents: const Stream.empty(),
          cache: cache,
          fetch: (ws, _) {
            if (!offline) return Future.value(payload());
            if (!pending.isCompleted) return pending.future;
            throw Exception('unreachable');
          },
        );
        await flags.setScope(userId: 'other', workspaceId: 'a');
        await flags.setScope(userId: 'user', workspaceId: 'a');
        await flags.setScope(userId: 'user', workspaceId: 'b');
        offline = true;
        final refresh = flags.refresh();
        await flags.setScope();
        expect(MobileFlag.values.any(flags.enabled), isFalse);
        pending.complete(payload());
        await refresh;
        for (final ws in ['a', 'b']) {
          final cached = await cache.read<Object?>(
            key: CacheKey(
              namespace: 'mobile.featureFlags',
              userId: 'user',
              workspaceId: ws,
            ),
            decode: (json) => json,
          );
          expect(cached.hasValue, isFalse);
        }
        await flags.setScope(userId: 'other', workspaceId: 'a');
        expect(flags.enabled(MobileFlag.offlineReadHabits), isTrue);
        await flags.setScope(userId: 'user', workspaceId: 'a');
        expect(MobileFlag.values.any(flags.enabled), isFalse);
      },
    );

    test('offline snapshots are isolated by workspace and account', () async {
      var offline = false;
      flags = MobileFlags(
        networkEvents: const Stream.empty(),
        cache: cache,
        fetch: (ws, _) async {
          if (offline) throw Exception('unreachable');
          return payload(master: ws == 'a');
        },
      );
      await flags.setScope(userId: 'user', workspaceId: 'a');
      await flags.setScope(userId: 'user', workspaceId: 'b');
      offline = true;
      await flags.setScope(userId: 'user', workspaceId: 'a');
      expect(flags.enabled(MobileFlag.offlineReadHabits), isTrue);
      await flags.setScope(userId: 'user', workspaceId: 'b');
      expect(MobileFlag.values.any(flags.enabled), isFalse);
      await flags.setScope(userId: 'other', workspaceId: 'a');
      expect(MobileFlag.values.any(flags.enabled), isFalse);
      await flags.setScope(userId: 'user', workspaceId: 'a');
      expect(flags.enabled(MobileFlag.offlineReadHabits), isTrue);
    });

    test(
      'background pauses TTL; resume and reconnect refresh last known flags',
      () async {
        final network = StreamController<List<ConnectivityResult>>(sync: true);
        addTearDown(network.close);
        final killed = Completer<void>();
        var requests = 0;
        flags = MobileFlags(
          cache: cache,
          networkEvents: network.stream,
          fetch: (_, _) async {
            requests++;
            if (requests == 2) throw Exception('unreachable');
            if (requests == 3) killed.complete();
            return payload(master: requests < 3, ttl: 1);
          },
        );
        await flags.setScope(userId: 'user', workspaceId: 'workspace');
        flags.setForeground(foreground: false);
        await Future<void>.delayed(const Duration(milliseconds: 1100));
        expect(requests, 1);
        expect(flags.enabled(MobileFlag.offlineReadHabits), isTrue);
        network
          ..add([ConnectivityResult.none])
          ..add([ConnectivityResult.wifi]);
        expect(requests, 1);
        flags.setForeground(foreground: true);
        // Resume fetch fails; cached enablement survives that failure.
        await Future<void>.delayed(Duration.zero);
        expect(requests, 2);
        expect(flags.enabled(MobileFlag.offlineReadHabits), isTrue);
        network
          ..add([ConnectivityResult.none])
          ..add([ConnectivityResult.wifi]);
        await killed.future;
        await Future<void>.delayed(Duration.zero);
        expect(requests, 3);
        expect(MobileFlag.values.any(flags.enabled), isFalse);
      },
    );

    test('TTL schedules another conditional request', () async {
      var requests = 0;
      flags = MobileFlags(
        networkEvents: const Stream.empty(),
        cache: cache,
        fetch: (_, _) async {
          requests++;
          return payload(ttl: 1);
        },
      );
      await flags.setScope(userId: 'user', workspaceId: 'workspace');
      await Future<void>.delayed(const Duration(milliseconds: 1100));
      expect(requests, greaterThanOrEqualTo(2));
    });
  });
}
