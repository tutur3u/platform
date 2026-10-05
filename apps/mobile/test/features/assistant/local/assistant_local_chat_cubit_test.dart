import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_state.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/local/assistant_local_runtime.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'assistant_local_chat_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'native text tokens and private history stay in the local lane',
    () async {
      final h = LocalChatHarness();
      await h.activate();
      final sending = h.cubit.send('Private prompt');
      for (var i = 0; i < 20 && h.model.sessions.isEmpty; i++) {
        await Future<void>.delayed(Duration.zero);
      }
      final session = h.model.sessions.single;
      await session.started.future;
      session.tokens.add('Native answer');
      await session.tokens.close();
      await sending;
      expect(session.turns.single.text, 'Private prompt');
      expect(
        h.cubit.state.chat.messages.last.parts.single.text,
        'Native answer',
      );
      expect(h.history.saves, 1);
      expect(h.cubit.state.ready, isTrue);
      await h.cubit.select(null);
      expect(h.cubit.state.chat.messages, isEmpty);
      expect(h.cubit.state.local, isFalse);
      await h.cubit.select(assistantLocalModels.first.id);
      expect(h.cubit.state.chat.messages.length, 2);
      await h.cubit.close();
    },
  );

  for (final fault in ['hardware', 'missing', 'native']) {
    test('$fault failure blocks sending without choosing remote', () async {
      final h = LocalChatHarness()
        ..supported = fault != 'hardware'
        ..failLoad = fault == 'native';
      h.store.installed = fault != 'missing';
      await h.activate();
      expect(h.cubit.state.local, isTrue);
      expect(h.cubit.state.ready, isFalse);
      expect(h.cubit.state.failure, switch (fault) {
        'hardware' => LocalChatFailure.unsupported,
        'missing' => LocalChatFailure.missingModel,
        _ => LocalChatFailure.engine,
      });
      await h.cubit.send('Must never be forwarded');
      expect(h.model.sessions, isEmpty);
      expect(h.history.saves, 0);
      await h.cubit.close();
    });
  }

  test('unknown persisted model blocks implicit remote fallback', () async {
    SharedPreferences.setMockInitialValues({
      'user::mira-local-model::workspace': 'removed-from-catalogue',
    });
    final h = LocalChatHarness();
    await h.cubit.syncWorkspace('user', 'workspace');
    expect(h.cubit.state.local, isTrue);
    expect(h.cubit.state.selectedModelId, 'removed-from-catalogue');
    expect(h.cubit.state.ready, isFalse);
    await h.cubit.send('Private');
    expect(h.model.sessions, isEmpty);
    await h.cubit.select(null);
    expect(h.cubit.state.blocked, isFalse);
    await h.cubit.close();
  });

  test(
    'actor ABA prevents token publication and encrypted history writes',
    () async {
      final h = LocalChatHarness();
      await h.activate();
      final sending = h.cubit.send('Old session');
      for (var i = 0; i < 20 && h.model.sessions.isEmpty; i++) {
        await Future<void>.delayed(Duration.zero);
      }
      final session = h.model.sessions.single;
      await session.started.future;
      h.scope = Object();
      final invalidating = h.cubit.invalidate();
      session.tokens.add('Stale answer');
      await sending;
      await invalidating;
      expect(h.cubit.state.chat.messages, isEmpty);
      expect(h.history.saves, 0);
      expect(h.model.closed, isTrue);
      await h.cubit.close();
    },
  );

  test('new conversation drains generation before clearing history', () async {
    final h = LocalChatHarness();
    await h.activate();
    final sending = h.cubit.send('Discard this conversation');
    final session = await h.model.firstSession.future;
    await session.started.future;
    await h.cubit.clearConversation();
    await sending;
    expect(session.closed, isTrue);
    expect(h.cubit.state.chat.messages, isEmpty);
    expect(h.history.saves, 0);
    expect(h.cubit.state.ready, isTrue);
    await h.cubit.close();
  });

  test(
    'stop failure tears down weights and blocks subsequent generation',
    () async {
      final h = LocalChatHarness();
      await h.activate();
      final sending = h.cubit.send('Prompt');
      for (var i = 0; i < 20 && h.model.sessions.isEmpty; i++) {
        await Future<void>.delayed(Duration.zero);
      }
      final session = h.model.sessions.single;
      await session.started.future;
      session.stopError = StateError('Native stop failed');
      await h.cubit.stop();
      await sending;
      expect(h.model.closed, isTrue);
      expect(h.cubit.state.ready, isFalse);
      expect(h.cubit.state.failure, LocalChatFailure.engine);
      await h.cubit.send('No new session');
      expect(h.model.sessions.length, 1);
      await h.cubit.close();
    },
  );
  test('late native load after actor ABA is closed before another '
      'scope can activate', () async {
    final h = LocalChatHarness();
    await h.cubit.syncWorkspace('user', 'workspace');
    h.loadBarrier = Completer<LocalInferenceModel>();
    final activating = h.cubit.select(assistantLocalModels.first.id);
    await h.loading.future;
    h.scope = Object();
    final invalidating = h.cubit.invalidate();
    h.loadBarrier!.complete(h.model);
    await activating;
    await invalidating;
    expect(h.model.closed, isTrue);
    expect(h.cubit.state.ready, isFalse);
    expect(h.cubit.state.chat.messages, isEmpty);
    await h.cubit.close();
  });

  test(
    'explicit remote selection waits for pending local load cleanup',
    () async {
      final h = LocalChatHarness();
      await h.cubit.syncWorkspace('user', 'workspace');
      h.loadBarrier = Completer<LocalInferenceModel>();
      final activating = h.cubit.select(assistantLocalModels.first.id);
      await h.loading.future;
      final remote = h.cubit.select(null);
      expect(h.cubit.state.blocked, isTrue);
      h.loadBarrier!.complete(h.model);
      await activating;
      await remote;
      expect(h.model.closed, isTrue);
      expect(h.cubit.state.local, isFalse);
      expect(h.cubit.state.blocked, isFalse);
      expect(
        await h.preferences.load('workspace', isScopeCurrent: () => true),
        isNull,
      );
      await h.cubit.close();
    },
  );
}
