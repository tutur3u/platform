import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

class _Repository extends TimezoneSettingsRepository {
  String personal = 'auto';
  final workspaces = <String, String>{
    'a': 'Asia/Ho_Chi_Minh',
    'b': 'Europe/London',
  };
  Completer<String>? delayed;
  Completer<String>? delayedPersonal;
  bool failSave = false;
  bool failLoad = false;
  bool failWorkspace = false;
  int writes = 0;
  @override
  Future<String> loadPersonal() async {
    if (delayedPersonal != null) return await delayedPersonal!.future;
    if (failLoad) throw Exception('load failed');
    return personal;
  }

  @override
  Future<String> loadWorkspace(String id) async {
    if (failWorkspace) throw Exception('workspace load failed');
    if (id == 'a' && delayed != null) return await delayed!.future;
    return workspaces[id] ?? 'auto';
  }

  @override
  Future<String> savePersonal(String zone) async {
    if (failSave) throw Exception('failed');
    writes++;
    return personal = zone;
  }

  @override
  Future<String> saveWorkspace(String id, String zone) async {
    writes++;
    return workspaces[id] = zone;
  }
}

void main() {
  late _Repository repository;
  late TimezoneSettingsCubit cubit;
  setUp(() {
    repository = _Repository();
    cubit = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async => 'America/New_York',
    );
  });
  tearDown(() async {
    await cubit.close();
    repository.dispose();
  });
  test('Automatic persists even when native device lookup fails', () async {
    await cubit.close();
    repository.personal = 'UTC';
    cubit = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async =>
          throw Exception('Synthetic native lookup failure'),
    );
    await cubit.load(userId: 'user', workspaceId: null);
    await cubit.save('auto');
    expect(repository.personal, 'auto');
    expect(repository.writes, 1);
    expect(cubit.state.personal, 'auto');
    expect(cubit.state.personalLoaded, true);
    expect(cubit.state.resolved, false);
    await cubit.reload();
    expect(cubit.state.personal, 'auto');
  });

  test(
    'load and save retain error details, then clear them after recovery',
    () async {
      repository.failLoad = true;
      await cubit.load(userId: 'user', workspaceId: null);
      expect(cubit.state.errorMessage, contains('load failed'));
      repository.failLoad = false;
      await cubit.reload();
      expect(cubit.state.errorMessage, isNull);
      repository.failSave = true;
      await cubit.save('UTC');
      expect(cubit.state.errorMessage, contains('failed'));
      expect(cubit.state.failedSaveZone, 'UTC');
      repository.failSave = false;
      await cubit.save('UTC');
      expect(cubit.state.errorMessage, isNull);
    },
  );
  for (final scope in ['resume', 'workspace', 'account']) {
    test(
      'overlapping $scope load preserves only eligible personal snapshot',
      () async {
        repository
          ..personal = 'Europe/Paris'
          ..failWorkspace = true;
        await cubit.load(userId: 'user', workspaceId: 'a');
        expect(cubit.state.personalLoaded, isTrue);
        final personal = Completer<String>();
        final workspace = Completer<String>();
        repository
          ..failWorkspace = false
          ..delayedPersonal = personal
          ..delayed = workspace;
        final pending = cubit.reload();
        expect(cubit.state.loading, isTrue);
        expect(cubit.state.personal, 'Europe/Paris');
        expect(cubit.state.personalLoaded, isTrue);
        expect(cubit.state.resolved, isFalse);
        repository
          ..delayedPersonal = null
          ..delayed = null
          ..failLoad = true;
        await cubit.load(
          userId: scope == 'account' ? 'another-user' : 'user',
          workspaceId: scope == 'workspace' ? 'b' : 'a',
        );
        final expectedPersonal = scope == 'account' ? 'auto' : 'Europe/Paris';
        final expectedWorkspace =
            repository.workspaces[scope == 'workspace' ? 'b' : 'a'];
        expect(cubit.state.personal, expectedPersonal);
        expect(cubit.state.personalLoaded, scope != 'account');
        expect(cubit.state.workspace, expectedWorkspace);
        expect(cubit.state.resolved, isFalse);
        await cubit.save('Europe/London');
        expect(repository.writes, scope == 'account' ? 0 : 1);
        personal.complete('America/Chicago');
        workspace.complete('Australia/Sydney');
        await pending;
        expect(
          cubit.state.personal,
          scope == 'account' ? expectedPersonal : 'Europe/London',
        );
        expect(cubit.state.workspace, expectedWorkspace);
        expect(cubit.state.resolved, scope != 'account');
      },
    );
  }
  for (final changeWorkspace in [false, true]) {
    test(
      'overlapping partial workspace stays scoped: $changeWorkspace',
      () async {
        repository.failLoad = true;
        await cubit.load(userId: 'user', workspaceId: 'a');
        final personal = Completer<String>();
        final workspace = Completer<String>();
        repository
          ..delayedPersonal = personal
          ..delayed = workspace;
        final pending = cubit.reload();
        expect(cubit.state.workspace, 'Asia/Ho_Chi_Minh');
        expect(cubit.state.workspaceLoaded, isTrue);
        expect(cubit.state.resolved, isFalse);
        repository
          ..delayedPersonal = null
          ..delayed = null
          ..failWorkspace = true;
        await cubit.load(
          userId: 'user',
          workspaceId: changeWorkspace ? 'b' : 'a',
        );
        final expected = changeWorkspace ? 'auto' : 'Asia/Ho_Chi_Minh';
        expect(cubit.state.workspace, expected);
        expect(cubit.state.workspaceLoaded, !changeWorkspace);
        personal.complete('Europe/Paris');
        workspace.complete('Australia/Sydney');
        await pending;
        expect(cubit.state.workspace, expected);
        expect(cubit.state.workspaceLoaded, !changeWorkspace);
        expect(cubit.state.resolved, isFalse);
      },
    );
  }
  test(
    'persists personal preference, reloads, and resolves automatic fallback',
    () async {
      await cubit.load(userId: 'user', workspaceId: 'a');
      expect(cubit.state.effective, 'Asia/Ho_Chi_Minh');
      await cubit.save('UTC');
      await cubit.load(userId: 'user', workspaceId: 'a');
      expect(cubit.state.effective, 'UTC');
      await cubit.save('auto');
      expect(cubit.state.effective, 'Asia/Ho_Chi_Minh');
      await cubit.load(userId: 'user', workspaceId: null);
      expect(cubit.state.effective, 'America/New_York');
    },
  );
  test(
    'rejects stale workspace load and clears previous scope immediately',
    () async {
      repository.delayed = Completer<String>();
      final first = cubit.load(userId: 'user', workspaceId: 'a');
      await cubit.load(userId: 'user', workspaceId: 'b');
      expect(cubit.state.workspace, 'Europe/London');
      repository.delayed!.complete('Asia/Ho_Chi_Minh');
      await first;
      expect(cubit.state.workspace, 'Europe/London');
      await cubit.load(userId: null, workspaceId: null);
      expect(cubit.state.workspace, 'auto');
      expect(cubit.state.personal, 'auto');
    },
  );
  test('denies workspace writes without management permission', () async {
    await cubit.load(userId: 'user', workspaceId: 'a');
    await cubit.save('UTC', workspace: true);
    expect(repository.writes, 0);
    await cubit.save('UTC', workspace: true, canManageWorkspace: true);
    expect(repository.writes, 1);
    await cubit.load(userId: 'user', workspaceId: 'a');
    expect(cubit.state.workspace, 'UTC');
  });
  test('retains saved preference on failure', () async {
    repository.personal = 'Europe/London';
    await cubit.load(userId: 'user', workspaceId: 'a');
    repository.failSave = true;
    await cubit.save('UTC');
    expect(cubit.state.personal, 'Europe/London');
    expect(cubit.state.failed, isTrue);
  });
  test('resolved save failure allows a direct save retry', () async {
    await cubit.load(userId: 'user', workspaceId: 'a');
    repository.failSave = true;
    await cubit.save('UTC');
    repository.failSave = false;
    await cubit.save('Europe/Paris');
    expect(cubit.state.personal, 'Europe/Paris');
    expect(cubit.state.failed, isFalse);
    expect(repository.writes, 1);
  });
  test(
    'same-scope load failure keeps a resolved preference editable',
    () async {
      await cubit.load(userId: 'user', workspaceId: 'a');
      repository.failLoad = true;
      await cubit.load(userId: 'user', workspaceId: 'a');
      expect(cubit.state.resolved, isTrue);
      expect(cubit.state.failed, isTrue);
      await cubit.save('Europe/Paris');
      expect(cubit.state.personal, 'Europe/Paris');
      expect(repository.writes, 1);
    },
  );
  test('unresolved failed scope stays blocked until loaded', () async {
    repository.failLoad = true;
    await cubit.load(userId: 'user', workspaceId: 'a');
    await cubit.save('Europe/Paris');
    expect(repository.writes, 0);
    expect(cubit.state.resolved, isFalse);
  });
}
