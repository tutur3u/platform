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
  bool failSave = false;
  bool failLoad = false;
  int writes = 0;
  @override
  Future<String> loadPersonal() async {
    if (failLoad) throw Exception('load failed');
    return personal;
  }

  @override
  Future<String> loadWorkspace(String id) => id == 'a' && delayed != null
      ? delayed!.future
      : Future.value(workspaces[id] ?? 'auto');
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
