import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_settings_selection.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';

import '../data/assistant_chat_cache_harness.dart';

class _Api extends Mock implements ApiClient {}

class _Chats extends Mock implements ChatRepository {}

class _Preferences extends Mock implements AssistantPreferences {}

class _Repository extends AssistantRepository {
  _Repository(_Api api, _Chats chats, ChatCacheDisk disk)
    : super(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: chats,
        chatCacheStore: disk.store,
        currentUserId: () => actor,
      );
  @override
  Future<bool> hasUnknownChatCreation(String wsId) async => false;
  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [];
}

const actor = '33333333-3333-4333-8333-333333333333';
const ws = '11111111-1111-4111-8111-111111111111';
const chat = '44444444-4444-4444-8444-444444444444';
const replyId = '99999999-9999-4999-8999-999999999999';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => registerFallbackValue(() => true));
  for (final scenario in ['stay', 'navigate', 'settings']) {
    final leave = scenario == 'navigate';
    final changeSettings = scenario == 'settings';
    test('cached reopen revalidation '
        '$scenario publishes only current history', () async {
      final disk = ChatCacheDisk();
      await disk.setup();
      final api = _Api();
      final chats = _Chats();
      final preferences = _Preferences();
      final repository = _Repository(api, chats, disk);
      final origin = repository.captureChatCacheOrigin(
        wsId: ws,
        chatId: chat,
        isCurrent: () => true,
      )!;
      await repository.publishAssistantChatSnapshot(
        origin: origin,
        restored: const AssistantRestoredChat(
          chat: AssistantChatRecord(id: chat),
          settings: AssistantConversationSettings(
            modelId: 'model',
            creditSource: AssistantCreditSource.workspace,
            creditWsId: null,
            thinkingMode: AssistantThinkingMode.fast,
          ),
          messages: [],
          attachmentsByMessageId: {},
        ),
      );
      when(() => preferences.loadChatId(ws)).thenAnswer((_) async => chat);
      when(() => preferences.loadChatId('other')).thenAnswer((_) async => null);
      when(
        () => api.getJson(
          '/api/v1/workspaces/$ws/chat/conversations/$chat/ai-settings',
        ),
      ).thenAnswer(
        (_) async => {
          'settings': {
            'conversationId': chat,
            'modelId': 'model',
            'creditSource': 'workspace',
            'thinkingMode': 'fast',
            'creditWsId': null,
          },
        },
      );
      final readback = Completer<List<ChatMessage>>();
      when(
        () => chats.listMessages(ws, chat),
      ).thenAnswer((_) => readback.future);
      final publishedSettings = <AssistantConversationSettings?>[];
      final cubit = AssistantChatCubit(
        repository: repository,
        preferences: preferences,
        onSettingsRestored: publishedSettings.add,
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {},
      );
      try {
        await cubit.loadWorkspace(ws);
        expect(cubit.state.chat?.id, chat);
        expect(cubit.state.messages, isEmpty);
        expect(readback.isCompleted, false);
        if (leave) await cubit.loadWorkspace('other');
        if (changeSettings) {
          when(
            () => api.patchJsonAcknowledged(
              '/api/v1/workspaces/$ws/chat/conversations/$chat/ai-settings',
              any(),
              actorId: actor,
              isCurrent: any(named: 'isCurrent'),
            ),
          ).thenAnswer(
            (_) async => {
              'settings': {
                'conversationId': chat,
                'modelId': 'new-model',
                'creditSource': 'workspace',
                'creditWsId': ws,
                'thinkingMode': 'fast',
              },
            },
          );
          expect(
            await repository.acknowledgeSettingsSelection(
              actorId: actor,
              wsId: ws,
              chatId: chat,
              selection: const AssistantSettingsSelection(
                modelId: 'new-model',
                creditSource: AssistantCreditSource.workspace,
                creditWsId: ws,
                thinkingMode: AssistantThinkingMode.fast,
              ),
              isCurrent: () => true,
            ),
            AssistantSettingsDisposition.acknowledged,
          );
        }
        readback.complete([
          ChatMessage.fromJson(const {
            'id': replyId,
            'conversationId': chat,
            'kind': 'assistant',
            'content': 'Saved while away',
            'createdAt': '2026-10-23T00:00:00Z',
            'metadata': <String, dynamic>{},
          }),
        ]);
        await repository.drainAssistantChatCache();
        if (leave) {
          expect(cubit.state.workspaceId, 'other');
          expect(cubit.state.messages, isEmpty);
        } else if (changeSettings) {
          expect(cubit.state.messages, isEmpty);
          expect(publishedSettings, hasLength(1));
        } else {
          expect(cubit.state.messages.single.id, replyId);
          expect(
            cubit.state.messages.single.parts.single.text,
            'Saved while away',
          );
        }
      } finally {
        await cubit.close();
        await repository.drainAssistantChatCache();
        await disk.close();
      }
    });
  }
}
