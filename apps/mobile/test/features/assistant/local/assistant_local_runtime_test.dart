import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';

class TestSession implements LocalInferenceSession {
  final tokens = StreamController<String>();
  final added = <LocalChatTurn>[];
  final started = Completer<void>();
  int stopped = 0;
  bool closed = false;
  Error? stopError;
  @override
  Future<void> add(LocalChatTurn turn) async => added.add(turn);
  @override
  Stream<String> generate() {
    started.complete();
    return tokens.stream;
  }

  @override
  Future<void> stop() async {
    stopped++;
    if (!tokens.isClosed) unawaited(tokens.close());
    if (stopError != null) throw stopError!;
  }

  @override
  Future<void> close() async => closed = true;
}

class TestModel implements LocalInferenceModel {
  TestModel(this.created, {this.checkDrain = true});
  final TestSession created;
  final bool checkDrain;
  Error? closeError;
  bool closed = false;
  @override
  Future<LocalInferenceSession> session() async => created;
  @override
  Future<void> close() async {
    if (checkDrain) {
      expect(!created.started.isCompleted || created.closed, isTrue);
    }
    closed = true;
    if (closeError != null) throw closeError!;
  }
}

void main() {
  test(
    'late load after session ABA is closed and never marked ready',
    () async {
      var scope = Object();
      final loaded = Completer<LocalInferenceModel>();
      final runtime = AssistantLocalRuntime(
        load: (_) => loaded.future,
        currentScope: () => scope,
      );
      final operation = runtime.load('/verified/model');
      await Future<void>.delayed(Duration.zero);
      scope = Object();
      final model = TestModel(TestSession());
      loaded.complete(model);
      await expectLater(operation, throwsStateError);
      expect(runtime.ready, isFalse);
      expect(model.closed, isTrue);
    },
  );

  test(
    'scope change prevents any late generated tokens from publishing',
    () async {
      var scope = Object();
      final session = TestSession();
      final runtime = AssistantLocalRuntime(
        load: (_) async => TestModel(session),
        currentScope: () => scope,
      );
      await runtime.load('/verified/model');
      final result = runtime.generate(const [
        LocalChatTurn(text: 'Private prompt', isUser: true),
      ]).toList();
      await session.started.future;
      scope = Object();
      session.tokens.add('Must not publish');
      expect(await result, isEmpty);
      expect(session.closed, isTrue);
      expect(runtime.ready, isFalse);
      await runtime.close();
    },
  );

  test(
    'unload stops generation, drains session teardown, then closes weights',
    () async {
      final session = TestSession();
      final model = TestModel(session);
      final scope = Object();
      final stable = AssistantLocalRuntime(
        load: (_) async => model,
        currentScope: () => scope,
      );
      await stable.load('/verified/model');
      final result = stable.generate(const [
        LocalChatTurn(text: 'Hello', isUser: true),
      ]).toList();
      await session.started.future;
      await stable.unload();
      expect(await result, isEmpty);
      expect(session.closed, isTrue);
      expect(model.closed, isTrue);
      expect(stable.ready, isFalse);
      await stable.close();
    },
  );

  test('failed stop still closes model and retains the causal error', () async {
    final stopError = StateError('stop failure');
    final session = TestSession()..stopError = stopError;
    final model = TestModel(session, checkDrain: false)
      ..closeError = StateError('secondary close failure');
    final scope = Object();
    final runtime = AssistantLocalRuntime(
      load: (_) async => model,
      currentScope: () => scope,
    );
    await runtime.load('/verified/model');
    final result = runtime.generate(const [
      LocalChatTurn(text: 'Hello', isUser: true),
    ]).toList();
    final resultCheck = expectLater(result, throwsA(same(stopError)));
    await session.started.future;
    await expectLater(runtime.unload(), throwsA(same(stopError)));
    await resultCheck;
    expect(model.closed, isTrue);
    expect(runtime.ready, isFalse);
    await runtime.close();
  });

  test(
    'model close failure is surfaced and leaves readiness cleared',
    () async {
      final closeError = StateError('close failure');
      final model = TestModel(TestSession())..closeError = closeError;
      final scope = Object();
      final runtime = AssistantLocalRuntime(
        load: (_) async => model,
        currentScope: () => scope,
      );
      await runtime.load('/verified/model');
      await expectLater(runtime.unload(), throwsA(same(closeError)));
      expect(model.closed, isTrue);
      expect(runtime.ready, isFalse);
      await runtime.close();
    },
  );

  test(
    'does not silently use a remote fallback after a native load failure',
    () async {
      final scope = Object();
      final runtime = AssistantLocalRuntime(
        load: (_) => Future.error(StateError('native unavailable')),
        currentScope: () => scope,
      );
      await expectLater(runtime.load('/verified/model'), throwsStateError);
      expect(runtime.ready, isFalse);
      await expectLater(
        runtime.generate(const [
          LocalChatTurn(text: 'Hello', isUser: true),
        ]).toList(),
        throwsStateError,
      );
    },
  );

  test(
    'bounds history and rejects oversized current prompt before generation',
    () async {
      final session = TestSession();
      final scope = Object();
      final runtime = AssistantLocalRuntime(
        load: (_) async => TestModel(session),
        currentScope: () => scope,
      );
      await runtime.load('/verified/model');
      await expectLater(
        runtime.generate([
          LocalChatTurn(text: 'x' * 6001, isUser: true),
        ]).toList(),
        throwsArgumentError,
      );
      expect(session.added, isEmpty);
      expect(session.started.isCompleted, isFalse);
      expect(session.closed, isTrue);
    },
  );
}
