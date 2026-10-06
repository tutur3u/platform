import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import '../assistant_personal_settings_harness.dart';

void main() {
  late SettingsRepository repository;
  late AssistantPersonalSettingsCubit cubit;
  late String actor;
  late bool scope;
  setUp(() {
    repository = SettingsRepository();
    actor = 'actor-a';
    scope = true;
    cubit = AssistantPersonalSettingsCubit(
      workspaceId: 'workspace-a',
      repository: repository,
      isScopeCurrent: () => scope,
      currentUserId: () => actor,
    );
  });
  tearDown(() => cubit.close());
  test(
    'loads current saved name and disabled consent without enabling collection',
    () async {
      await cubit.load();
      expect(cubit.state.snapshot!.soul.name, 'Mira');
      expect(cubit.state.snapshot!.memoryEnabled, isFalse);
      expect(repository.writes, 0);
    },
  );
  test('consent update preserves every existing product override', () async {
    await cubit.load();
    await cubit.setMemoryEnabled(enabled: true);
    expect(repository.productsSent, snapshot.products);
    expect(cubit.state.snapshot!.products, snapshot.products);
  });
  test(
    'keeps saved name while its replacement is pending, then applies receipt',
    () async {
      await cubit.load();
      final held = Completer<AssistantSoul>();
      repository.write = (_) => held.future;
      final saved = cubit.saveSoul(const AssistantSoul(name: 'Nova'));
      expect(cubit.state.snapshot!.soul.name, 'Mira');
      expect(cubit.state.busy, isTrue);
      held.complete(const AssistantSoul(name: 'Nova'));
      expect(await saved, isTrue);
      expect(cubit.state.snapshot!.soul.name, 'Nova');
    },
  );
  test(
    'write failure preserves previous name and enables truthful retry',
    () async {
      await cubit.load();
      repository.write = (_) => Future.error(StateError('synthetic'));
      expect(await cubit.saveSoul(const AssistantSoul(name: 'Nova')), isFalse);
      expect(cubit.state.snapshot!.soul.name, 'Mira');
      expect(cubit.state.failed, isTrue);
    },
  );
  test('late previous read never replaces the newest response', () async {
    final old = Completer<AssistantPersonalSettingsSnapshot>();
    repository.read = () => old.future;
    final first = cubit.load();
    repository.read = () async => const AssistantPersonalSettingsSnapshot(
      soul: AssistantSoul(name: 'Nova'),
      memoryEnabled: true,
      memories: [],
    );
    await cubit.load();
    old.complete(snapshot);
    await first;
    expect(cubit.state.snapshot!.soul.name, 'Nova');
  });
  test(
    'workspace invalidation denies delayed receipt and all later writes',
    () async {
      await cubit.load();
      final held = Completer<AssistantSoul>();
      repository.write = (_) => held.future;
      final write = cubit.saveSoul(const AssistantSoul(name: 'Nova'));
      scope = false;
      held.complete(const AssistantSoul(name: 'Nova'));
      expect(await write, isFalse);
      scope = true;
      expect(await cubit.saveSoul(const AssistantSoul(name: 'Other')), isFalse);
      expect(repository.writes, 1);
      expect(cubit.state.snapshot!.soul.name, 'Mira');
    },
  );
  test('actor ABA cannot revive an invalidated editor', () async {
    await cubit.load();
    actor = 'actor-b';
    expect(cubit.admitted, isFalse);
    actor = 'actor-a';
    expect(await cubit.saveSoul(const AssistantSoul(name: 'Nova')), isFalse);
    expect(repository.writes, 0);
  });
  test('close prevents delayed load from emitting private data', () async {
    final held = Completer<AssistantPersonalSettingsSnapshot>();
    repository.read = () => held.future;
    final loaded = cubit.load();
    await cubit.close();
    held.complete(snapshot);
    await loaded;
    expect(cubit.state.snapshot, isNull);
  });
  test(
    'failed deletion keeps original visible; confirmed retry removes it',
    () async {
      await cubit.load();
      repository.remove = () => Future.error(StateError('not confirmed'));
      expect(await cubit.deleteMemory('memory-a'), isFalse);
      expect(cubit.state.snapshot!.memories, snapshot.memories);
      repository.remove = () async {};
      expect(await cubit.deleteMemory('memory-a'), isTrue);
      expect(cubit.state.snapshot!.memories, isEmpty);
    },
  );
  test(
    'export failure is visible and a delayed export cannot escape scope',
    () async {
      await cubit.load();
      repository.export = () => Future.error(StateError('synthetic'));
      expect(await cubit.exportMemories(), isNull);
      expect(cubit.state.failed, isTrue);
      final held = Completer<Map<String, dynamic>>();
      repository.export = () => held.future;
      final exported = cubit.exportMemories();
      scope = false;
      held.complete({
        'items': ['private synthetic'],
      });
      expect(await exported, isNull);
    },
  );
}
