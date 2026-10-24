import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

import '../../../helpers/calendar_settings_cache_harness.dart';

class _UnavailableSnapshotRepository extends TimezoneSettingsRepository {
  _UnavailableSnapshotRepository({
    super.apiClient,
    super.cacheStore,
    super.cacheUserId,
  });
  @override
  Future<String?> cachedPersonal(String userId) =>
      throw StateError('Cache unavailable');
  @override
  Future<String?> cachedWorkspace(String userId, String id) =>
      throw StateError('Cache unavailable');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late CalendarSettingsCacheHarness h;
  late TimezoneSettingsRepository repository;
  late TimezoneSettingsCubit cubit;
  setUp(() async {
    h = CalendarSettingsCacheHarness();
    await h.init();
    repository = TimezoneSettingsRepository(
      apiClient: h.api,
      cacheStore: h.store,
      cacheUserId: h.currentActor,
    );
    cubit = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async => 'UTC',
    );
  });
  tearDown(() async {
    await cubit.close();
    repository.dispose();
    await h.dispose();
  });

  test(
    'a timezone save can supersede a refresh of a known preference',
    () async {
      h.api.read = (_) async => {'timezone': 'Europe/Paris'};
      await cubit.load(userId: 'actor', workspaceId: null);
      final held = Completer<Map<String, dynamic>>();
      h.api.read = (_) => held.future;
      final loading = cubit.load(userId: 'actor', workspaceId: null);
      expect(cubit.state.loading, isTrue);
      await cubit.save('Asia/Ho_Chi_Minh');
      expect(cubit.state.personal, 'Asia/Ho_Chi_Minh');
      held.complete({'timezone': 'UTC'});
      await loading;
      expect(cubit.state.personal, 'Asia/Ho_Chi_Minh');
      expect(cubit.state.saving, isFalse);
    },
  );

  test(
    'an unavailable snapshot cannot discard a successful fresh timezone',
    () async {
      h.api.read = (_) async => {'timezone': 'Asia/Ho_Chi_Minh'};
      final failingCache = _UnavailableSnapshotRepository(
        apiClient: h.api,
        cacheStore: h.store,
        cacheUserId: h.currentActor,
      );
      final fresh = TimezoneSettingsCubit(
        repository: failingCache,
        deviceLoader: () async => 'UTC',
      );
      await fresh.load(userId: 'actor', workspaceId: 'workspace');
      expect(fresh.state.personal, 'Asia/Ho_Chi_Minh');
      expect(fresh.state.resolved, isTrue);
      expect(fresh.state.failed, isFalse);
      await fresh.close();
      failingCache.dispose();
    },
  );

  test(
    'cached timezone resolves immediately while fresh scoped reads are pending',
    () async {
      await h.seed('settings.calendar.timezone', 'Europe/Paris');
      await h.seed('settings.calendar.timezone', 'UTC', workspaceId: 'ws');
      final personal = Completer<Map<String, dynamic>>();
      final workspace = Completer<Map<String, dynamic>>();
      h.api.read = (path) => path == TimezoneSettingsRepository.personalPath
          ? personal.future
          : workspace.future;
      final snapshot = cubit.stream.firstWhere((state) => state.isFromCache);
      final pending = cubit.load(userId: 'actor', workspaceId: 'ws');
      final cached = await snapshot;
      expect(cached.personal, 'Europe/Paris');
      expect(cached.workspace, 'UTC');
      expect(cached.resolved, isTrue);
      expect(cached.loading, isTrue);
      personal.complete({'timezone': 'auto'});
      workspace.complete({'timezone': 'Asia/Ho_Chi_Minh'});
      await pending;
      expect(cubit.state.effective, 'Asia/Ho_Chi_Minh');
      expect(cubit.state.isFromCache, isFalse);
      expect(cubit.state.loading, isFalse);
      await cubit.reload();
      expect(h.api.gets, hasLength(4));
    },
  );

  test(
    'offline restores a resolved timezone while reporting refresh failure',
    () async {
      await h.seed('settings.calendar.timezone', 'Europe/Paris');
      h.api.read = (_) async =>
          throw const ApiException.transport(message: 'Offline');
      await cubit.load(userId: 'actor', workspaceId: null);
      expect(cubit.state.personal, 'Europe/Paris');
      expect(cubit.state.resolved, isTrue);
      expect(cubit.state.failed, isTrue);
      expect(cubit.state.isFromCache, isTrue);
      expect(cubit.state.personalLoaded, isTrue);
    },
  );

  test(
    'workspace snapshot cannot replace a missing personal preference',
    () async {
      await h.seed(
        'settings.calendar.timezone',
        'Europe/Paris',
        workspaceId: 'a',
      );
      h.api.read = (_) async =>
          throw const ApiException.transport(message: 'Offline');
      await cubit.load(userId: 'actor', workspaceId: 'a');
      expect(cubit.state.personalLoaded, isFalse);
      expect(cubit.state.workspaceLoaded, isTrue);
      expect(cubit.state.resolved, isFalse);
      await cubit.load(userId: 'actor', workspaceId: 'b');
      expect(cubit.state.workspace, 'auto');
      expect(cubit.state.workspaceLoaded, isFalse);
    },
  );

  test(
    'cache restore does not hold a named fresh preference on the device plugin',
    () async {
      await cubit.close();
      final device = Completer<String>();
      cubit = TimezoneSettingsCubit(
        repository: repository,
        deviceLoader: () => device.future,
      );
      await h.seed('settings.calendar.timezone', 'auto');
      h.api.read = (_) async => {'timezone': 'Europe/Paris'};
      await cubit.load(userId: 'actor', workspaceId: null);
      expect(cubit.state.resolved, isTrue);
      expect(cubit.state.effective, 'Europe/Paris');
      device.complete('UTC');
    },
  );

  test(
    'account A-B-A gets a new read and ignores old cached publication',
    () async {
      final old = Completer<Map<String, dynamic>>();
      h.api.read = (_) => old.future;
      final first = cubit.load(userId: 'actor', workspaceId: null);
      h.actor = null;
      await cubit.load(userId: null, workspaceId: null);
      h.actor = 'actor';
      h.api.read = (_) async => {'timezone': 'Europe/Paris'};
      await cubit.load(userId: 'actor', workspaceId: null);
      old.complete({'timezone': 'UTC'});
      await first;
      expect(cubit.state.personal, 'Europe/Paris');
      expect(await repository.cachedPersonal('actor'), 'Europe/Paris');
      expect(h.api.gets, hasLength(2));
    },
  );

  for (final error in [
    const ApiException(message: 'Revoked', statusCode: 401),
    const ApiException(message: 'Revoked', statusCode: 403),
    const ApiException(message: 'MFA', statusCode: 403, code: 'MFA_REQUIRED'),
  ]) {
    test(
      'denial ${error.statusCode}/${error.code} clears cached visible timezone',
      () async {
        await h.seed('settings.calendar.timezone', 'Europe/Paris');
        h.api.read = (_) async => throw error;
        await cubit.load(userId: 'actor', workspaceId: null);
        expect(cubit.state.personal, 'auto');
        expect(cubit.state.personalLoaded, isFalse);
        expect(cubit.state.resolved, isFalse);
        expect(cubit.state.failed, isTrue);
        expect(await repository.cachedPersonal('actor'), isNull);
      },
    );
  }

  test(
    'write denial keeps the last read timezone cached without queuing',
    () async {
      h.api.read = (_) async => {'timezone': 'Europe/Paris'};
      await cubit.load(userId: 'actor', workspaceId: null);
      h.api.write = (_, _) async => throw const ApiException(
        statusCode: 403,
        message: 'Write access denied',
      );
      await cubit.save('UTC');
      expect(cubit.state.personal, 'Europe/Paris');
      expect(cubit.state.failed, isTrue);
      expect(await repository.cachedPersonal('actor'), 'Europe/Paris');
      expect(await h.store.listPendingMutations(), isEmpty);
    },
  );

  test('unknown online save retains prior value and draft '
      'without creating outbox work', () async {
    h.api.read = (_) async => {'timezone': 'Europe/Paris'};
    await cubit.load(userId: 'actor', workspaceId: null);
    h.api.write = (_, _) async =>
        throw const ApiException.transport(message: 'Unknown write outcome');
    await cubit.save('UTC');
    expect(cubit.state.personal, 'Europe/Paris');
    expect(cubit.state.failedSaveZone, 'UTC');
    expect(cubit.state.failed, isTrue);
    expect(await repository.cachedPersonal('actor'), 'Europe/Paris');
    expect(await h.store.listPendingMutations(), isEmpty);
  });
}
