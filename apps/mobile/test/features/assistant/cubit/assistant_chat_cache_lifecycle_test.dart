import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

import '../data/assistant_chat_cache_harness.dart';
import 'assistant_chat_creation_harness.dart';

class _CacheRepository extends AssistantRepository {
  _CacheRepository(CreationApi api, ChatCacheDisk disk)
    : super(
        apiClient: api,
        tasksApiClient: api,
        currentUserId: () => actorId,
        chatCacheStore: disk.store,
      );
  final second = Completer<void>();
  final publications = <AssistantRestoredChat>[];
  int requests = 0;
  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [];
  @override
  Future<AssistantChatCachePublication> publishAssistantChatSnapshot({
    required AssistantChatCacheOrigin origin,
    required AssistantRestoredChat restored,
  }) {
    publications.add(restored);
    if (++requests == 2) second.complete();
    return super.publishAssistantChatSnapshot(
      origin: origin,
      restored: restored,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late ChatCacheDisk sharedDisk;
  setUpAll(() async {
    sharedDisk = ChatCacheDisk();
    await sharedDisk.setup();
  });
  tearDownAll(() async {
    await sharedDisk.close();
  });

  test(
    'completion cache failures must be observed without undoing USER ACK',
    () async {
      final disk = sharedDisk;
      await (disk..checkpoint = null).store.clearScope(workspaceId: ws);
      final h = CreationHarness();
      await h.setup();
      await h.chat.close();
      final repository = _CacheRepository(h.api, disk);
      h.chat = AssistantChatCubit(
        repository: repository,
        preferences: AssistantPreferences(currentUserId: () => actorId),
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {},
      );
      h.chat.emit(
        h.chat.state.copyWith(
          workspaceId: ws,
          chat: const AssistantChatRecord(id: saved),
          storedChatId: saved,
        ),
      );
      final entered = Completer<void>();
      final release = Completer<void>();
      var snapshots = 0;
      disk.checkpoint = (stage) async {
        if (stage == 'snapshot' && ++snapshots == 1) {
          entered.complete();
          await release.future;
        }
      };
      final errors = <Object>[];
      final finished = Completer<void>();
      unawaited(
        runZonedGuarded(() async {
          try {
            expect(
              (await h.send()).acknowledged,
              true,
              reason: h.chat.state.error,
            );
            await entered.future;
            await repository.second.future;
            release.complete();
            await repository.drainAssistantChatCache();
            await Future<void>.delayed(Duration.zero);
          } finally {
            finished.complete();
          }
        }, (error, _) => errors.add(error)),
      );
      try {
        await finished.future.timeout(const Duration(seconds: 5));
        expect(
          h.chat.state.messages.where((m) => m.role == 'user'),
          hasLength(1),
        );
        expect(h.sends, hasLength(1));
        expect(errors, isEmpty);
        expect(repository.publications, hasLength(3));
        expect(repository.publications.first.messages, hasLength(1));
        expect(repository.publications.first.messages.single.isPersisted, true);
        expect(
          repository.publications[1].toJson(),
          repository.publications[2].toJson(),
        );
        expect(
          snapshots,
          2,
          reason: 'One USER receipt and one coalesced completed transcript',
        );
        expect(h.chat.state.status, AssistantChatStatus.idle);
      } finally {
        if (!release.isCompleted) release.complete();
        await h.close();
      }
    },
  );
  test('close drains held publication after invalidating its lease', () async {
    final disk = sharedDisk;
    await (disk..checkpoint = null).store.clearScope(workspaceId: ws);
    final h = CreationHarness();
    await h.setup();
    await h.chat.close();
    final repository = _CacheRepository(h.api, disk);
    h.chat = AssistantChatCubit(
      repository: repository,
      preferences: AssistantPreferences(currentUserId: () => actorId),
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    h.chat.emit(
      h.chat.state.copyWith(
        workspaceId: ws,
        chat: const AssistantChatRecord(id: saved),
        storedChatId: saved,
      ),
    );
    final entered = Completer<void>();
    final release = Completer<void>();
    disk.checkpoint = (stage) async {
      if (stage == 'snapshot') {
        if (!entered.isCompleted) entered.complete();
        await release.future;
      }
    };
    try {
      expect((await h.send()).acknowledged, true, reason: h.chat.state.error);
      await entered.future;
      var drained = false;
      final closing = h.chat.close().then((_) => drained = true);
      await Future<void>.delayed(Duration.zero);
      expect(drained, false);
      release.complete();
      await closing;
      expect(drained, true);
      expect(h.sends, hasLength(1));
    } finally {
      if (!release.isCompleted) release.complete();
      await h.close();
    }
  });
  for (final failure in ['disk', 'object']) {
    test(
      'explicit restore $failure retains history and safe diagnostic',
      () async {
        final disk = sharedDisk;
        await (disk..checkpoint = null).store.clearScope(workspaceId: ws);
        final h = CreationHarness(nativeRestore: true);
        await h.setup();
        await h.chat.close();
        final repository = _CacheRepository(h.api, disk);
        h.chat = AssistantChatCubit(
          repository: repository,
          preferences: AssistantPreferences(currentUserId: () => actorId),
          onWorkspaceContextChanged: (_) async {},
          onSoulRefreshRequested: () async {},
          onImmersiveModeChanged: (_) {},
          onChatRestored: (_) async {},
        );
        h.chat.emit(
          h.chat.state.copyWith(
            workspaceId: ws,
            chat: const AssistantChatRecord(id: saved),
            storedChatId: saved,
            messages: const [
              AssistantMessage(
                id: 'prior',
                role: 'assistant',
                parts: [
                  AssistantMessagePart(type: 'text', text: 'Prior history'),
                ],
              ),
            ],
          ),
        );
        if (failure == 'disk') {
          disk.checkpoint = (stage) {
            if (stage == 'snapshot') {
              throw StateError('Synthetic storage fault');
            }
          };
        } else {
          when(
            () => h.api.getJson(
              '/api/v1/workspaces/$ws/chat/conversations/$saved/ai-settings',
            ),
          ).thenAnswer(
            (_) async => throw StateError('Synthetic restore failure'),
          );
        }
        try {
          await h.chat.openChatById(ws, saved);
          expect(h.chat.state.storedChatId, saved);
          expect(
            h.chat.state.messages.single.parts.single.text,
            failure == 'disk' ? 'Known history' : 'Prior history',
          );
          expect(
            h.chat.state.status,
            failure == 'disk'
                ? AssistantChatStatus.idle
                : AssistantChatStatus.error,
          );
          expect(h.chat.state.diagnostics, isNotNull);
          expect(h.posts, 0);
          expect(h.sends, isEmpty);
        } finally {
          await h.close();
        }
      },
    );
  }
}
