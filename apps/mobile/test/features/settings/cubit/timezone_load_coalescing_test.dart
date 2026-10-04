import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

class _Repository extends TimezoneSettingsRepository {
  _Repository(DateTime Function() clock) : super(clock: clock);
  int personalReads = 0;
  int workspaceReads = 0;
  int writes = 0;
  Future<String> Function() personal = () async => 'UTC';
  Future<String> Function(String) workspace = (_) async => 'auto';
  Future<String> Function(String) save = (zone) async => zone;
  @override
  Future<String> loadPersonal() {
    personalReads++;
    return personal();
  }

  @override
  Future<String> loadWorkspace(String id) {
    workspaceReads++;
    return workspace(id);
  }

  @override
  Future<String> savePersonal(String zone) {
    writes++;
    return save(zone);
  }
}

void main() {
  late DateTime now;
  late _Repository repository;
  late TimezoneSettingsCubit cubit;
  setUp(() {
    now = DateTime.utc(2026, 10, 4);
    repository = _Repository(() => now);
    cubit = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async => 'UTC',
      clock: () => now,
    );
  });
  tearDown(() async {
    await cubit.close();
    repository.dispose();
  });

  test(
    'same-scope resumes await one load, then an explicit refresh reads anew',
    () async {
      final personal = Completer<String>();
      final workspace = Completer<String>();
      repository
        ..personal = (() => personal.future)
        ..workspace = ((_) => workspace.future);
      final first = cubit.load(userId: 'actor', workspaceId: 'a');
      final resume = cubit.reload();
      final repeated = cubit.load(userId: 'actor', workspaceId: 'a');
      expect(identical(first, resume), isTrue);
      expect(identical(first, repeated), isTrue);
      expect(repository.personalReads, 1);
      expect(repository.workspaceReads, 1);
      personal.complete('Europe/Paris');
      workspace.complete('Asia/Ho_Chi_Minh');
      await Future.wait([first, resume, repeated]);
      expect(cubit.state.effective, 'Europe/Paris');
      await cubit.reload();
      expect(repository.personalReads, 2);
      expect(repository.workspaceReads, 2);
    },
  );

  test('shared repository coalesces personal reads '
      'but isolates actors and workspaces', () async {
    final pending = Completer<String>();
    repository.personal = () => pending.future;
    final second = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async => 'UTC',
      clock: () => now,
    );
    final firstLoad = cubit.load(userId: 'actor', workspaceId: 'a');
    final secondLoad = second.load(userId: 'actor', workspaceId: 'b');
    expect(repository.personalReads, 1);
    expect(repository.workspaceReads, 2);
    repository.personal = () async => 'Europe/London';
    await second.load(userId: 'another-actor', workspaceId: 'b');
    expect(repository.personalReads, 2);
    expect(repository.workspaceReads, 3);
    expect(second.state.personal, 'Europe/London');
    pending.complete('Europe/Paris');
    await Future.wait([firstLoad, secondLoad]);
    expect(cubit.state.personal, 'Europe/Paris');
    expect(second.state.personal, 'Europe/London');
    await second.close();
  });

  test(
    'stale account failure cannot set the current account cooldown or data',
    () async {
      final old = Completer<String>();
      repository.personal = () => old.future;
      final first = cubit.load(userId: 'old', workspaceId: 'a');
      repository.personal = () async => 'Europe/Paris';
      await cubit.load(userId: 'new', workspaceId: 'b');
      old.completeError(
        const ApiException(message: 'Old limit', statusCode: 429),
      );
      await first;
      expect(cubit.state.personal, 'Europe/Paris');
      expect(cubit.state.retryAt, isNull);
      expect(cubit.state.failed, isFalse);
      await cubit.reload();
      expect(cubit.state.resolved, isTrue);
    },
  );

  for (final retryAfter in [null, 0, -1]) {
    test('429 with Retry-After $retryAfter wins over a parallel failure '
        'and cools down', () async {
      repository
        ..personal = (() async => throw Exception('Other read failed'))
        ..workspace = ((_) async => throw ApiException(
          message: 'Limited',
          statusCode: 429,
          retryAfter: retryAfter,
        ));
      await cubit.load(userId: 'actor', workspaceId: 'a');
      expect(cubit.state.retryAt, now.add(const Duration(seconds: 30)));
      expect(cubit.state.errorMessage, contains('429: Limited'));
      await cubit.reload();
      await cubit.load(userId: 'actor', workspaceId: 'b');
      expect(repository.personalReads, 1);
      expect(repository.workspaceReads, 1);
      // A separate caller using the same repository also observes cooldown.
      final second = TimezoneSettingsCubit(
        repository: repository,
        deviceLoader: () async => 'UTC',
        clock: () => now,
      );
      await second.load(userId: 'actor', workspaceId: 'a');
      expect(second.state.retryAt, now.add(const Duration(seconds: 30)));
      expect(repository.personalReads, 1);
      repository
        ..personal = (() async => 'UTC')
        ..workspace = ((_) async => 'auto');
      now = now.add(const Duration(seconds: 30));
      await cubit.reload();
      expect(cubit.state.resolved, isTrue);
      expect(cubit.state.retryAt, isNull);
      await second.close();
    });
  }

  test('a missing-header save limit retains the draft '
      'and allows retry after cooldown', () async {
    await cubit.load(userId: 'actor', workspaceId: 'a');
    repository.save = (_) async =>
        throw const ApiException(message: 'Limited', statusCode: 429);
    await cubit.save('Europe/Paris');
    expect(cubit.state.personal, 'UTC');
    expect(cubit.state.failedSaveZone, 'Europe/Paris');
    expect(cubit.state.retryAt, now.add(const Duration(seconds: 30)));
    await cubit.save('Europe/Paris');
    expect(repository.writes, 1);
    now = now.add(const Duration(seconds: 30));
    repository.save = (zone) async => zone;
    await cubit.reload();
    expect(cubit.state.failedSaveZone, 'Europe/Paris');
    expect(cubit.state.failed, isTrue);
    expect(repository.writes, 1);
    await cubit.save('Europe/Paris');
    expect(repository.writes, 2);
    expect(cubit.state.personal, 'Europe/Paris');
    expect(cubit.state.failedSaveZone, isNull);
  });

  test('same-scope resume does not invalidate a pending save', () async {
    await cubit.load(userId: 'actor', workspaceId: 'a');
    final saved = Completer<String>();
    repository.save = (_) => saved.future;
    final write = cubit.save('Europe/Paris');
    await cubit.reload();
    expect(cubit.state.saving, isTrue);
    expect(repository.personalReads, 1);
    saved.complete('Europe/Paris');
    await write;
    expect(cubit.state.personal, 'Europe/Paris');
    expect(cubit.state.saving, isFalse);
  });

  test(
    'a new account cannot receive an old save completion or failed draft',
    () async {
      await cubit.load(userId: 'old', workspaceId: 'a');
      final saved = Completer<String>();
      repository.save = (_) => saved.future;
      final write = cubit.save('Europe/Paris');
      repository.personal = () async => 'Europe/London';
      await cubit.load(userId: 'new', workspaceId: 'b');
      saved.completeError(
        const ApiException(message: 'Old limit', statusCode: 429),
      );
      await write;
      expect(cubit.state.personal, 'Europe/London');
      expect(cubit.state.failedSaveZone, isNull);
      expect(cubit.state.retryAt, isNull);
      expect(cubit.state.saving, isFalse);
    },
  );
}
