import 'dart:ffi';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_capability.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_models_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'assistant_local_chat_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('hardware admission uses installed MiB and fails closed for '
      'unsupported ABIs', () {
    expect(
      permitsAssistantLocalInference(abi: Abi.iosArm64, memoryMiB: 4095),
      isFalse,
    );
    expect(
      permitsAssistantLocalInference(abi: Abi.iosArm64, memoryMiB: 4096),
      isTrue,
    );
    expect(
      permitsAssistantLocalInference(abi: Abi.macosX64, memoryMiB: 16384),
      isFalse,
    );
    expect(
      permitsAssistantLocalInference(
        abi: Abi.androidArm64,
        memoryMiB: 8192,
        androidSdk: 27,
      ),
      isFalse,
    );
    expect(
      permitsAssistantLocalInference(
        abi: Abi.androidArm64,
        memoryMiB: 4096,
        androidSdk: 28,
      ),
      isTrue,
    );
    expect(
      linuxPhysicalMemoryMiB('MemTotal:       8388608 kB\nMemFree: 1 kB\n'),
      8192,
    );
    expect(linuxPhysicalMemoryMiB('unknown'), 0);
  });

  test('selection is actor/workspace scoped and epoch-fenced', () async {
    var actor = 'alice';
    final preferences = AssistantLocalPreferences(currentUserId: () => actor);
    final model = assistantLocalModels.first.id;
    await preferences.save('one', model, isScopeCurrent: () => true);
    expect(await preferences.load('two', isScopeCurrent: () => true), isNull);
    actor = 'bob';
    expect(await preferences.load('one', isScopeCurrent: () => true), isNull);
    actor = 'alice';
    await preferences.save('one', null, isScopeCurrent: () => false);
    expect(await preferences.load('one', isScopeCurrent: () => true), model);
  });

  test('removing selected weights preserves explicit local choice '
      'on unsupported hardware', () async {
    final store = LocalTestStore();
    final preferences = AssistantLocalPreferences(currentUserId: () => 'user');
    final model = assistantLocalModels.first;
    await preferences.save('workspace', model.id, isScopeCurrent: () => true);
    final cubit = AssistantLocalModelsCubit(
      workspaceId: 'workspace',
      isScopeCurrent: () => true,
      store: store,
      preferences: preferences,
      supported: () async => false,
    );
    await cubit.load();
    expect(cubit.state.installed, contains(model.id));
    await cubit.remove(model);
    expect(cubit.state.installed, isNot(contains(model.id)));
    expect(cubit.state.selected, model.id);
    expect(
      await preferences.load('workspace', isScopeCurrent: () => true),
      model.id,
    );
    await cubit.select(null);
    expect(cubit.state.selected, isNull);
    await cubit.close();
  });
}
