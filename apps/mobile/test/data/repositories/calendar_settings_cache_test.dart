import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_settings_repository.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

import '../../helpers/calendar_settings_cache_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late CalendarSettingsCacheHarness h;
  late CalendarSettingsRepository week;
  late TimezoneSettingsRepository zone;
  void repositories() {
    week = CalendarSettingsRepository(
      apiClient: h.api,
      cacheStore: h.store,
      userId: h.currentActor,
    );
    zone = TimezoneSettingsRepository(
      apiClient: h.api,
      cacheStore: h.store,
      cacheUserId: h.currentActor,
    );
  }

  setUp(() async {
    h = CalendarSettingsCacheHarness();
    await h.init();
    repositories();
  });
  tearDown(() async {
    week.dispose();
    zone.dispose();
    await h.dispose();
  });

  test(
    'encrypted settings survive reopen with distinct personal/workspace keys',
    () async {
      h.api.read = (path) async => {
        'first_day_of_week': path.contains('/workspaces/')
            ? 'saturday'
            : 'monday',
        'timezone': path.contains('/workspaces/') ? 'Europe/Paris' : 'auto',
      };
      await week.read('actor', null);
      await week.read('actor', 'workspace/a');
      await zone.readPersonal('actor');
      await zone.readWorkspace('actor', 'workspace/a');
      week.dispose();
      zone.dispose();
      await h.reopen();
      repositories();
      expect(await week.snapshot('actor', null), 'monday');
      expect(await week.snapshot('actor', 'workspace/a'), 'saturday');
      expect(await week.snapshot('actor', 'other'), isNull);
      expect(await zone.cachedPersonal('actor'), 'auto');
      expect(
        await zone.cachedWorkspace('actor', 'workspace/a'),
        'Europe/Paris',
      );
      h.actor = 'another';
      expect(await week.snapshot('another', null), isNull);
      expect(await zone.cachedPersonal('another'), isNull);
      expect(
        h.api.gets,
        contains('/api/v1/workspaces/workspace%2Fa/calendar-settings'),
      );
    },
  );

  for (final error in [
    const ApiException(message: 'Denied', statusCode: 401),
    const ApiException(message: 'Denied', statusCode: 403),
    const ApiException(message: 'MFA', statusCode: 403, code: 'MFA_REQUIRED'),
  ]) {
    test(
      'denial ${error.statusCode}/${error.code} purges persisted settings',
      () async {
        await h.seed('settings.calendar.weekStart', 'monday');
        await h.seed('settings.calendar.timezone', 'Europe/Paris');
        h.api.read = (_) async => throw error;
        await expectLater(week.read('actor', null), throwsA(same(error)));
        await expectLater(zone.readPersonal('actor'), throwsA(same(error)));
        week.dispose();
        zone.dispose();
        await h.reopen();
        repositories();
        expect(await week.snapshot('actor', null), isNull);
        expect(await zone.cachedPersonal('actor'), isNull);
      },
    );
  }

  test(
    'transport failures retain expired snapshots and never enqueue writes',
    () async {
      const expired = CachePolicy(
        staleAfter: Duration.zero,
        expireAfter: Duration.zero,
      );
      await h.seed('settings.calendar.weekStart', 'monday', policy: expired);
      await h.seed(
        'settings.calendar.timezone',
        'Europe/Paris',
        policy: expired,
      );
      h.api.read = (_) async =>
          throw const ApiException.transport(message: 'Offline');
      h.api.write = (_, _) async =>
          throw const ApiException.transport(message: 'Unknown outcome');
      await expectLater(week.read('actor', null), throwsA(isA<ApiException>()));
      await expectLater(
        zone.readPersonal('actor'),
        throwsA(isA<ApiException>()),
      );
      await expectLater(
        week.savePersonal('actor', 'sunday'),
        throwsA(isA<ApiException>()),
      );
      await expectLater(
        zone.writePersonal('actor', 'UTC'),
        throwsA(isA<ApiException>()),
      );
      expect(await week.snapshot('actor', null), 'monday');
      expect(await zone.cachedPersonal('actor'), 'Europe/Paris');
      expect(await h.store.listPendingMutations(), isEmpty);
      expect(h.api.patches.map((call) => call.$1), [
        TimezoneSettingsRepository.personalPath,
        TimezoneSettingsRepository.personalPath,
      ]);
      expect(h.api.patches.map((call) => call.$2), [
        {'first_day_of_week': 'sunday'},
        {'timezone': 'UTC'},
      ]);
    },
  );

  test(
    'old A result cannot overwrite the new A snapshot after A-B-A',
    () async {
      final old = Completer<Map<String, dynamic>>();
      h.api.read = (_) => old.future;
      final pending = zone.readPersonal('actor');
      final rejected = expectLater(pending, throwsA(isA<ApiException>()));
      zone.fenceScope('actor', null);
      h.actor = 'b';
      h.api.read = (_) async => {'timezone': 'Europe/London'};
      await zone.readPersonal('b');
      zone.fenceScope('b', null);
      h.actor = 'actor';
      h.api.read = (_) async => {'timezone': 'Asia/Ho_Chi_Minh'};
      await zone.readPersonal('actor');
      old.complete(<String, dynamic>{'timezone': 'UTC'});
      await rejected;
      expect(await zone.cachedPersonal('actor'), 'Asia/Ho_Chi_Minh');
    },
  );

  test(
    'an obsolete denial cannot purge a newer acknowledged preference',
    () async {
      final old = Completer<Map<String, dynamic>>();
      h.api.read = (_) => old.future;
      final pending = week.read('actor', null);
      final rejected = expectLater(pending, throwsA(isA<ApiException>()));
      await week.savePersonal('actor', 'monday');
      old.completeError(
        const ApiException(message: 'Old denied', statusCode: 403),
      );
      await rejected;
      expect(await week.snapshot('actor', null), 'monday');
    },
  );

  test(
    'a late response cannot repopulate resources cleared during the request',
    () async {
      final response = Completer<Map<String, dynamic>>();
      h.api.read = (_) => response.future;
      final pending = week.read('actor', null);
      await h.store.clearScope(userId: 'actor', resourceOnly: true);
      response.complete({'first_day_of_week': 'monday'});
      await pending;
      expect(await week.snapshot('actor', null), isNull);
    },
  );

  test(
    'timezone cooldown coalesces reads without losing the stored value',
    () async {
      await h.seed('settings.calendar.timezone', 'Europe/Paris');
      h.api.read = (_) async => throw const ApiException(
        message: 'Limited',
        statusCode: 429,
        retryAfter: 60,
      );
      final first = zone.readPersonal('actor');
      final second = zone.readPersonal('actor');
      await Future.wait([
        expectLater(first, throwsA(isA<ApiException>())),
        expectLater(second, throwsA(isA<ApiException>())),
      ]);
      await expectLater(
        zone.readPersonal('actor'),
        throwsA(isA<ApiException>()),
      );
      expect(h.api.gets, hasLength(1));
      expect(await zone.cachedPersonal('actor'), 'Europe/Paris');
    },
  );

  test(
    'malformed cached week start is not restored as a known preference',
    () async {
      await h.seed('settings.calendar.weekStart', 'invalid');
      expect(await week.snapshot('actor', null), isNull);
    },
  );

  test(
    'malformed week-start response cannot replace the last snapshot',
    () async {
      await h.seed('settings.calendar.weekStart', 'monday');
      h.api.read = (_) async => {'first_day_of_week': 'invalid'};
      await expectLater(
        week.read('actor', null),
        throwsA(isA<FormatException>()),
      );
      expect(await week.snapshot('actor', null), 'monday');
      final other = await h.store.read<Object>(
        key: const CacheKey(namespace: 'unrelated', userId: 'actor'),
        decode: (json) => json!,
      );
      expect(other.hasValue, isFalse);
    },
  );

  test(
    'purge storage failure cannot mask denial or restore a denied snapshot',
    () async {
      await h.seed('settings.calendar.weekStart', 'monday');
      h.failRemoval = true;
      const denied = ApiException(message: 'Revoked', statusCode: 403);
      h.api.read = (_) async => throw denied;
      await expectLater(week.read('actor', null), throwsA(same(denied)));
      expect(await week.snapshot('actor', null), isNull);
      h.failRemoval = false;
      h.api.read = (_) async => <String, dynamic>{
        'first_day_of_week': 'sunday',
      };
      expect(await week.read('actor', null), 'sunday');
      expect(await week.snapshot('actor', null), 'sunday');
    },
  );
}
