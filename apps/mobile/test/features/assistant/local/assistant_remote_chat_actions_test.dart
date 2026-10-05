import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/local/assistant_remote_chat_actions.dart';
import 'package:mobile/features/assistant/local/assistant_remote_scope_guard.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements AssistantRepository {}

class _Preferences extends Mock implements AssistantPreferences {}

class _Chat extends AssistantChatCubit {
  _Chat(AssistantRepository repository)
    : super(
        repository: repository,
        preferences: _Preferences(),
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {},
      ) {
    emit(
      state.copyWith(
        workspaceId: 'ws',
        chat: const AssistantChatRecord(id: 'saved'),
        storedChatId: 'saved',
        messages: const [
          AssistantMessage(
            id: 'prior-user',
            role: 'user',
            parts: [AssistantMessagePart(type: 'text', text: 'private draft')],
          ),
        ],
      ),
    );
  }
}

void main() {
  setUpAll(() {
    registerFallbackValue(AssistantThinkingMode.fast);
    registerFallbackValue(AssistantCreditSource.workspace);
  });
  const shell = AssistantShellState(workspace: Workspace(id: 'ws'));
  for (final retry in [false, true]) {
    final action = retry ? 'retry' : 'submit';
    for (final change in ['local', 'mode ABA', 'actor ABA', 'unchanged']) {
      test(
        '$action fences admission after deferred timezone: $change',
        () async {
          final repository = _Repository();
          when(repository.generateUuid).thenReturn('synthetic-id');
          final chat = _Chat(repository);
          addTearDown(chat.close);
          var scope = Object();
          var version = 1;
          var remote = true;
          final guard = AssistantRemoteScopeGuard(
            scope: () => scope,
            version: () => version,
            remote: () => remote,
          );
          final timezone = Completer<String>();
          final resolving = Completer<void>();
          Future<String> resolve() {
            resolving.complete();
            return timezone.future;
          }

          final pending = retry
              ? retryAssistantChat(
                  chat,
                  shell,
                  isCurrent: () => guard.current,
                  resolveTimezone: resolve,
                )
              : submitAssistantRemoteChat(
                  chat,
                  shell,
                  wsId: 'ws',
                  message: 'private draft',
                  isCurrent: () => guard.current,
                  resolveTimezone: resolve,
                );
          await resolving.future;
          switch (change) {
            case 'local':
              remote = false;
              version++;
            case 'mode ABA':
              version += 2;
            case 'actor ABA':
              scope = Object();
            case 'unchanged':
              break;
          }
          timezone.complete('UTC');
          await pending;
          // Real submit/retry primes the actual cubit's queue synchronously;
          // a stale request must never reach that admission boundary.
          expect(
            chat.state.queuedMessages,
            change == 'unchanged' ? ['private draft'] : isEmpty,
          );
          expect(chat.state.messages.first.parts.single.text, 'private draft');
          await chat.stopStreaming();
        },
      );
    }
  }
  test('changing model lanes discards pending remote submissions', () async {
    final repository = _Repository();
    when(repository.generateUuid).thenReturn('synthetic-id');
    final chat = _Chat(repository);
    addTearDown(chat.close);
    await submitAssistantRemoteChat(
      chat,
      shell,
      wsId: 'ws',
      message: 'unsent remote draft',
      isCurrent: () => true,
      resolveTimezone: () async => 'UTC',
    );
    expect(chat.state.queuedMessages, ['unsent remote draft']);
    await chat.stopStreaming(discardQueued: true);
    expect(chat.state.queuedMessages, isEmpty);
    verifyNever(
      () => repository.streamChat(
        chatId: any(named: 'chatId'),
        wsId: any(named: 'wsId'),
        workspaceContextId: any(named: 'workspaceContextId'),
        modelId: any(named: 'modelId'),
        messages: any(named: 'messages'),
        thinkingMode: any(named: 'thinkingMode'),
        creditSource: any(named: 'creditSource'),
        timezone: any(named: 'timezone'),
        attachments: any(named: 'attachments'),
        creditWsId: any(named: 'creditWsId'),
      ),
    );
  });

  for (final retry in [false, true]) {
    test('busy ${retry ? 'retry' : 'submit'} rejects late admission after '
        'subscription cancellation and mode ABA', () async {
      final repository = _Repository();
      when(repository.generateUuid).thenReturn('synthetic-id');
      final listening = Completer<void>();
      final cancelling = Completer<void>();
      final releaseCancellation = Completer<void>();
      final stream = StreamController<AssistantStreamEvent>(
        sync: true,
        onListen: listening.complete,
        onCancel: () {
          cancelling.complete();
          return releaseCancellation.future;
        },
      );
      when(
        () => repository.streamChat(
          chatId: any(named: 'chatId'),
          wsId: any(named: 'wsId'),
          workspaceContextId: any(named: 'workspaceContextId'),
          modelId: any(named: 'modelId'),
          messages: any(named: 'messages'),
          thinkingMode: any(named: 'thinkingMode'),
          creditSource: any(named: 'creditSource'),
          timezone: any(named: 'timezone'),
          attachments: any(named: 'attachments'),
          creditWsId: any(named: 'creditWsId'),
        ),
      ).thenAnswer((_) => stream.stream);
      final chat = _Chat(repository);
      addTearDown(chat.close);
      addTearDown(stream.close);
      Future<void> submit({bool Function()? isCurrent}) => chat.submit(
        wsId: 'ws',
        message: 'private draft',
        modelId: 'model',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: 'ws',
        timezone: 'UTC',
        isCurrent: isCurrent,
      );
      await submit();
      await listening.future;
      stream.add(const AssistantJsonStreamEvent({'type': 'start'}));
      expect(chat.state.status, AssistantChatStatus.streaming);
      final scope = Object();
      var version = 1;
      final guard = AssistantRemoteScopeGuard(
        scope: () => scope,
        version: () => version,
        remote: () => true,
      );
      final pending = retry
          ? chat.retryLast(
              wsId: 'ws',
              modelId: 'model',
              thinkingMode: AssistantThinkingMode.fast,
              creditSource: AssistantCreditSource.workspace,
              workspaceContextId: 'ws',
              timezone: 'UTC',
              isCurrent: () => guard.current,
            )
          : submit(isCurrent: () => guard.current);
      await cancelling.future;
      version += 2;
      releaseCancellation.complete();
      await pending;
      expect(chat.state.queuedMessages, isEmpty);
      verify(
        () => repository.streamChat(
          chatId: any(named: 'chatId'),
          wsId: any(named: 'wsId'),
          workspaceContextId: any(named: 'workspaceContextId'),
          modelId: any(named: 'modelId'),
          messages: any(named: 'messages'),
          thinkingMode: any(named: 'thinkingMode'),
          creditSource: any(named: 'creditSource'),
          timezone: any(named: 'timezone'),
          attachments: any(named: 'attachments'),
          creditWsId: any(named: 'creditWsId'),
        ),
      ).called(1);
    });
  }
}
