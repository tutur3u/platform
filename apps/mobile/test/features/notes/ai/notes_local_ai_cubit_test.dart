import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';
import 'package:mobile/features/notes/ai/notes_local_ai_cubit.dart';

class AiSession implements LocalInferenceSession {
  final tokens = StreamController<String>();
  final started = Completer<void>();
  final prompts = <String>[];
  bool closed = false;
  @override
  Future<void> add(LocalChatTurn turn) async => prompts.add(turn.text);
  @override
  Stream<String> generate() {
    started.complete();
    return tokens.stream;
  }

  @override
  Future<void> stop() async {
    if (!tokens.isClosed) unawaited(tokens.close());
  }

  @override
  Future<void> close() async => closed = true;
}

class AiModel implements LocalInferenceModel {
  AiModel(this.created);
  final AiSession created;
  bool closed = false;
  @override
  Future<LocalInferenceSession> session() async => created;
  @override
  Future<void> close() async => closed = true;
}

const NotesAiSnapshot aiNote = (
  actor: 'actor',
  workspace: 'workspace',
  note: 'note',
  selection: 1,
  revision: 2,
  document: 'document',
  title: 'Title',
);

void main() {
  test(
    'availability excludes missing or mismatched files without loading',
    () async {
      const scope = (epoch: 1, note: aiNote);
      var loads = 0;
      final runtime = AssistantLocalRuntime(
        load: (_) async {
          loads++;
          throw StateError('Must not load for discovery');
        },
        currentScope: () => scope,
      );
      final cubit = NotesLocalAiCubit(
        currentScope: () => scope,
        runtime: runtime,
        supported: () async => true,
        verifiedPath: (model) async =>
            model.id == 'qwen3-600m' ? '/verified' : null,
      );
      expect((await cubit.installedModels()).map((model) => model.id), [
        'qwen3-600m',
      ]);
      expect(loads, 0);
      await cubit.close();
    },
  );

  test(
    'verified local generation publishes a review only and closes weights',
    () async {
      const scope = (epoch: 1, note: aiNote);
      final session = AiSession();
      final model = AiModel(session);
      final runtime = AssistantLocalRuntime(
        load: (_) async => model,
        currentScope: () => scope,
      );
      final cubit = NotesLocalAiCubit(
        currentScope: () => scope,
        runtime: runtime,
        supported: () async => true,
        verifiedPath: (_) async => '/verified',
      );
      final job = cubit.generate('qwen3-600m', 'Some note text');
      await session.started.future;
      session.tokens.add('Summary');
      await session.tokens.close();
      await job;
      expect(cubit.state.canAppend, isTrue);
      expect(cubit.state.output, 'Summary');
      expect(session.prompts.single, contains('Some note text'));
      expect(session.closed, isTrue);
      expect(model.closed, isTrue);
      await cubit.close();
    },
  );

  for (final label in ['edit', 'workspace', 'auth ABA', 'navigation', 'lock']) {
    test('held load after $label cannot publish or start a prompt', () async {
      NotesAiScope? scope = (epoch: 1, note: aiNote);
      final loaded = Completer<LocalInferenceModel>();
      final session = AiSession();
      final model = AiModel(session);
      final runtime = AssistantLocalRuntime(
        load: (_) => loaded.future,
        currentScope: () => scope,
      );
      final cubit = NotesLocalAiCubit(
        currentScope: () => scope,
        runtime: runtime,
        supported: () async => true,
        verifiedPath: (_) async => '/verified',
      );
      final job = cubit.generate('qwen3-600m', 'Private text');
      await Future<void>.delayed(Duration.zero);
      scope = switch (label) {
        'lock' || 'navigation' => null,
        'auth ABA' => (epoch: 2, note: aiNote),
        'edit' => (
          epoch: 1,
          note: (
            actor: 'actor',
            workspace: 'workspace',
            note: 'note',
            selection: 1,
            revision: 3,
            document: 'edited',
            title: 'Title',
          ),
        ),
        _ => (
          epoch: 1,
          note: (
            actor: 'actor',
            workspace: 'other',
            note: 'note',
            selection: 1,
            revision: 2,
            document: 'document',
            title: 'Title',
          ),
        ),
      };
      loaded.complete(model);
      await job;
      expect(cubit.state.canAppend, isFalse);
      expect(session.prompts, isEmpty);
      expect(model.closed, isTrue);
      await cubit.close();
    });
  }

  test(
    'invalidation clears streaming text and drains native session',
    () async {
      NotesAiScope? scope = (epoch: 1, note: aiNote);
      final session = AiSession();
      final runtime = AssistantLocalRuntime(
        load: (_) async => AiModel(session),
        currentScope: () => scope,
      );
      final cubit = NotesLocalAiCubit(
        currentScope: () => scope,
        runtime: runtime,
        supported: () async => true,
        verifiedPath: (_) async => '/verified',
      );
      final job = cubit.generate('qwen3-600m', 'Private text');
      await session.started.future;
      session.tokens.add('Partial');
      await Future<void>.delayed(Duration.zero);
      scope = null;
      await cubit.invalidate();
      await job;
      expect(cubit.state.output, isEmpty);
      expect(cubit.state.canAppend, isFalse);
      expect(session.closed, isTrue);
      await cubit.close();
    },
  );

  for (final failure in ['unsupported', 'missing', 'hash mismatch', 'engine']) {
    test('$failure has no generation fallback', () async {
      var loads = 0;
      const scope = (epoch: 1, note: aiNote);
      final runtime = AssistantLocalRuntime(
        load: (_) async {
          loads++;
          throw StateError('engine');
        },
        currentScope: () => scope,
      );
      final cubit = NotesLocalAiCubit(
        currentScope: () => scope,
        runtime: runtime,
        supported: () async => failure != 'unsupported',
        verifiedPath: (_) async =>
            failure == 'missing' || failure == 'hash mismatch'
            ? null
            : '/verified',
      );
      await cubit.generate('qwen3-600m', 'text');
      expect(cubit.state.canAppend, isFalse);
      expect(cubit.state.failure, isNotNull);
      expect(loads, failure == 'engine' ? 1 : 0);
      await cubit.close();
    });
  }

  test('oversized input and unknown catalog never load native code', () async {
    const scope = (epoch: 1, note: aiNote);
    var checked = 0;
    final cubit = NotesLocalAiCubit(
      currentScope: () => scope,
      supported: () async {
        checked++;
        return true;
      },
    );
    await cubit.generate('qwen3-600m', 'x' * 5001);
    expect(cubit.state.failure, NotesAiFailure.input);
    await cubit.generate('untrusted-path', 'text');
    expect(cubit.state.failure, NotesAiFailure.missingModel);
    expect(checked, 0);
    await cubit.close();
  });
}
