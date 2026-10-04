import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends ApiClient {
  @override
  void checkUser(String userId) {}
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async => {
    'items': [
      {
        'id': 'task',
        'type': 'task',
        'createdAt': '2026-09-30T10:00:00Z',
        'scope': 'personal',
      },
    ],
    'partial': true,
    'limited': true,
  };
}

class _PageApi extends ApiClient {
  @override
  void checkUser(String userId) {}
  final paths = <String>[];
  bool partial = false;
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    paths.add(path);
    return {
      'items': <Object>[],
      'partial': partial,
      'limited': true,
      'until': '2026-10-04T07:00:00.000Z',
      'nextPage': paths.length,
    };
  }
}

class _ScenarioApi extends _Api {
  final responses = <Map<String, dynamic>>[];
  String actor = 'owner';
  Completer<Map<String, dynamic>>? pending;
  ApiException? failure;
  @override
  void checkUser(String userId) {
    if (actor != userId) throw const FormatException('Account changed');
  }

  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    if (failure case final ApiException error) throw error;
    return pending != null ? await pending!.future : responses.removeAt(0);
  }
}

Map<String, dynamic> _item(String id, String type) => {
  'id': id,
  'type': type,
  'createdAt': '2026-09-30T10:00:00Z',
  'scope': type == 'calendar' ? 'workspace' : 'personal',
};
Map<String, dynamic> _page(List<Map<String, dynamic>> items, {int? nextPage}) =>
    {
      'items': items,
      'partial': false,
      'limited': nextPage != null,
      'until': '2026-10-04T07:00:00.000Z',
      'nextPage': nextPage,
    };

