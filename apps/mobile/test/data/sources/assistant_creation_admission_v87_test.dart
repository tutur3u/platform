import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/api_verification.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Client extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'creation retired generation ABA during actual auth headers prevents POST',
    () async {
      const actor = '33333333-3333-4333-8333-333333333333';
      const ws = '22222222-2222-4222-8222-222222222222';
      const user = User(
        id: actor,
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01',
      );
      SharedPreferences.setMockInitialValues({
        '$actor::mira-conversation-envelope::v1::$ws': jsonEncode({
          'schema': 1,
          'actorId': actor,
          'workspaceId': ws,
          'revision': 1,
          'generation': 1,
          'selectedChatId': null,
          'contextId': ws,
          'creation': {'status': 'clear', 'attemptId': null},
          'resetConsent': null,
          'resetIntent': null,
        }),
      });
      final client = _Client();
      final auth = _Auth();
      final session = _Session();
      final entered = Completer<void>();
      final refresh = Completer<AuthResponse>();
      when(() => client.auth).thenReturn(auth);
      when(() => auth.currentUser).thenReturn(user);
      when(() => auth.currentSession).thenReturn(session);
      when(() => session.accessToken).thenReturn('fixture');
      when(() => session.expiresAt).thenReturn(0);
      when(auth.refreshSession).thenAnswer((_) {
        if (!entered.isCompleted) entered.complete();
        return refresh.future;
      });
      var posts = 0;
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: MockClient((r) async {
          posts++;
          return http.Response(
            jsonEncode({
              'conversation': {
                'id': '44444444-4444-4444-8444-444444444444',
                'wsId': ws,
                'type': 'ai',
                'createdAt': '2026-01-01',
              },
            }),
            201,
          );
        }),
      );
      addTearDown(api.dispose);
      final repository = AssistantRepository(
        apiClient: api,
        currentUserId: () => actor,
      );
      final result = repository.createChat(
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        wsId: ws,
        modelId: 'fixture/model',
        message: 'Draft',
        timezone: 'UTC',
      );
      final observed = expectLater(result, throwsA(isA<Exception>()));
      await entered.future;
      repository
        ..invalidateChatCreation()
        ..invalidateChatCreation();
      refresh.complete(AuthResponse(session: session, user: user));
      await observed;
      expect(posts, 0);
      expect(await repository.hasUnknownChatCreation(ws), isTrue);
    },
  );
  for (final departure in ['open', 'workspace', 'close', 'workspace ABA']) {
    test(
      'actual cubit $departure during creation auth await prevents POST',
      () async {
        const actor = '33333333-3333-4333-8333-333333333333';
        final suffix = (departure.length + departure.codeUnitAt(0))
            .toString()
            .padLeft(12, '0');
        final ws = '77777777-7777-4777-8777-$suffix';
        const otherWs = '99999999-9999-4999-8999-999999999999';
        const user = User(
          id: actor,
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2026-01-01',
        );
        SharedPreferences.setMockInitialValues({
          '$actor::mira-conversation-envelope::v1::$ws': jsonEncode({
            'schema': 1,
            'actorId': actor,
            'workspaceId': ws,
            'revision': 1,
            'generation': 1,
            'selectedChatId': null,
            'contextId': ws,
            'creation': {'status': 'clear', 'attemptId': null},
            'resetConsent': null,
            'resetIntent': null,
          }),
        });
        final client = _Client();
        final auth = _Auth();
        final session = _Session();
        when(() => client.auth).thenReturn(auth);
        when(() => auth.currentUser).thenReturn(user);
        when(() => auth.currentSession).thenReturn(session);
        when(() => session.accessToken).thenReturn('fixture');
        when(() => session.expiresAt).thenReturn(0);
        final entered = Completer<void>();
        final refresh = Completer<AuthResponse>();
        when(auth.refreshSession).thenAnswer((_) {
          if (!entered.isCompleted) entered.complete();
          return refresh.future;
        });
        var posts = 0;
        final api = ApiClient(
          baseUrl: 'https://example.test',
          authClient: client,
          httpClient: MockClient((_) async {
            posts++;
            return http.Response('{}', 201);
          }),
        );
        addTearDown(api.dispose);
        final repository = LifecycleRepository(api, actor);
        final chat = AssistantChatCubit(
          repository: repository,
          preferences: AssistantPreferences(currentUserId: () => actor),
          onWorkspaceContextChanged: (_) async {},
          onSoulRefreshRequested: () async {},
          onImmersiveModeChanged: (_) {},
          onChatRestored: (_) async {},
        );
        await chat.loadWorkspace(ws);
        final create = repository.createChat(
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          wsId: ws,
          modelId: 'fixture/model',
          message: 'Held',
          timezone: 'UTC',
        );
        final observed = expectLater(create, throwsA(isA<Exception>()));
        await entered.future;
        if (departure == 'open') {
          await chat.openChatById(ws, '44444444-4444-4444-8444-444444444444');
        } else if (departure == 'close') {
          await chat.close();
        } else {
          await chat.loadWorkspace(otherWs);
          if (departure == 'workspace ABA') await chat.loadWorkspace(ws);
        }
        refresh.complete(AuthResponse(session: session, user: user));
        await observed;
        expect(posts, 0);
        expect(await repository.hasUnknownChatCreation(ws), isTrue);
        if (!chat.isClosed) await chat.close();
      },
    );
  }
  for (final status in [200, 401, 403, 429, 500]) {
    test('creation POST authenticated HTTP $status '
        'has one dispatch without challenge replay', () async {
      const actor = '33333333-3333-4333-8333-333333333333';
      const user = User(
        id: actor,
        appMetadata: {},
        userMetadata: {},
        aud: 'authenticated',
        createdAt: '2026-01-01',
      );
      final client = _Client();
      final auth = _Auth();
      final session = _Session();
      when(() => client.auth).thenReturn(auth);
      when(() => auth.currentUser).thenReturn(user);
      when(() => auth.currentSession).thenReturn(session);
      when(() => session.accessToken).thenReturn('fixture');
      when(() => session.expiresAt).thenReturn(
        DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/
            1000,
      );
      var posts = 0;
      var prompts = 0;
      ApiVerification.requestToken = () async {
        prompts++;
        return 'fixture';
      };
      addTearDown(() => ApiVerification.requestToken = null);
      final api = ApiClient(
        baseUrl: 'https://example.test',
        authClient: client,
        httpClient: MockClient((req) async {
          posts++;
          expect(req.method, 'POST');
          expect(req.headers['authorization'], 'Bearer fixture');
          return http.Response(
            '{}',
            status,
            headers: status == 403 ? {'x-abuse-challenge': 'turnstile'} : {},
          );
        }),
      );
      addTearDown(api.dispose);
      final result = api.postJsonAcknowledged(
        '/create',
        {},
        actorId: actor,
        isCurrent: () => true,
      );
      if (status == 200) {
        expect(await result, isEmpty);
      } else {
        await expectLater(result, throwsA(isA<ApiException>()));
      }
      expect(posts, 1);
      expect(prompts, 0);
      verifyNever(auth.refreshSession);
    });
  }
}

class LifecycleRepository extends AssistantRepository {
  LifecycleRepository(ApiClient api, String actor)
    : super(apiClient: api, currentUserId: () => actor);
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => null;
  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [];
}
