import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/feature_flags/mobile_flags.dart';

Map<String, dynamic> _payload({bool enabled = true, int ttl = 30}) => {
  'version': enabled ? '"enabled"' : '"killed"',
  'ttlSeconds': ttl,
  'flags': {for (final flag in MobileFlag.values) flag.key: enabled},
};

CacheKey _key(String user, String workspace) => CacheKey(
  namespace: 'mobile.featureFlags',
  userId: user,
  workspaceId: workspace,
);

class _PollTimer implements Timer {
  _PollTimer(this.duration, this.callback);
  final Duration duration;
  final void Function() callback;
  @override
  bool isActive = true;
  @override
  int tick = 0;
  @override
  void cancel() => isActive = false;
  void fire() {
    if (!isActive) return;
    isActive = false;
    tick++;
    callback();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore cache;
  late MobileFlags flags;
  late List<_PollTimer> timers;
  var publications = 0;

  CacheStore openCache() => CacheStore.forTesting(
    secureStorage: const FlutterSecureStorage(),
    directoryResolver: () async => directory,
    persistenceCheckpoint: (stage) {
      if (stage == 'snapshot') publications++;
    },
  );

  MobileFlags reader(
    MobileFlagsFetch fetch, {
    Stream<List<ConnectivityResult>> network = const Stream.empty(),
  }) => MobileFlags(
    cache: cache,
    fetch: fetch,
    networkEvents: network,
    createTimer: (duration, callback) {
      final timer = _PollTimer(duration, callback);
      timers.add(timer);
      return timer;
    },
  );

  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    directory = await Directory.systemTemp.createTemp('flags-contract-');
    publications = 0;
    timers = [];
    cache = openCache();
    await cache.init();
  });
  tearDown(() async {
    await flags.close();
    await cache.closeForTesting();
    await directory.delete(recursive: true);
  });

  test(
    'rule 1: 30-second polling stops on pause and restarts on resume',
    () async {
      var requests = 0;
      flags = reader((_, _) async {
        requests++;
        return requests == 1 ? _payload() : null;
      });
      await flags.setScope(userId: 'a', workspaceId: 'one');
      expect(timers.last.duration, const Duration(seconds: 30));
      timers.last.fire();
      await Future<void>.delayed(Duration.zero);
      expect(requests, 2);
      expect(timers.last.duration, const Duration(seconds: 30));
      final paused = timers.last;
      flags.setForeground(foreground: false);
      expect(paused.isActive, isFalse);
      paused.fire();
      await flags.refresh();
      expect(requests, 2);
      expect(timers.length, 2);
      flags.setForeground(foreground: true);
      expect(requests, 3);
      await Future<void>.delayed(Duration.zero);
      expect(timers.last.isActive, isTrue);
      expect(timers.last.duration, const Duration(seconds: 30));
      timers.last.fire();
      await Future<void>.delayed(Duration.zero);
      expect(requests, 4);
    },
  );

  test(
    'rule 1: a changed payload TTL replaces the previous interval',
    () async {
      var requests = 0;
      flags = reader((_, _) async => _payload(ttl: ++requests == 1 ? 30 : 7));
      await flags.setScope(userId: 'a', workspaceId: 'one');
      expect(timers.last.duration, const Duration(seconds: 30));
      await flags.refresh();
      expect(timers.last.duration, const Duration(seconds: 7));
    },
  );

  test(
    'rule 2: login and account/workspace changes refresh without a timer tick',
    () async {
      final workspaces = <String>[];
      final versions = <String?>[];
      flags = reader((workspace, version) async {
        workspaces.add(workspace);
        versions.add(version);
        return _payload();
      });
      expect(workspaces, isEmpty);
      await flags.setScope(userId: 'a', workspaceId: 'one');
      expect(workspaces, ['one']);
      await flags.setScope(userId: 'b', workspaceId: 'one');
      expect(workspaces, ['one', 'one']);
      await flags.setScope(userId: 'b', workspaceId: 'two');
      expect(workspaces, ['one', 'one', 'two']);
      expect(versions, [null, null, null]);
      expect(timers.every((timer) => timer.tick == 0), isTrue);
    },
  );

  test(
    'rule 2: resume and reconnect refresh immediately without a timer tick',
    () async {
      final network = StreamController<List<ConnectivityResult>>(sync: true);
      addTearDown(network.close);
      var requests = 0;
      flags = reader((_, _) async {
        requests++;
        return requests == 1 ? _payload() : null;
      }, network: network.stream);
      await flags.setScope(userId: 'a', workspaceId: 'one');
      flags
        ..setForeground(foreground: false)
        ..setForeground(foreground: true);
      expect(requests, 2);
      await Future<void>.delayed(Duration.zero);
      network
        ..add([ConnectivityResult.none])
        ..add([ConnectivityResult.wifi]);
      expect(requests, 3);
      await Future<void>.delayed(Duration.zero);
      expect(timers.every((timer) => timer.tick == 0), isTrue);
    },
  );

  test(
    'rule 3: cached version is reused and 304 leaves state untouched',
    () async {
      final versions = <String?>[];
      flags = reader((_, version) async {
        versions.add(version);
        return versions.length == 1 ? _payload() : null;
      });
      await flags.setScope(userId: 'a', workspaceId: 'one');
      final initial = flags.state;
      final initialWrites = publications;
      expect(initialWrites, greaterThan(0));
      for (var i = 0; i < 3; i++) {
        await flags.refresh();
        expect(identical(flags.state, initial), isTrue);
        expect(MobileFlag.values.every(flags.enabled), isTrue);
        expect(publications, initialWrites);
      }
      expect(versions, [null, '"enabled"', '"enabled"', '"enabled"']);
    },
  );

  test(
    'rule 4: unreachable keeps last known flags without time expiry on disk',
    () async {
      await cache.write(
        key: _key('a', 'one'),
        policy: const CachePolicy(
          staleAfter: Duration(days: -2),
          expireAfter: Duration(days: -1),
        ),
        payload: _payload(),
      );
      flags = reader((_, _) async => throw Exception('unreachable'));
      await flags.setScope(userId: 'a', workspaceId: 'one');
      expect(MobileFlag.values.every(flags.enabled), isTrue);
      await flags.refresh();
      expect(MobileFlag.values.every(flags.enabled), isTrue);
      await flags.close();
      await cache.closeForTesting();
      cache = openCache();
      flags = reader((_, _) async => throw Exception('still unreachable'));
      await flags.setScope(userId: 'a', workspaceId: 'one');
      final cached = await cache.read<Object?>(
        key: _key('a', 'one'),
        decode: (json) => json,
      );
      expect(cached.isExpired, isFalse);
      expect(MobileFlag.values.every(flags.enabled), isTrue);
    },
  );

  test(
    'rule 5: kill forces every offline key off only after successful refresh',
    () async {
      var requests = 0;
      flags = reader((_, _) async {
        requests++;
        if (requests == 2) throw Exception('unreachable');
        return requests == 1
            ? _payload()
            : {
                ..._payload(),
                'version': '"killed"',
                'flags': {
                  ...(_payload()['flags'] as Map<String, bool>),
                  'mobile_offline': false,
                },
              };
      });
      await flags.setScope(userId: 'a', workspaceId: 'one');
      expect(MobileFlag.values.every(flags.enabled), isTrue);
      await flags.refresh();
      expect(MobileFlag.values.every(flags.enabled), isTrue);
      await flags.refresh();
      expect(flags.enabled(MobileFlag.mobileOffline), isFalse);
      for (final flag in MobileFlag.values.where(
        (flag) => flag.key.startsWith('offline_'),
      )) {
        expect(flags.enabled(flag), isFalse, reason: flag.key);
      }
    },
  );

  test(
    'rule 6: cache isolates account/workspace and logout erases only that account',
    () async {
      var offline = false;
      flags = reader((workspace, _) async {
        if (offline) throw Exception('unreachable');
        return _payload(enabled: workspace == 'one');
      });
      await flags.setScope(userId: 'a', workspaceId: 'one');
      await flags.setScope(userId: 'a', workspaceId: 'two');
      await flags.setScope(userId: 'b', workspaceId: 'one');
      offline = true;
      await flags.setScope(userId: 'b', workspaceId: 'two');
      expect(MobileFlag.values.any(flags.enabled), isFalse);
      await flags.setScope(userId: 'a', workspaceId: 'two');
      expect(MobileFlag.values.any(flags.enabled), isFalse);
      await flags.setScope(userId: 'a', workspaceId: 'one');
      expect(MobileFlag.values.every(flags.enabled), isTrue);
      await flags.setScope();
      expect(MobileFlag.values.any(flags.enabled), isFalse);
      for (final workspace in ['one', 'two']) {
        final cached = await cache.read<Object?>(
          key: _key('a', workspace),
          decode: (json) => json,
        );
        expect(cached.hasValue, isFalse);
      }
      await flags.setScope(userId: 'b', workspaceId: 'one');
      expect(MobileFlag.values.every(flags.enabled), isTrue);
      await flags.setScope(userId: 'a', workspaceId: 'one');
      expect(MobileFlag.values.any(flags.enabled), isFalse);
    },
  );

  test(
    'rule 7: cold cache leaves all flags false even when unreachable',
    () async {
      flags = reader((_, _) async => throw Exception('unreachable'));
      expect(MobileFlag.values.any(flags.enabled), isFalse);
      await flags.setScope(userId: 'a', workspaceId: 'one');
      expect(MobileFlag.values.any(flags.enabled), isFalse);
      await flags.refresh();
      expect(MobileFlag.values.any(flags.enabled), isFalse);
    },
  );
}
