import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/local/assistant_remote_chat_actions.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

import 'assistant_chat_creation_harness.dart';

const known = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

// Queue controls record cache snapshots; they do not exercise disk caching.
class _QueueRepository extends CreationRepository {
  _QueueRepository(super.api, super.actor) : super(nativeRestore: true);
  final snapshots = <AssistantRestoredChat>[];
  @override
  Future<AssistantChatCachePublication> publishAssistantChatSnapshot({
    required AssistantChatCacheOrigin origin,
    required AssistantRestoredChat restored,
  }) async {
    snapshots.add(restored);
    return const AssistantChatCachePublication(
      AssistantChatCacheStatus.published,
    );
  }
}

class _HeldSelectionStore extends InMemorySharedPreferencesStore {
  _HeldSelectionStore() : super.withData({});
  final oldEntered = Completer<void>();
  final knownEntered = Completer<void>();
  final oldRelease = Completer<void>();
  final knownRelease = Completer<void>();
  bool hold = false;
  @override
  Future<bool> setValue(String type, String key, Object value) async {
    if (hold && key == 'flutter.$actorId::mira-dashboard-chat-$ws') {
      if (value == saved) {
        oldEntered.complete();
        await oldRelease.future;
      } else if (value == known) {
        knownEntered.complete();
        await knownRelease.future;
      }
    }
    return await super.setValue(type, key, value);
  }

  void release() {
    if (!oldRelease.isCompleted) oldRelease.complete();
    if (!knownRelease.isCompleted) knownRelease.complete();
  }
}

