import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparer_registry.dart';
import 'package:mobile/core/feature_flags/mobile_flag.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/mira_offline_preparation.dart';
import 'package:mobile/features/assistant/data/mira_offline_reads.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_chat_feedback.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Preferences extends Mock implements AssistantPreferences {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final master in [false, true]) {
    for (final enabled in [false, true]) {
      test('registration master=$master chat=$enabled', () async {
        final registry = OfflinePreparerRegistry(
          isEnabled: (flag) =>
              flag == MobileFlag.mobileOffline ? master : enabled,
        );
        var calls = 0;
        MiraOfflinePreparation.register(registry, (_) async {
          calls++;
        });
        expect(registry.containsKey('mira'), master && enabled);
        await registry['mira']?.call('ws');
        expect(calls, master && enabled ? 1 : 0);
      });
    }
  }
  late Directory directory;
  late CacheStore store;
  late _Api api;
  var owner = 'user';
  const id = '11111111-1111-4111-8111-111111111111';
  const base = '/api/v1/workspaces/ws/chat/conversations';
  const listPath = '$base?archived=active&limit=40&offset=0';
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('chat-offline-');
    FlutterSecureStorage.setMockInitialValues({});
    store = CacheStore.forTesting(
      secureStorage: const FlutterSecureStorage(),
      directoryResolver: () async => directory,
    );
    await store.init();
    owner = 'user';
    api = _Api();
    when(() => api.checkUser(any())).thenReturn(null);
    when(() => api.getJson(listPath)).thenAnswer(
      (_) async => {
        'conversations': List.generate(
          40,
          (i) => {'id': i == 0 ? id : 'c$i', 'type': 'ai'},
        ),
      },
    );
    for (var i = 0; i < 10; i++) {
      final cid = i == 0 ? id : 'c$i';
      when(() => api.getJson('$base/$cid/ai-settings')).thenAnswer(
        (_) async => {
          'settings': {
            'conversationId': cid,
            'modelId': 'model',
            'creditSource': 'personal',
            'creditWsId': null,
            'thinkingMode': 'fast',
          },
        },
      );
      when(() => api.getJson('$base/$cid/messages?limit=60')).thenAnswer(
        (_) async => {
          'messages': [
            {
              'id': '22222222-2222-4222-8222-222222222222',
              'conversationId': cid,
              'content': 'Prepared reply',
              'kind': 'text',
            },
          ],
        },
      );
    }
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> prepare() => MiraOfflinePreparation(
    api: api,
    store: store,
    currentUser: () => owner,
  ).prepare('ws');

  test(
    'prepared Mira opens a cold cubit offline and retains other pages',
    () async {
      const other = CacheKey(
        namespace: 'mira.messages',
        userId: 'user',
        workspaceId: 'ws',
        params: {'path': 'older-page'},
      );
      await store.write(
        key: other,
        policy: CachePolicies.offlineCatalog,
        payload: {'messages': <Object?>[]},
      );
      await prepare();
      expect(
        (await store.read<Object?>(key: other, decode: (v) => v)).hasValue,
        isTrue,
      );
      verify(() => api.getJson(any())).called(21);
      when(
        () => api.getJson(any()),
      ).thenThrow(const SocketException('offline'));
      final repository = AssistantRepository(
        apiClient: api,
        chatCacheStore: store,
        currentUserId: () => owner,
        offlineReadEnabled: () => true,
      );
      final list = await repository.fetchRecentChats(wsId: 'ws', limit: 20);
      final restored = await repository.restoreChat(wsId: 'ws', chatId: id);
      expect(list, hasLength(20));
      expect(restored?.chat?.id, id);
      expect(restored?.settings?.modelId, 'model');
      expect(restored?.messages, hasLength(1));
      final preferences = _Preferences();
      when(() => preferences.loadChatId('ws')).thenAnswer((_) async => id);
      when(
        () => preferences.saveChatId(
          'ws',
          id,
          shouldWrite: any(named: 'shouldWrite'),
        ),
      ).thenAnswer((_) async {});
      final cold = AssistantChatCubit(
        repository: repository,
        preferences: preferences,
        onWorkspaceContextChanged: (_) async {},
        onSoulRefreshRequested: () async {},
        onImmersiveModeChanged: (_) {},
        onChatRestored: (_) async {},
      );
      addTearDown(cold.close);
      await cold.loadWorkspace('ws');
      expect(cold.state.status, AssistantChatStatus.idle);
      expect(cold.state.chat?.id, id);
      expect(cold.state.hasLoadedOnce, isTrue);
      expect(cold.state.messages.single.parts.single.text, 'Prepared reply');
      expect(cold.state.history, isNotEmpty);
      await cold.openChatById('ws', id);
      expect(cold.state.status, AssistantChatStatus.idle);
      when(() => api.getJson('$base/$id/ai-settings')).thenAnswer(
        (_) async => {
          'settings': {
            'conversationId': id,
            'modelId': 'fresh-model',
            'creditSource': 'personal',
            'creditWsId': null,
            'thinkingMode': 'fast',
          },
        },
      );
      when(() => api.getJson('$base/$id/messages?limit=60')).thenAnswer(
        (_) async => {
          'messages': [
            {
              'id': '22222222-2222-4222-8222-222222222222',
              'conversationId': id,
              'content': 'Fresh reply',
              'kind': 'text',
            },
          ],
        },
      );
      await cold.openChatById('ws', id);
      final freshModel = cold.state.chat?.model;
      final freshText = cold.state.messages.single.parts.single.text;
      final origin = repository.captureChatCacheOrigin(
        wsId: 'ws',
        chatId: id,
        isCurrent: () => true,
      )!;
      when(
        () => api.getJson('$base/$id/ai-settings'),
      ).thenThrow(const ApiException(message: 'Denied', statusCode: 403));
      await cold.openChatById('ws', id);
      expect(cold.state.status, AssistantChatStatus.error);
      expect(freshModel, 'fresh-model');
      expect(freshText, 'Fresh reply');
      expect(origin.isCurrent(), isFalse);
      expect(
        (await store.read<Object?>(key: origin.key, decode: (v) => v)).hasValue,
        isFalse,
      );

      await Future<void>.delayed(Duration.zero);
    },
  );
  test(
    'connected empty native history shows legacy without persisting it',
    () async {
      when(
        () => api.getJson(listPath),
      ).thenAnswer((_) async => {'conversations': <Object?>[]});
      when(() => api.getJsonList('/api/v1/ai/chats')).thenAnswer(
        (_) async => [
          {'id': id, 'title': 'Legacy history'},
        ],
      );
      final repository = AssistantRepository(
        apiClient: api,
        chatCacheStore: store,
        currentUserId: () => owner,
        offlineReadEnabled: () => true,
        networkAvailable: () async => true,
      );
      final history = await repository.fetchRecentChats(wsId: 'ws');
      expect(history.single.title, 'Legacy history');
      expect(history.single.id, 'ai-chat-$id');
      final legacyKey = CacheKey(
        namespace: 'assistant.recent_chats',
        userId: currentCacheUserId(),
        workspaceId: 'ws',
        locale: currentCacheLocaleTag(),
        params: const {'limit': 'all'},
      );
      expect(
        CacheStore.instance
            .peek<Object?>(key: legacyKey, decode: (v) => v)
            .hasValue,
        isFalse,
      );
      expect(
        (await store.read<Object?>(key: legacyKey, decode: (v) => v)).hasValue,
        isFalse,
      );
      verify(() => api.getJsonList('/api/v1/ai/chats')).called(1);
    },
  );

  for (final enabled in [false, true]) {
    test('legacy offline flag=$enabled', () async {
      final repository = AssistantRepository(
        apiClient: api,
        chatCacheStore: store,
        currentUserId: () => owner,
        offlineReadEnabled: () => enabled,
        networkAvailable: () async => false,
      );
      final result = repository.restoreChat(wsId: 'ws', chatId: 'ai-chat-$id');
      await expectLater(
        result,
        enabled
            ? throwsA(isA<MiraLegacyOffline>())
            : throwsA(isNot(isA<MiraLegacyOffline>())),
      );
    });
  }
  for (final locale in ['en', 'vi']) {
    testWidgets('localized legacy offline state $locale', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: Locale(locale),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: const Scaffold(
            body: AssistantChatFeedback(
              state: AssistantChatState(
                fallbackChatId: 'fallback',
                status: AssistantChatStatus.error,
                error: MiraLegacyOffline.code,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text(
          locale == 'en'
              ? 'Not available offline'
              : 'Không khả dụng khi ngoại tuyến',
        ),
        findsOneWidget,
      );
    });
  }
}
