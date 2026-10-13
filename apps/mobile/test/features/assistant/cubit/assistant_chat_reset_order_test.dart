import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

const actorId = '33333333-3333-4333-8333-333333333333';
const ws = '11111111-1111-4111-8111-111111111111';
const saved = '22222222-2222-4222-8222-222222222222';
const otherActor = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const key = '$actorId::mira-conversation-envelope::v1::$ws';

class _Api extends Mock implements ApiClient {}

class _Host extends InMemorySharedPreferencesStore {
  _Host()
    : super.withData({
        'flutter.$key': jsonEncode({
          'schema': 1,
          'actorId': actorId,
          'workspaceId': ws,
          'revision': 1,
          'generation': 1,
          'selectedChatId': saved,
          'contextId': 'prior',
          'creation': {'status': 'unknown', 'attemptId': null},
          'resetConsent': null,
          'resetIntent': null,
        }),
      });
  int writes = 0;
  int? faultAt;
  int? holdAt;
  bool throws = false;
  final entered = Completer<void>();
  final release = Completer<void>();
  @override
  Future<bool> setValue(String type, String key, Object value) async {
    writes++;
    if (writes == holdAt) {
      entered.complete();
      await release.future;
    }
    if (writes == faultAt) {
      if (throws) throw StateError('Synthetic write failure');
      return false;
    }
    return await super.setValue(type, key, value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Host host;
  late _Api api;
  late AssistantRepository repository;
  late AssistantPreferences prefs;
  late AssistantShellCubit shell;
  late AssistantChatCubit chat;
  var actor = actorId;
  var scope = 0;
  var callbacks = 0;
  var throwNotification = false;
  final heldNotification = Completer<void>();
  var holdNotification = false;
  setUp(() {
    SharedPreferences.resetStatic();
    host = _Host();
    SharedPreferencesStorePlatform.instance = host;
    actor = actorId;
    scope = 0;
    callbacks = 0;
    throwNotification = false;
    holdNotification = false;
    AssistantResetPreferences.revokeConsent(key);
    api = _Api();
    repository = AssistantRepository(
      apiClient: api,
      tasksApiClient: api,
      currentUserId: () => actor,
    );
    prefs = AssistantPreferences(currentUserId: () => actor);
    shell =
        AssistantShellCubit(
          repository: repository,
          preferences: prefs,
          currentScopeToken: () => scope,
        )..emit(
          const AssistantShellState(
            workspace: Workspace(id: ws),
            workspaceContextId: 'prior',
          ),
        );
    chat = AssistantChatCubit(
      repository: repository,
      preferences: prefs,
      prepareResetWorkspaceContext: shell.prepareResetWorkspaceContext,
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {
        callbacks++;
        if (holdNotification) await heldNotification.future;
        if (throwNotification) {
          throw StateError('Synthetic notification failure');
        }
      },
    );
    const attachment = AssistantAttachment(
      id: 'draft',
      name: 'synthetic',
      size: 1,
      type: 'text/plain',
    );
    chat.emit(
      chat.state.copyWith(
        workspaceId: ws,
        storedChatId: saved,
        chat: const AssistantChatRecord(id: saved),
        messages: const [
          AssistantMessage(
            id: 'history',
            role: 'assistant',
            parts: [AssistantMessagePart(type: 'text', text: 'Known history')],
          ),
        ],
        composerAttachments: const [attachment],
      ),
    );
  });
  tearDown(() async {
    if (!host.release.isCompleted) host.release.complete();
    await chat.close();
    await shell.close();
  });

  test(
    'prepare is pure and unknown reset requires explicit informed action',
    () async {
      final before = chat.state;
      final plan = shell.prepareResetWorkspaceContext('personal', () => true);
      expect(plan, isNotNull);
      expect(shell.state.workspaceContextId, 'prior');
      expect(host.writes, 0);
      final result = await chat.resetConversationAcknowledged(ws);
      expect(result.disposition, AssistantResetDisposition.deniedBeforeEffect);
      expect(host.writes, 0);
      expect(chat.state, before);
      expect(shell.state.workspaceContextId, 'prior');
      expect(callbacks, 0);
    },
  );
  for (final boundary in [1, 2]) {
    for (final throws in [false, true]) {
      test(
        'host $boundary ${throws ? 'throw' : 'false'} retains visible selection/draft',
        () async {
          host
            ..faultAt = boundary
            ..throws = throws;
          final before = chat.state;
          final result = await chat.resetConversationAcknowledged(
            ws,
            acknowledgeUnknownCreation: true,
          );
          expect(result.disposition, AssistantResetDisposition.uncertain);
          expect(chat.state.chat, before.chat);
          expect(chat.state.storedChatId, before.storedChatId);
          expect(chat.state.messages, before.messages);
          expect(chat.state.composerAttachments, before.composerAttachments);
          expect(chat.state.fallbackChatId, before.fallbackChatId);
          expect(shell.state.workspaceContextId, 'prior');
          expect(callbacks, 0);
          expect(await prefs.loadChatId(ws), saved);
          expect(await prefs.loadWorkspaceContextId(ws), 'prior');
          expect(host.writes, boundary);
        },
      );
    }
  }
  for (final boundary in [1, 2]) {
    test(
      'actor ABA with lifecycle token at $boundary cannot publish stale plan',
      () async {
        host.holdAt = boundary;
        final before = chat.state;
        final work = chat.resetConversationAcknowledged(
          ws,
          acknowledgeUnknownCreation: true,
        );
        await host.entered.future;
        actor = otherActor;
        scope++;
        actor = actorId;
        scope++;
        host.release.complete();
        final result = await work;
        expect(
          result.disposition,
          boundary == 1
              ? AssistantResetDisposition.uncertain
              : AssistantResetDisposition.committedStale,
        );
        expect(chat.state, before);
        expect(shell.state.workspaceContextId, 'prior');
        expect(callbacks, 0);
        expect(await repository.hasUnknownChatCreation(ws), true);
        expect(host.writes, boundary);
      },
    );
  }
  test(
    'known whole-tuple commit publishes once and notification cannot veto',
    () async {
      throwNotification = true;
      final result = await chat.resetConversationAcknowledged(
        ws,
        acknowledgeUnknownCreation: true,
      );
      expect(result.committedCurrent, true);
      expect(shell.state.workspaceContextId, 'personal');
      expect(chat.state.chat, null);
      expect(chat.state.messages, isEmpty);
      expect(chat.state.composerAttachments, isEmpty);
      expect(await prefs.loadChatId(ws), null);
      expect(await prefs.loadWorkspaceContextId(ws), 'personal');
      expect(await repository.hasUnknownChatCreation(ws), false);
      expect(callbacks, 1);
      expect(host.writes, 2);
    },
  );
  test(
    'informed reset admits one direct HTTP create; unknown blocks retry',
    () async {
      var posts = 0;
      when(() => api.postJson(any(), any())).thenAnswer((_) async {
        posts++;
        expect(await repository.hasUnknownChatCreation(ws), true);
        throw const ApiException(message: 'Synthetic unknown', statusCode: 503);
      });
      expect(
        await chat.resetConversation(ws, acknowledgeUnknownCreation: true),
        true,
      );
      final original = chat.state.fallbackChatId;
      Future<AssistantChatRecord> create() => repository.createChat(
        id: original,
        wsId: ws,
        modelId: 'synthetic/model',
        message: 'Synthetic prompt',
        timezone: 'UTC',
      );
      await expectLater(create(), throwsA(isA<ApiException>()));
      await expectLater(
        create(),
        throwsA(isA<AssistantCreationUncertainException>()),
      );
      expect(posts, 1);
      expect(chat.state.fallbackChatId, original);
      expect(await repository.hasUnknownChatCreation(ws), true);
      verifyNever(() => api.patchJson(any(), any()));
    },
  );

  test(
    'overlapping informed actions cannot admit another reset intent',
    () async {
      host.holdAt = 1;
      final first = chat.resetConversationAcknowledged(
        ws,
        acknowledgeUnknownCreation: true,
      );
      await host.entered.future;
      final duplicate = await chat.resetConversationAcknowledged(
        ws,
        acknowledgeUnknownCreation: true,
      );
      expect(
        duplicate.disposition,
        AssistantResetDisposition.deniedBeforeEffect,
      );
      host.release.complete();
      expect((await first).committedCurrent, true);
      expect(host.writes, 2);
      expect(callbacks, 1);
    },
  );

  test(
    'legacy effectful callback alone cannot qualify prepared reset',
    () async {
      await chat.close();
      chat = AssistantChatCubit(
        repository: repository,
        preferences: prefs,
        onResetWorkspaceContext: shell.resetWorkspaceContextAcknowledged,
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {
          callbacks++;
        },
      );
      chat.emit(chat.state.copyWith(workspaceId: ws));
      expect(
        await chat.resetConversation(ws, acknowledgeUnknownCreation: true),
        false,
      );
      expect(host.writes, 0);
      expect(shell.state.workspaceContextId, 'prior');
      expect(callbacks, 0);
    },
  );
  test(
    'postcommit notification is observed by close without delaying receipt',
    () async {
      holdNotification = true;
      expect(
        await chat.resetConversation(ws, acknowledgeUnknownCreation: true),
        true,
      );
      var closed = false;
      final closing = chat.close().then((_) {
        closed = true;
      });
      await Future<void>.value();
      expect(closed, false);
      heldNotification.complete();
      await closing;
      expect(closed, true);
    },
  );
}
