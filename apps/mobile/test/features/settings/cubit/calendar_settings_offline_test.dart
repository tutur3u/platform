import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_settings_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';

import '../../../helpers/calendar_settings_cache_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late CalendarSettingsCacheHarness h;
  late CalendarSettingsRepository repository;
  late CalendarSettingsCubit cubit;
  setUp(() async {
    h = CalendarSettingsCacheHarness();
    await h.init();
    repository = CalendarSettingsRepository(
      apiClient: h.api,
      cacheStore: h.store,
      userId: h.currentActor,
    );
    cubit = CalendarSettingsCubit(
      repository: repository,
      userId: h.currentActor,
      authChanges: const Stream.empty(),
    );
  });
  tearDown(() async {
    await cubit.close();
    repository.dispose();
    await h.dispose();
  });

  test('a save supersedes an in-flight refresh without restoring old values', () async {
    h.api.read = (_) async => {'first_day_of_week': 'monday'};
    await cubit.load(userId: 'actor', workspaceId: null);
    final held = Completer<Map<String, dynamic>>();
    h.api.read = (_) => held.future;
    final loading = cubit.load(userId: 'actor', workspaceId: null);
    expect(cubit.state.revalidating, isTrue);
    await cubit.setFirstDayOfWeek(FirstDayOfWeek.saturday);
    expect(cubit.state.userPreference, FirstDayOfWeek.saturday);
    held.complete({'first_day_of_week': 'sunday'});
    await loading;
    expect(cubit.state.userPreference, FirstDayOfWeek.saturday);
    expect(cubit.state.saving, isFalse);
    expect(cubit.state.revalidating, isFalse);
  });

  test(
    'publishes scoped cached week starts before awaiting fresh preferences',
    () async {
      await h.seed('settings.calendar.weekStart', 'monday');
      await h.seed('settings.calendar.weekStart', 'sunday', workspaceId: 'ws');
      final personal = Completer<Map<String, dynamic>>();
      final workspace = Completer<Map<String, dynamic>>();
      h.api.read = (path) => path == TimezoneSettingsRepository.personalPath
          ? personal.future
          : workspace.future;
      final snapshot = cubit.stream.firstWhere(
        (state) =>
            state.userLoaded && state.workspaceLoaded && state.isFromCache,
      );
      final pending = cubit.load(userId: 'actor', workspaceId: 'ws');
      final cached = await snapshot;
      expect(cached.userPreference, FirstDayOfWeek.monday);
      expect(cached.workspacePreference, FirstDayOfWeek.sunday);
      expect(cached.resolvedFirstDayIndex('vi'), 1);
      expect(cached.revalidating, isTrue);
      personal.complete({'first_day_of_week': 'auto'});
      workspace.complete(<String, dynamic>{'first_day_of_week': 'saturday'});
      await pending;
      expect(cubit.state.resolvedFirstDayIndex('vi'), 6);
      expect(cubit.state.isFromCache, isFalse);
      expect(cubit.state.revalidating, isFalse);
      await cubit.loadWorkspacePreference('ws');
      expect(h.api.gets, hasLength(4));
    },
  );

  test('offline restores a snapshot and exposes failed revalidation', () async {
    await h.seed('settings.calendar.weekStart', 'monday');
    h.api.read = (_) async =>
        throw const ApiException.transport(message: 'Offline');
    await cubit.loadUserPreference();
    expect(cubit.state.userPreference, FirstDayOfWeek.monday);
    expect(cubit.state.userLoaded, isTrue);
    expect(cubit.state.isFromCache, isTrue);
    expect(cubit.state.error, isA<ApiException>());
    expect(cubit.state.loading, isFalse);
  });

  test('cold offline does not claim a stored preference', () async {
    h.api.read = (_) async =>
        throw const ApiException.transport(message: 'Offline');
    await cubit.loadUserPreference();
    expect(cubit.state.userLoaded, isFalse);
    expect(cubit.state.isFromCache, isFalse);
    expect(cubit.state.error, isNotNull);
  });

  test('failed and pending saves retain the selected server value', () async {
    h.api.read = (_) async => {'first_day_of_week': 'monday'};
    await cubit.loadUserPreference();
    final saved = Completer<Map<String, dynamic>>();
    h.api.write = (_, _) => saved.future;
    final pending = cubit.setFirstDayOfWeek(FirstDayOfWeek.sunday);
    expect(cubit.state.saving, isTrue);
    expect(cubit.state.userPreference, FirstDayOfWeek.monday);
    saved.completeError(
      const ApiException.transport(message: 'Unknown write outcome'),
    );
    await pending;
    expect(cubit.state.userPreference, FirstDayOfWeek.monday);
    expect(cubit.state.error, isA<ApiException>());
    expect(cubit.state.saving, isFalse);
    expect(await h.store.listPendingMutations(), isEmpty);
  });

  test(
    'write denial preserves the last read value and its offline snapshot',
    () async {
      h.api.read = (_) async => {'first_day_of_week': 'monday'};
      await cubit.loadUserPreference();
      h.api.write = (_, _) async => throw const ApiException(
        statusCode: 403,
        message: 'Write access denied',
      );
      await cubit.setFirstDayOfWeek(FirstDayOfWeek.sunday);
      expect(cubit.state.userPreference, FirstDayOfWeek.monday);
      expect(cubit.state.error, isA<ApiException>());
      expect(await repository.snapshot('actor', null), 'monday');
    },
  );

  test('an acknowledged save uses the private Calendar API response', () async {
    await cubit.loadUserPreference();
    await cubit.setFirstDayOfWeek(FirstDayOfWeek.saturday);
    expect(cubit.state.userPreference, FirstDayOfWeek.saturday);
    expect(cubit.state.error, isNull);
    expect(h.api.patches.single.$1, '/api/v1/users/calendar-settings');
    expect(h.api.patches.single.$2, {'first_day_of_week': 'saturday'});
  });

  test(
    'workspace A-B-A fences late responses and clears the workspace on exit',
    () async {
      final old = Completer<Map<String, dynamic>>();
      h.api.read = (path) async => path.contains('/workspaces/a/')
          ? await old.future
          : <String, dynamic>{'first_day_of_week': 'sunday'};
      final first = cubit.load(userId: 'actor', workspaceId: 'a');
      await cubit.load(userId: 'actor', workspaceId: 'b');
      expect(cubit.state.workspacePreference, FirstDayOfWeek.sunday);
      h.api.read = (_) async => {'first_day_of_week': 'monday'};
      await cubit.load(userId: 'actor', workspaceId: 'a');
      old.complete(<String, dynamic>{'first_day_of_week': 'saturday'});
      await first;
      expect(cubit.state.workspacePreference, FirstDayOfWeek.monday);
      expect(await repository.snapshot('actor', 'a'), 'monday');
      final exiting = cubit.load(userId: 'actor', workspaceId: null);
      expect(cubit.state.workspacePreference, FirstDayOfWeek.auto_);
      expect(cubit.state.workspaceLoaded, isFalse);
      await exiting;
    },
  );

  test(
    'auth stream clears data immediately and rejects a prior actor load',
    () async {
      await cubit.close();
      final auth = StreamController<String?>.broadcast(sync: true);
      cubit = CalendarSettingsCubit(
        repository: repository,
        userId: h.currentActor,
        authChanges: auth.stream,
      );
      final response = Completer<Map<String, dynamic>>();
      h.api.read = (_) => response.future;
      final first = cubit.loadUserPreference();
      h.actor = null;
      auth.add(null);
      expect(cubit.state.userLoaded, isFalse);
      expect(cubit.state.userPreference, FirstDayOfWeek.auto_);
      h.actor = 'actor';
      h.api.read = (_) async => {'first_day_of_week': 'monday'};
      auth.add('actor');
      await cubit.loadUserPreference();
      response.complete(<String, dynamic>{'first_day_of_week': 'saturday'});
      await first;
      expect(cubit.state.userPreference, FirstDayOfWeek.monday);
      await auth.close();
    },
  );

  for (final error in [
    const ApiException(message: 'Revoked', statusCode: 403),
    const ApiException(message: 'MFA', statusCode: 403, code: 'MFA_REQUIRED'),
  ]) {
    test(
      'denied week-start revalidation clears the visible stored value',
      () async {
        await h.seed('settings.calendar.weekStart', 'monday');
        h.api.read = (_) async => throw error;
        await cubit.loadUserPreference();
        expect(cubit.state.userPreference, FirstDayOfWeek.auto_);
        expect(cubit.state.userLoaded, isFalse);
        expect(cubit.state.error, same(error));
        expect(await repository.snapshot('actor', null), isNull);
      },
    );
  }
}
