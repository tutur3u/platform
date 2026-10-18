import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

import 'assistant_chat_cache_harness.dart';

class _Api extends Mock implements ApiClient {}

const actor = '33333333-3333-4333-8333-333333333333';
const ws = '11111111-1111-4111-8111-111111111111';
const chat = '44444444-4444-4444-8444-444444444444';
AssistantRestoredChat snapshot(String text) => AssistantRestoredChat(
  chat: const AssistantChatRecord(id: chat),
  settings: const AssistantConversationSettings(
    modelId: 'model',
    creditSource: AssistantCreditSource.workspace,
    creditWsId: null,
    thinkingMode: AssistantThinkingMode.thinking,
  ),
  messages: [
    AssistantMessage(
      id: '99999999-9999-4999-8999-999999999999',
      role: 'assistant',
      parts: [AssistantMessagePart(type: 'text', text: text)],
    ),
  ],
  attachmentsByMessageId: const {},
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late ChatCacheDisk disk;
  late AssistantRepository repository;
  String? currentActor;
  var lease = true;
  setUp(() async {
    disk = ChatCacheDisk();
    await disk.setup();
    currentActor = actor;
    lease = true;
    repository = AssistantRepository(
      chatCacheStore: disk.store,
      currentUserId: () => currentActor,
    );
  });
  tearDown(() async {
    await repository.drainAssistantChatCache();
    await disk.close();
  });
  AssistantChatCacheOrigin origin() => repository.captureChatCacheOrigin(
    wsId: ws,
    chatId: chat,
    isCurrent: () => lease,
  )!;
  Future<String?> read(AssistantChatCacheOrigin scope) async {
    final value = await disk.store.read<AssistantRestoredChat>(
      key: scope.key,
      decode: (raw) => AssistantRestoredChat.fromJson(
        Map<String, dynamic>.from(raw! as Map),
      ),
    );
    return value.data?.messages.single.parts.single.text;
  }

  test('held predecessor cancelled; latest snapshot survives reopen', () async {
    final entered = Completer<void>();
    final release = Completer<void>();
    var writes = 0;
    disk.checkpoint = (stage) async {
      if (stage == 'snapshot' && ++writes == 1) {
        entered.complete();
        await release.future;
      }
    };
    final scope = origin();
    final old = repository.publishAssistantChatSnapshot(
      origin: scope,
      restored: snapshot('old'),
    );
    await entered.future;
    final immutable = snapshot('latest');
    final latest = repository.publishAssistantChatSnapshot(
      origin: origin(),
      restored: immutable,
    );
    immutable.messages.clear();
    release.complete();
    expect((await old).status, AssistantChatCacheStatus.cancelled);
    expect((await latest).status, AssistantChatCacheStatus.published);
    await repository.drainAssistantChatCache();
    expect(scope.key.userId, actor);
    await disk.reopen();
    expect(await read(scope), 'latest');
    expect(writes, 2);
  });
  test(
    'unrelated storage StateError fails safely and retains previous snapshot',
    () async {
      final scope = origin();
      await repository.publishAssistantChatSnapshot(
        origin: scope,
        restored: snapshot('authorized'),
      );
      disk.checkpoint = (stage) {
        if (stage == 'snapshot') throw StateError('synthetic disk fault');
      };
      final failed = await repository.publishAssistantChatSnapshot(
        origin: origin(),
        restored: snapshot('failed'),
      );
      expect(failed.status, AssistantChatCacheStatus.failed);
      expect(failed.diagnostics, isNotNull);
      expect(await read(scope), 'authorized');
      disk.checkpoint = null;
      await disk.reopen();
      expect(await read(scope), 'authorized');
    },
  );
  test('filesystem failure is distinct from revision cancellation', () async {
    disk.checkpoint = (stage) {
      if (stage == 'snapshot') throw const FileSystemException('synthetic');
    };
    final result = await repository.publishAssistantChatSnapshot(
      origin: origin(),
      restored: snapshot('failed'),
    );
    expect(result.status, AssistantChatCacheStatus.failed);
    expect(result.diagnostics, isNotNull);
  });
  for (final boundary in [
    'actor',
    'logout',
    'workspace',
    'selection',
    'clear',
  ]) {
    test(
      'held publication fences $boundary without rekey or resurrection',
      () async {
        final entered = Completer<void>();
        final release = Completer<void>();
        disk.checkpoint = (stage) async {
          if (stage == 'snapshot') {
            entered.complete();
            await release.future;
          }
        };
        final scope = origin();
        final pending = repository.publishAssistantChatSnapshot(
          origin: scope,
          restored: snapshot('obsolete'),
        );
        await entered.future;
        Future<void>? clearing;
        switch (boundary) {
          case 'actor':
            currentActor = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
          case 'logout':
            currentActor = null;
          case 'workspace':
            lease = false;
          case 'selection':
            repository.invalidateChatCreation();
          case 'clear':
            clearing = disk.store.clearScope(userId: actor, workspaceId: ws);
        }
        release.complete();
        expect((await pending).status, AssistantChatCacheStatus.cancelled);
        await clearing;
        expect(await read(scope), isNull);
        expect(scope.key.userId, actor);
        await disk.reopen();
        expect(await read(scope), isNull);
      },
    );
  }
  test(
    'actor change during actual cache read denies captured origin',
    () async {
      final scope = origin();
      await repository.publishAssistantChatSnapshot(
        origin: scope,
        restored: snapshot('authorized'),
      );
      await disk.store.closeForTesting();
      final release = Completer<void>();
      disk
        ..openingGate = release.future
        ..openingEntered = Completer<void>();
      disk.store = disk.createStore();
      repository = AssistantRepository(
        chatCacheStore: disk.store,
        currentUserId: () => currentActor,
      );
      final pending = repository.restoreChat(
        wsId: ws,
        chatId: chat,
        cacheOrigin: repository.captureChatCacheOrigin(
          wsId: ws,
          chatId: chat,
          isCurrent: () => lease,
        ),
      );
      final denied = expectLater(
        pending,
        throwsA(isA<AssistantChatCacheCancellation>()),
      );
      await disk.openingEntered!.future;
      currentActor = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      release.complete();
      await denied;
      expect(await read(scope), 'authorized');
      final fresh = repository.captureChatCacheOrigin(
        wsId: ws,
        chatId: chat,
        isCurrent: () => true,
      )!;
      expect(fresh.key.userId, currentActor);
    },
  );
  test(
    'compatibility write preserves explicit storage failure contract',
    () async {
      disk.checkpoint = (stage) {
        if (stage == 'snapshot') throw StateError('Synthetic disk failure');
      };
      await expectLater(
        repository.writeAssistantChatCache(
          wsId: ws,
          chatId: chat,
          restored: snapshot('failed'),
        ),
        throwsA(isA<AssistantChatCacheStorageFailure>()),
      );
      expect(repository.chatCacheDiagnostics, isNotNull);
    },
  );
  test(
    'inherited cached refresh retains origin and is observed by close drain',
    () async {
      final api = _Api();
      final entered = Completer<void>();
      final response = Completer<Map<String, dynamic>>();
      when(
        () => api.getJson(
          '/api/v1/workspaces/$ws/chat/conversations/$chat/ai-settings',
        ),
      ).thenAnswer((_) {
        entered.complete();
        return response.future;
      });
      repository = AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        chatCacheStore: disk.store,
        currentUserId: () => currentActor,
      );
      final scope = origin();
      await repository.publishAssistantChatSnapshot(
        origin: scope,
        restored: snapshot('authorized'),
      );
      expect(
        (await repository.restoreChat(
          wsId: ws,
          chatId: chat,
          cacheOrigin: scope,
        ))!.messages.single.parts.single.text,
        'authorized',
      );
      await entered.future;
      var drained = false;
      final closing = repository.drainAssistantChatCache().then(
        (_) => drained = true,
      );
      await Future<void>.delayed(Duration.zero);
      expect(drained, false);
      currentActor = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      response.complete({
        'settings': {'conversationId': chat},
      });
      await closing;
      expect(drained, true);
      expect(repository.chatCacheDiagnostics, isNull);
      expect(await read(scope), 'authorized');
      expect(await read(origin()), isNull);
    },
  );
  test(
    'old native cache without tuple revalidates before restore admission',
    () async {
      final api = _Api();
      final entered = Completer<void>();
      final response = Completer<Map<String, dynamic>>();
      when(
        () => api.getJson(
          '/api/v1/workspaces/$ws/chat/conversations/$chat/ai-settings',
        ),
      ).thenAnswer((_) {
        entered.complete();
        return response.future;
      });
      repository = AssistantRepository(
        apiClient: api,
        chatCacheStore: disk.store,
        currentUserId: () => currentActor,
      );
      final scope = origin();
      final currentSnapshot = snapshot('old authorized');
      await repository.publishAssistantChatSnapshot(
        origin: scope,
        restored: AssistantRestoredChat(
          chat: currentSnapshot.chat,
          messages: currentSnapshot.messages,
          attachmentsByMessageId: const {},
        ),
      );
      var completed = false;
      final restoring = repository
          .restoreChat(wsId: ws, chatId: chat, cacheOrigin: scope)
          .whenComplete(() => completed = true);
      final observed = expectLater(
        restoring,
        throwsA(isA<AssistantChatCacheCancellation>()),
      );
      await entered.future;
      expect(completed, false);
      currentActor = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      response.complete({
        'settings': {'conversationId': chat},
      });
      await observed;
      expect(await read(scope), 'old authorized');
    },
  );
  for (final olderFails in [false, true]) {
    test(
      'same-scope successor fault retains authorized rollback ($olderFails)',
      () async {
        final scope = origin();
        await repository.publishAssistantChatSnapshot(
          origin: scope,
          restored: snapshot('authorized-A'),
        );
        final entered = Completer<void>();
        final release = Completer<void>();
        var attempts = 0;
        disk.checkpoint = (stage) async {
          if (stage != 'snapshot') return;
          if (++attempts == 1) {
            entered.complete();
            await release.future;
            if (olderFails) {
              throw StateError('Synthetic predecessor disk fault');
            }
          } else {
            throw const FileSystemException('Synthetic successor disk fault');
          }
        };
        final older = repository.publishAssistantChatSnapshot(
          origin: origin(),
          restored: snapshot('authorized-B'),
        );
        await entered.future;
        final successor = repository.publishAssistantChatSnapshot(
          origin: origin(),
          restored: snapshot('attempt-C'),
        );
        release.complete();
        final oldResult = await older;
        expect(
          oldResult.status,
          olderFails
              ? AssistantChatCacheStatus.failed
              : AssistantChatCacheStatus.cancelled,
        );
        final failure = await successor;
        expect(failure.status, AssistantChatCacheStatus.failed);
        expect(failure.diagnostics, isNotNull);
        await repository.drainAssistantChatCache();
        // An admitted current-origin B may finish. If it fails, A stays intact.
        final retained = olderFails ? 'authorized-A' : 'authorized-B';
        expect(await read(scope), retained);
        disk.checkpoint = null;
        await disk.reopen();
        expect(await read(scope), retained);
        expect(attempts, 2);
      },
    );
  }
  test('explicit identical request recovers after storage failure', () async {
    final scope = origin();
    await repository.publishAssistantChatSnapshot(
      origin: scope,
      restored: snapshot('A'),
    );
    var writes = 0;
    var fail = true;
    disk.checkpoint = (stage) {
      if (stage == 'snapshot') {
        writes++;
        if (fail) throw StateError('Synthetic recoverable storage failure');
      }
    };
    expect(
      (await repository.publishAssistantChatSnapshot(
        origin: scope,
        restored: snapshot('S'),
      )).status,
      AssistantChatCacheStatus.failed,
    );
    expect(await read(scope), 'A');
    fail = false;
    expect(
      (await repository.publishAssistantChatSnapshot(
        origin: scope,
        restored: snapshot('S'),
      )).status,
      AssistantChatCacheStatus.published,
    );
    expect(writes, 2);
    expect(await read(scope), 'S');
    await repository.drainAssistantChatCache();
    disk.checkpoint = null;
    await disk.reopen();
    expect(await read(scope), 'S');
  });
}
