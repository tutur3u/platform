import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'assistant_local_chat_harness.dart';

void main() {
  test(
    'local reselection disposes held prepare before activating latest choice',
    () async {
      SharedPreferences.setMockInitialValues({});
      final scope = Object();
      final oldModel = LocalTestModel();
      final newModel = LocalTestModel();
      final admitted = Completer<void>();
      final held = Completer<LocalInferenceModel>();
      final paths = <String>[];
      final preferences = AssistantLocalPreferences(
        currentUserId: () => 'user',
      );
      final cubit = AssistantLocalChatCubit(
        currentScope: () => scope,
        store: LocalTestStore(),
        history: LocalTestHistory(),
        preferences: preferences,
        supported: () async => true,
        runtime: AssistantLocalRuntime(
          currentScope: () => scope,
          load: (path) {
            paths.add(path);
            if (paths.length == 1) {
              admitted.complete();
              return held.future;
            }
            expect(oldModel.closed, isTrue);
            return Future.value(newModel);
          },
        ),
      );
      await cubit.syncWorkspace('user', 'workspace');
      final first = cubit.select(assistantLocalModels.first.id);
      await admitted.future;
      final latest = cubit.select('qwen3-600m');
      expect(cubit.state.blocked, isTrue);
      expect(paths, hasLength(1));
      held.complete(oldModel);
      await first;
      await latest;
      expect(paths, ['/verified/gemma3-270m-q8', '/verified/qwen3-600m']);
      expect(cubit.state.local, isTrue);
      expect(cubit.state.ready, isTrue);
      expect(cubit.state.selectedModelId, 'qwen3-600m');
      expect(
        await preferences.load('workspace', isScopeCurrent: () => true),
        'qwen3-600m',
      );
      expect(newModel.closed, isFalse);
      await cubit.close();
      expect(newModel.closed, isTrue);
    },
  );
}
