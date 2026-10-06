import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_settings_refresh.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantRepository {}

class _Preferences extends Mock implements AssistantPreferences {}

void main() {
  test(
    'refresh reads the server rather than a fresh stale soul cache',
    () async {
      final repository = _Repository();
      when(repository.fetchSoul).thenAnswer((_) async => const AssistantSoul());
      when(
        () => repository.fetchSoul(forceRefresh: true),
      ).thenAnswer((_) async => const AssistantSoul(name: 'Nova'));
      final cubit = AssistantShellCubit(
        repository: repository,
        preferences: _Preferences(),
      );
      await cubit.refreshSoul();
      expect(cubit.state.soul.name, 'Nova');
      await cubit.close();
    },
  );
  test('an older held soul refresh cannot overwrite a newer receipt', () async {
    final repository = _Repository();
    final held = Completer<AssistantSoul>();
    var reads = 0;
    when(
      () => repository.fetchSoul(forceRefresh: any(named: 'forceRefresh')),
    ).thenAnswer(
      (_) => ++reads == 1
          ? held.future
          : Future.value(const AssistantSoul(name: 'Nova')),
    );
    final cubit = AssistantShellCubit(
      repository: repository,
      preferences: _Preferences(),
    );
    final first = cubit.refreshSoul();
    await cubit.refreshSoul();
    held.complete(const AssistantSoul());
    await first;
    expect(cubit.state.soul.name, 'Nova');
    await cubit.close();
  });
  test('actor epoch rejects a held reply even after account ABA', () async {
    final repository = _Repository();
    final held = Completer<AssistantSoul>();
    when(
      () => repository.fetchSoul(forceRefresh: true),
    ).thenAnswer((_) => held.future);
    var actorEpoch = 0;
    final cubit = AssistantShellCubit(
      repository: repository,
      preferences: _Preferences(),
      currentScopeToken: () => actorEpoch,
    );
    final refresh = cubit.refreshSoul();
    // A -> B -> A changes the production actor epoch twice.
    actorEpoch += 2;
    held.complete(const AssistantSoul(name: 'Former actor'));
    await refresh;
    expect(cubit.state.soul.name, 'Mira');
    await cubit.close();
  });
  test('closed shell drops a held soul receipt', () async {
    final repository = _Repository();
    final held = Completer<AssistantSoul>();
    when(
      () => repository.fetchSoul(forceRefresh: true),
    ).thenAnswer((_) => held.future);
    final cubit = AssistantShellCubit(
      repository: repository,
      preferences: _Preferences(),
    );
    final refresh = cubit.refreshSoul();
    await cubit.close();
    held.complete(const AssistantSoul(name: 'Late reply'));
    await refresh;
    expect(cubit.state.soul.name, 'Mira');
  });
  test('workspace ABA invalidates an older held soul refresh', () async {
    final repository = _Repository();
    final preferences = _Preferences();
    final held = Completer<AssistantSoul>();
    when(
      () => repository.fetchSoul(forceRefresh: true),
    ).thenAnswer((_) => held.future);
    when(
      () => preferences.loadModel(any()),
    ).thenThrow(Exception('Synthetic read refusal'));
    final cubit = AssistantShellCubit(
      repository: repository,
      preferences: preferences,
    );
    final refresh = cubit.refreshSoul();
    await cubit.loadWorkspace(const Workspace(id: 'workspace-b'));
    await cubit.loadWorkspace(const Workspace(id: 'workspace-a'));
    held.complete(const AssistantSoul(name: 'Old workspace'));
    await refresh;
    expect(cubit.state.soul.name, 'Mira');
    await cubit.close();
  });
  test('failed refresh preserves the last confirmed name', () async {
    final repository = _Repository();
    var reads = 0;
    when(() => repository.fetchSoul(forceRefresh: true)).thenAnswer((_) async {
      if (++reads == 1) return const AssistantSoul(name: 'Nova');
      throw Exception('Synthetic read refusal');
    });
    final cubit = AssistantShellCubit(
      repository: repository,
      preferences: _Preferences(),
    );
    await cubit.refreshSoul();
    await expectLater(cubit.refreshSoul(), throwsException);
    expect(cubit.state.soul.name, 'Nova');
    await cubit.close();
  });
  for (final switchesActor in [false, true]) {
    test('settings held failure actor switch $switchesActor', () async {
      final repository = _Repository();
      final held = Completer<AssistantSoul>();
      when(
        () => repository.fetchSoul(forceRefresh: true),
      ).thenAnswer((_) => held.future);
      var epoch = 0;
      var notices = 0;
      var preferences = 0;
      var resumes = 0;
      final cubit = AssistantShellCubit(
        repository: repository,
        preferences: _Preferences(),
        currentScopeToken: () => epoch,
      );
      final returned = refreshAssistantSettings(
        refreshSoul: cubit.refreshSoul,
        isCurrent: () => epoch == 0,
        onRefreshFailure: () => notices++,
        reloadPreferences: () async {
          preferences++;
        },
        resume: () => resumes++,
      );
      if (switchesActor) epoch += 2;
      held.completeError(Exception('Synthetic private failure'));
      await returned;
      expect(cubit.state.soul.name, 'Mira');
      expect(notices, switchesActor ? 0 : 1);
      expect(preferences, switchesActor ? 0 : 1);
      expect(resumes, switchesActor ? 0 : 1);
      await cubit.close();
    });
  }
}