void main() {
  late CreationHarness h;
  late _HeldSelectionStore store;
  setUp(() async {
    store = _HeldSelectionStore();
    h = CreationHarness(nativeRestore: true, hostStore: store);
    await h.setup();
  });
  tearDown(() async {
    store.release();
    await h.close();
  });
  const draftAttachment = AssistantAttachment(
    id: 'draft-file',
    name: 'fixture.txt',
    size: 1,
    type: 'text/plain',
    storagePath: 'synthetic/draft',
    uploadState: AssistantAttachmentUploadState.uploaded,
  );
  for (final order in ['elapsed', 'held', 'rapid']) {
    test(
      'selection retires only pre-debounce typed request ($order)',
      () async {
        await h.chat.close();
        final repository = _QueueRepository(h.api, h.actor);
        h.repository = repository;
        h.chat = AssistantChatCubit(
          repository: repository,
          preferences: AssistantPreferences(currentUserId: () => h.actor.id),
          onWorkspaceContextChanged: (_) async {},
          onSoulRefreshRequested: () async {},
          onImmersiveModeChanged: (_) {},
          onChatRestored: (_) async {},
        );
        await h.chat.loadWorkspace(ws);
        for (final id in [saved, known]) {
          when(
            () => h.api.getJson(
              '/api/v1/workspaces/$ws/chat/conversations/$id/ai-settings',
            ),
          ).thenAnswer(
            (_) async => {
              'settings': {
                'conversationId': id,
                'modelId': 'model',
                'thinkingMode': 'thinking',
                'creditSource': 'workspace',
                'creditWsId': ws,
              },
            },
          );
        }
        await h.chat.openChatById(ws, saved);
        h.chat.emit(
          h.chat.state.copyWith(composerAttachments: const [draftAttachment]),
        );
        final queued = h.chat.stream.firstWhere(
          (s) => s.queuedMessages.isNotEmpty,
        );
        final old = h.send();
        await queued;
        final gate = Completer<void>();
        if (order != 'elapsed') h.historyGate = gate.future;
        final opening = h.chat.openChatById(ws, known);
        expect((await old).disposition, AssistantSubmissionDisposition.stale);
        expect(h.chat.state.composerAttachments, const [draftAttachment]);
        expect(h.sends, isEmpty);
        if (order != 'elapsed') {
          await h.historyEntered.future;
          if (order == 'rapid') {
            h.historyGate = null;
            await h.chat.openChatById(ws, saved);
          }
          gate.complete();
        }
        await opening;
        final selected = order == 'rapid' ? saved : known;
        if (order == 'elapsed') {
          await Future<void>.delayed(const Duration(milliseconds: 300));
        }
        expect(h.chat.state.queuedMessages, isEmpty);
        expect(h.chat.state.storedChatId, selected);
        expect(h.chat.state.messages.single.parts.single.text, 'Known history');
        expect(h.chat.state.composerAttachments, const [draftAttachment]);
        expect(h.sends, isEmpty);
        const shell = AssistantShellState(
          selectedModel: AssistantGatewayModel(
            value: 'model',
            label: 'fixture',
            provider: 'synthetic',
          ),
          workspaceContextId: ws,
        );
        expect(
          await submitAssistantRemoteChat(
            h.chat,
            shell,
            wsId: ws,
            message: 'Current draft',
            isCurrent: () => true,
            resolveTimezone: () async => 'UTC',
          ),
          true,
        );
        await Future<void>.delayed(const Duration(milliseconds: 300));
        expect(h.sends, hasLength(1));
        expect(h.sends.single['conversationId'], selected);
        expect(h.sends.single['content'], 'Current draft');
        final user = h.chat.state.messages.singleWhere((m) => m.role == 'user');
        expect(user.clientRequestId, h.sends.single['clientRequestId']);
        expect(h.chat.state.composerAttachments, isEmpty);
        expect(h.chat.state.attachmentsByMessageId[user.id], const [
          draftAttachment,
        ]);
        expect(
          await AssistantPreferences(
            currentUserId: () => h.actor.id,
          ).loadChatId(ws),
          selected,
        );
        expect(repository.snapshots, isNotEmpty);
        expect(h.posts, 0);
      },
    );
  }
  for (final boundary in ['actor', 'workspace', 'close']) {
    test('pre-debounce retirement respects $boundary lifecycle', () async {
      await h.chat.openChatById(ws, saved);
      h.chat.emit(
        h.chat.state.copyWith(composerAttachments: const [draftAttachment]),
      );
      final queued = h.chat.stream.firstWhere(
        (s) => s.queuedMessages.isNotEmpty,
      );
      final old = h.send();
      await queued;
      if (boundary == 'close') {
        await h.chat.close();
        expect(h.chat.state.composerAttachments, const [draftAttachment]);
      } else {
        if (boundary == 'actor') h.actor.id = otherActor;
        await h.chat.loadWorkspace(otherWs);
        await h.chat.openChatById(otherWs, known);
        expect(h.chat.state.workspaceId, otherWs);
        expect(h.chat.state.storedChatId, known);
        // Switching actors/workspaces preserves the existing isolation rule.
        expect(h.chat.state.composerAttachments, isEmpty);
      }
      expect((await old).disposition, AssistantSubmissionDisposition.stale);
      await Future<void>.delayed(const Duration(milliseconds: 300));
      if (!h.chat.isClosed) expect(h.chat.state.queuedMessages, isEmpty);
      expect(h.sends, isEmpty);
      expect(h.posts, 0);
    });
  }
  Future<void> assertSelection() async {
    final prefs = AssistantPreferences(currentUserId: () => h.actor.id);
    expect(h.chat.state.storedChatId, known);
    expect(h.chat.state.messages.single.parts.single.text, 'Known history');
    expect(await prefs.loadChatId(ws), known);
    expect(h.repository.uploads, isEmpty);
    expect(h.sends, isEmpty);
    expect(h.posts, 1);
    expect(await h.repository.hasUnknownChatCreation(ws), true);
    await h.chat.close();
    h.chat = AssistantChatCubit(
      repository: h.repository,
      preferences: prefs,
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    await h.chat.loadWorkspace(ws);
    expect(h.chat.state.storedChatId, known);
    expect(h.chat.state.messages.single.parts.single.text, 'Known history');
  }

  test(
    'late HTTP creation receipt cannot overwrite opened known chat',
    () async {
      final upload = h.attach();
      await h.started.future;
      await h.chat.openChatById(ws, known);
      h.response.complete(h.receipt());
      await upload;
      await assertSelection();
    },
  );
  for (final newFirst in [false, true]) {
    test(
      'held old preference write drains before current selection ($newFirst)',
      () async {
        store.hold = true;
        final upload = h.attach();
        await h.started.future;
        h.response.complete(h.receipt());
        await store.oldEntered.future;
        final selected = h.chat.stream.firstWhere(
          (state) => state.storedChatId == known,
        );
        final opening = h.chat.openChatById(ws, known);
        await selected;
        if (newFirst) store.knownRelease.complete();
        store.oldRelease.complete();
        if (!newFirst) {
          await store.knownEntered.future;
          store.knownRelease.complete();
        }
        await opening;
        await upload;
        store.hold = false;
        await assertSelection();
      },
    );
  }
  test(
    'stopped send plus late creation preserves the newly opened selection',
    () async {
      final pending = h.send();
      await Future<void>.delayed(Duration.zero);
      final upload = h.attach();
      await h.started.future;
      await Future<void>.delayed(const Duration(milliseconds: 300));
      await h.chat.stopStreaming();
      expect((await pending).acknowledged, false);
      await h.chat.openChatById(ws, known);
      final attachments = h.chat.state.composerAttachments;
      h.response.complete(h.receipt());
      await upload;
      expect(h.chat.state.composerAttachments, attachments);
      await assertSelection();
    },
  );
  for (final changeActor in [false, true]) {
    test(
      'stale restoration cannot transfer current selection ($changeActor)',
      () async {
        final upload = h.attach();
        await h.started.future;
        final history = Completer<void>();
        h.historyGate = history.future;
        final opening = h.chat.openChatById(ws, known);
        await h.historyEntered.future;
        h.historyGate = null;
        if (changeActor) h.actor.id = otherActor;
        await h.chat.loadWorkspace(otherWs);
        const current = '77777777-7777-4777-8777-777777777777';
        await h.chat.openChatById(otherWs, current);
        history.complete();
        await opening;
        h.response.complete(h.receipt());
        await upload;
        expect(h.chat.state.workspaceId, otherWs);
        expect(h.chat.state.storedChatId, current);
        expect(h.chat.state.messages.single.parts.single.text, 'Known history');
        final prefs = AssistantPreferences(currentUserId: () => h.actor.id);
        expect(await prefs.loadChatId(otherWs), current);
        expect(
          await AssistantPreferences(
            currentUserId: () => actorId,
          ).loadChatId(ws),
          isNull,
        );
        expect(h.repository.uploads, isEmpty);
        expect(h.sends, isEmpty);
        expect(h.posts, 1);
      },
    );
  }
}
