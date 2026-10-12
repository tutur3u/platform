import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_state.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';
import 'package:mobile/features/assistant/local/assistant_model_preparation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'assistant_local_chat_harness.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final entry in [
    (
      ModelPreparationFailure.invalidFormat,
      LocalChatFailure.invalidModelFormat,
    ),
    (
      ModelPreparationFailure.incompatibleVersion,
      LocalChatFailure.incompatibleModelVersion,
    ),
    (
      ModelPreparationFailure.runtimeUnavailable,
      LocalChatFailure.runtimeUnavailable,
    ),
    (ModelPreparationFailure.nativeLoad, LocalChatFailure.engine),
    (ModelPreparationFailure.storage, LocalChatFailure.storage),
  ]) {
    test(
      '${entry.$1.name} preserves local selection and offers typed recovery',
      () async {
        final scope = Object();
        final history = LocalTestHistory();
        final model = LocalTestModel();
        var failed = true;
        final cubit = AssistantLocalChatCubit(
          currentScope: () => scope,
          store: LocalTestStore(),
          history: history,
          supported: () async => true,
          runtime: AssistantLocalRuntime(
            currentScope: () => scope,
            load: (_) async {
              if (failed) throw ModelPreparationException(entry.$1);
              return model;
            },
          ),
        );
        await cubit.syncWorkspace('actor', 'workspace');
        final id = assistantLocalModels.first.id;
        await cubit.select(id);
        expect(cubit.state.failure, entry.$2);
        expect(cubit.state.selectedModelId, id);
        expect(cubit.state.ready, isFalse);
        final revision = cubit.state.preparationRevision;
        expect(revision, greaterThan(0));
        await cubit.send('Private prompt');
        expect(history.saves, 0);
        expect(model.sessions, isEmpty);
        failed = false;
        await cubit.select(id);
        expect(cubit.state.preparationRevision, greaterThan(revision));
        expect(cubit.state.failure, isNull);
        expect(cubit.state.ready, isTrue);
        await cubit.close();
      },
    );
  }

  test('late preparation error cannot replace a newer selection', () async {
    final scope = Object();
    final entered = Completer<void>();
    final pending = Completer<LocalInferenceModel>();
    final model = LocalTestModel();
    var calls = 0;
    final cubit = AssistantLocalChatCubit(
      currentScope: () => scope,
      store: LocalTestStore(),
      history: LocalTestHistory(),
      supported: () async => true,
      runtime: AssistantLocalRuntime(
        currentScope: () => scope,
        load: (_) {
          if (calls++ == 0) {
            entered.complete();
            return pending.future;
          }
          return Future.value(model);
        },
      ),
    );
    await cubit.syncWorkspace('actor', 'workspace');
    final first = cubit.select(assistantLocalModels.first.id);
    await entered.future;
    final second = cubit.select(assistantLocalModels[1].id);
    pending.completeError(
      const ModelPreparationException(
        ModelPreparationFailure.runtimeUnavailable,
      ),
    );
    await first;
    await second;
    expect(cubit.state.selectedModelId, assistantLocalModels[1].id);
    expect(cubit.state.failure, isNull);
    expect(cubit.state.ready, isTrue);
    expect(cubit.state.preparationRevision, 3);
    await cubit.close();
  });
}
