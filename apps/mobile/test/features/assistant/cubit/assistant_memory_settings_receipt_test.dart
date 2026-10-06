import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_personal_settings_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_memory_edit.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';

import '../assistant_personal_settings_harness.dart';

const edited = EditableAssistantMemory(
  id: 'memory-a',
  content: 'Confirmed changed text',
  revision: 'v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
);
void main() {
  late SettingsRepository repository;
  late AssistantPersonalSettingsCubit cubit;
  setUp(() {
    repository = SettingsRepository();
    cubit = AssistantPersonalSettingsCubit(
      workspaceId: 'workspace-a',
      repository: repository,
      isScopeCurrent: () => true,
      currentUserId: () => repository.ownerId,
    );
  });
  tearDown(() => cubit.close());
  test(
    'late stale list refresh cannot replace confirmed edit receipt',
    () async {
      await cubit.load();
      final held = Completer<AssistantPersonalSettingsSnapshot>();
      repository.read = () => held.future;
      final loading = cubit.load();
      cubit.applyConfirmedMemoryEdit(edited);
      held.complete(snapshot);
      await loading;
      expect(cubit.state.snapshot!.memories.single.text, edited.content);
      expect(cubit.state.loading, false);
    },
  );
  test('held consent receipt preserves concurrently '
      'confirmed item and product overrides', () async {
    await cubit.load();
    final held = Completer<bool>();
    repository.consent = ({required enabled}) => held.future;
    final write = cubit.setMemoryEnabled(enabled: true);
    cubit.applyConfirmedMemoryEdit(edited);
    held.complete(true);
    await write;
    expect(cubit.state.snapshot!.memories.single.text, edited.content);
    expect(cubit.state.snapshot!.products, snapshot.products);
    expect(cubit.state.snapshot!.memoryEnabled, true);
    expect(cubit.state.snapshot!.soul, snapshot.soul);
  });
}