void main() {
  late Directory directory;
  late CacheStore store;
  late _Storage storage;
  late Map<String, String?> secureValues;
  late ProfileTimelineRepository repository;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('profile-snapshot-');
    storage = _Storage();
    secureValues = {};
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secureValues[call.namedArguments[#key]]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secureValues[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String?;
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      secureValues.remove(call.namedArguments[#key]);
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    repository = ProfileTimelineRepository(
      apiClient: _Api(),
      cacheStore: store,
      secureStorage: storage,
    );
  });
  tearDown(() async {
    repository.dispose();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> reopen() async {
    repository.dispose();
    await store.closeForTesting();
    await Hive.close();
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    repository = ProfileTimelineRepository(
      apiClient: _Api(),
      cacheStore: store,
      secureStorage: storage,
    );
  }

  test('continuations pin boundaries and reject partial pages', () async {
    final api = _PageApi();
    final paged = ProfileTimelineRepository(
      apiClient: api,
      cacheStore: store,
      secureStorage: storage,
    );
    await paged.refresh('personal', 'owner');
    expect(paged.nextPage('personal', 'owner'), 1);
    await paged.loadMore('personal', 'owner', 1);
    final url = Uri.parse(api.paths.last);
    expect(url.queryParameters['until'], '2026-10-04T07:00:00.000Z');
    expect(url.queryParameters['page'], '1');
    expect(paged.nextPage('personal', 'owner'), 2);
    api.partial = true;
    await expectLater(
      paged.loadMore('personal', 'owner', 2),
      throwsFormatException,
    );
    expect(paged.nextPage('personal', 'owner'), 2);
    expect(paged.nextPage('other', 'owner'), isNull);
    paged.dispose();
  });

  test('partial refresh retains only failed providers after reopen', () async {
    final api = _ScenarioApi();
    repository.dispose();
    repository = ProfileTimelineRepository(
      apiClient: api,
      cacheStore: store,
      secureStorage: storage,
    );
    api.responses.add(
      _page([
        _item('old-task', 'task'),
        _item('old-event', 'calendar'),
        _item('old-note', 'note'),
      ]),
    );
    await repository.refresh('personal', 'owner');
    api.responses.add({
      ..._page([_item('new-task', 'task')]),
      'partial': true,
      'failedSources': ['events'],
    });
    final fresh = await repository.refresh('personal', 'owner');
    expect(fresh.items.map((item) => item.id), ['old-event', 'new-task']);
    expect(repository.nextPage('personal', 'owner'), isNull);
    await reopen();
    final retained = await repository.cached('personal', 'owner');
    expect(retained!.items.map((item) => item.id), ['old-event', 'new-task']);
    expect(retained.partial, isTrue);
    expect(await repository.cached('personal', 'other-owner'), isNull);
    expect(await repository.cached('other-workspace', 'owner'), isNull);
  });

  test('partial refresh prunes Calendar when only Notes failed', () async {
    final api = _ScenarioApi();
    repository.dispose();
    repository = ProfileTimelineRepository(
      apiClient: api,
      cacheStore: store,
      secureStorage: storage,
    );
    api.responses.add(
      _page([_item('old-event', 'calendar'), _item('old-note', 'note')]),
    );
    await repository.refresh('personal', 'owner');
    // Empty/omitted Calendar is successful, not an unavailable source.
    api.responses.add({
      ..._page([_item('new-task', 'task')]),
      'partial': true,
      'failedSources': ['notes'],
    });
    await repository.refresh('personal', 'owner');
    await reopen();
    final retained = await repository.cached('personal', 'owner');
    expect(retained!.items.map((item) => item.id), ['old-note', 'new-task']);
    expect(retained.partial, isTrue);
  });

  for (final status in [401, 403]) {
    for (final pagination in [false, true]) {
      test(
        'denial $status clears scoped snapshot paging=$pagination',
        () async {
          final api = _ScenarioApi();
          repository.dispose();
          repository = ProfileTimelineRepository(
            apiClient: api,
            cacheStore: store,
            secureStorage: storage,
          );
          api.responses.add(_page([_item('private', 'task')], nextPage: 1));
          await repository.refresh('personal', 'owner');
          expect(
            repository.peek('personal', 'owner')!.items.single.id,
            'private',
          );
          api.failure = ApiException(message: 'Denied', statusCode: status);
          await expectLater(
            pagination
                ? repository.loadMore('personal', 'owner', 1)
                : repository.refresh('personal', 'owner'),
            throwsA(isA<ApiException>()),
          );
          expect(await repository.cached('personal', 'owner'), isNull);
          expect(repository.nextPage('personal', 'owner'), isNull);
          expect(repository.peek('personal', 'owner'), isNull);
        },
      );
    }
  }

  test(
    'transient refresh and verification challenge retain scoped history',
    () async {
      final api = _ScenarioApi();
      repository.dispose();
      repository = ProfileTimelineRepository(
        apiClient: api,
        cacheStore: store,
        secureStorage: storage,
      );
      api.responses.add(_page([_item('private', 'task')], nextPage: 1));
      await repository.refresh('personal', 'owner');
      for (final error in [
        const ApiException(message: 'Disconnected', statusCode: 0),
        const ApiException(
          message: 'MFA required',
          statusCode: 403,
          code: 'MFA_REQUIRED',
        ),
        const ApiException(
          message: 'Verification required',
          statusCode: 403,
          isVerificationRequired: true,
        ),
      ]) {
        api.failure = error;
        await expectLater(
          repository.refresh('personal', 'owner'),
          throwsA(isA<ApiException>()),
        );
        expect(
          (await repository.cached('personal', 'owner'))!.items.single.id,
          'private',
        );
        expect(repository.nextPage('personal', 'owner'), 1);
      }
    },
  );

  test('loaded pages persist deduplicated history after reopen', () async {
    final api = _ScenarioApi();
    repository.dispose();
    repository = ProfileTimelineRepository(
      apiClient: api,
      cacheStore: store,
      secureStorage: storage,
    );
    api.responses.add(_page([_item('first', 'task')], nextPage: 1));
    await repository.refresh('personal', 'owner');
    api.responses.add(
      _page([
        {..._item('first', 'task'), 'title': 'updated'},
        _item('second', 'note'),
      ]),
    );
    await repository.loadMore('personal', 'owner', 1);
    await reopen();
    final retained = await repository.cached('personal', 'owner');
    expect(retained!.items.map((item) => item.id), ['first', 'second']);
    expect(retained.items.first.title, 'updated');
    expect(retained.partial, isFalse);
    expect(retained.limited, isFalse);
    expect(await repository.cached('personal', 'other-owner'), isNull);
  });

  test(
    'account switch during paging cannot overwrite retained history',
    () async {
      final api = _ScenarioApi();
      repository.dispose();
      repository = ProfileTimelineRepository(
        apiClient: api,
        cacheStore: store,
        secureStorage: storage,
      );
      api.responses.add(_page([_item('first', 'task')], nextPage: 1));
      await repository.refresh('personal', 'owner');
      api.pending = Completer<Map<String, dynamic>>();
      final loading = repository.loadMore('personal', 'owner', 1);
      api.actor = 'other-owner';
      api.pending!.complete(_page([_item('stale', 'note')]));
      await expectLater(loading, throwsFormatException);
      await reopen();
      expect(
        (await repository.cached('personal', 'owner'))!.items.single.id,
        'first',
      );
      expect(await repository.cached('personal', 'other-owner'), isNull);
    },
  );

  test('refresh fences a delayed prior page before durable writes', () async {
    final api = _ScenarioApi();
    repository.dispose();
    repository = ProfileTimelineRepository(
      apiClient: api,
      cacheStore: store,
      secureStorage: storage,
    );
    api.responses.add(_page([_item('first', 'task')], nextPage: 1));
    await repository.refresh('personal', 'owner');
    final oldPage = Completer<Map<String, dynamic>>();
    api.pending = oldPage;
    final loading = repository.loadMore('personal', 'owner', 1);
    api.pending = null;
    api.responses.add(_page([_item('fresh-session', 'task')]));
    await repository.refresh('personal', 'owner');
    oldPage.complete(_page([_item('stale-page', 'note')]));
    await expectLater(loading, throwsFormatException);
    await reopen();
    expect(
      (await repository.cached('personal', 'owner'))!.items.single.id,
      'fresh-session',
    );
  });

  for (final switchActor in [true, false]) {
    test(
      'delayed cache init rejects obsolete scope actor=$switchActor',
      () async {
        final api = _ScenarioApi();
        repository.dispose();
        await store.closeForTesting();
        final entered = Completer<void>();
        final release = Completer<Directory>();
        store = CacheStore.forTesting(
          secureStorage: storage,
          directoryResolver: () {
            if (!entered.isCompleted) entered.complete();
            return release.future;
          },
        );
        repository = ProfileTimelineRepository(
          apiClient: api,
          cacheStore: store,
          secureStorage: storage,
        );
        api.responses.add(_page([_item('obsolete', 'task')]));
        final oldRefresh = repository.refresh('personal', 'owner');
        await entered.future;
        Future<ProfileTimelineSnapshot>? newRefresh;
        if (switchActor) {
          api.actor = 'other-owner';
        } else {
          api.responses.add(_page([_item('new-session', 'task')]));
          newRefresh = repository.refresh('personal', 'owner');
        }
        release.complete(directory);
        await expectLater(oldRefresh, throwsFormatException);
        if (newRefresh != null) await newRefresh;
        await reopen();
        final retained = await repository.cached('personal', 'owner');
        if (switchActor) {
          expect(retained, isNull);
          expect(await repository.cached('personal', 'other-owner'), isNull);
        } else {
          expect(retained!.items.single.id, 'new-session');
        }
      },
    );
  }

  test(
    'capped partial result retains completeness through encrypted cache',
    () async {
      final fresh = await repository.refresh('team', 'owner');
      final persistedKeys = Map<String, String?>.of(secureValues);
      expect(persistedKeys, isNotEmpty);
      await reopen();
      final cached = await repository.cached('team', 'owner');
      expect(secureValues, persistedKeys);
      expect(cached!.items.single.id, fresh.items.single.id);
      expect(cached.partial, isTrue);
      expect(cached.limited, isTrue);
      expect(await repository.cached('other-team', 'owner'), isNull);
      expect(await repository.cached('team', 'other-owner'), isNull);
    },
  );
  test(
    'legacy list snapshots remain readable without invented flags',
    () async {
      await store.write(
        key: const CacheKey(
          namespace: 'profile.timeline',
          workspaceId: 'team',
          userId: 'owner',
        ),
        policy: CachePolicies.summary,
        payload: [
          {
            'id': 'legacy',
            'type': 'task',
            'createdAt': '2026-09-30T10:00:00Z',
            'scope': 'personal',
          },
        ],
      );
      final persistedKeys = Map<String, String?>.of(secureValues);
      expect(persistedKeys, isNotEmpty);
      await reopen();
      final cached = await repository.cached('team', 'owner');
      expect(secureValues, persistedKeys);
      expect(cached!.items.single.id, 'legacy');
      expect(cached.partial, isFalse);
      expect(cached.limited, isFalse);
    },
  );
}
