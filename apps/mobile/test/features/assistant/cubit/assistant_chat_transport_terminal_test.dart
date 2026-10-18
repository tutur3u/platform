import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/observability/operational_error_reporter.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {
  String? nativeActor;
  int nativeCalls = 0;
  @override
  Future<http.StreamedResponse> sendJsonStreamAcknowledged(
    String method,
    String path,
    Object? body, {
    required ApiMutationAdmission admission,
    String accept = 'application/octet-stream',
  }) {
    admission.recordDispatchPossible();
    nativeActor = admission.actorId;
    nativeCalls++;
    return sendJsonStream(method, path, body, accept: accept);
  }
}

class _Preferences extends Mock implements AssistantPreferences {}

class _Repository extends AssistantRepository {
  _Repository(_Api api)
    : super(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: ChatRepository(apiClient: api),
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      );
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(id: chatId),
    messages: const [],
    attachmentsByMessageId: const {},
  );
  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [];
  @override
  Future<void> writeAssistantChatCache({
    required String wsId,
    required String chatId,
    required AssistantRestoredChat restored,
  }) async {}
}

void main() {
  for (final legacy in [false, true]) {
    for (final failed in [false, true]) {
      test('real ${legacy ? 'legacy SSE' : 'native chat'} transport: '
          '${failed ? 'explicit failure' : 'durable completion'}', () async {
        final api = _Api();
        String? legacyRequestId;
        when(() => api.postJson('/api/ai/chat/restore', any())).thenAnswer(
          (_) async => {
            'chat': {'id': '11111111-1111-4111-8111-111111111111'},
            'messages': legacyRequestId == null
                ? <dynamic>[]
                : [
                    {
                      'id': '33333333-3333-4333-8333-333333333333',
                      'role': 'USER',
                      'content': 'Synthetic prompt',
                      'metadata': {
                        'requestId': legacyRequestId,
                        'source': 'Mira',
                        'requestText': 'Synthetic prompt',
                      },
                    },
                  ],
          },
        );
        when(
          () => api.getJson(
            '/api/v1/workspaces/ws/chat/conversations/11111111-1111-4111-8111'
            '-111111111111/ai-settings',
          ),
        ).thenAnswer(
          (_) async => {
            'settings': {
              'conversationId': '11111111-1111-4111-8111-111111111111',
              'modelId': 'model',
              'creditSource': 'workspace',
              'thinkingMode': 'thinking',
            },
          },
        );
        final body = failed
            ? '{"type":"assistant_delta","delta":"Partial"}\n'
                  '{"type":"error","message":"Not saved"}\n'
                  '{"type":"error","message":"private@example.com token"}\n'
                  '{"type":"done"}\n'
            : '{"type":"assistant_delta","delta":"Saved answer"}\n'
                  '{"type":"messages","messages":[{"id":"22222222-2222-4222-8'
                  '222-222222222222",'
                  '"conversationId":"11111111-1111-4111-8111-111111111111","k'
                  'ind":"assistant",'
                  '"metadata":{},"createdAt":"2026-10-12T00:00:00Z",'
                  '"content":"Saved answer"}]}\n{"type":"done"}\nnot-json\n';
        when(
          () => api.sendJsonStream(
            'POST',
            '/api/v1/workspaces/ws/chat/conversations/11111111-1111-4111-8111'
                '-111111111111/messages',
            any(),
            accept: 'application/x-ndjson',
          ),
        ).thenAnswer((call) async {
          final request = call.positionalArguments[2] as Map<String, dynamic>;
          final user = jsonEncode({
            'type': 'message',
            'message': {
              'id': '44444444-4444-4444-8444-444444444444',
              'conversationId': '11111111-1111-4111-8111-111111111111',
              'senderId': api.nativeActor,
              'kind': 'user',
              'content': request['content'],
              'attachments': request['attachments'],
              'metadata': {'clientRequestId': request['clientRequestId']},
              'createdAt': '2026-10-12T00:00:00Z',
            },
          });
          return http.StreamedResponse(
            Stream.value(utf8.encode(failed ? body : '$user\n$body')),
            201,
            headers: {'content-type': 'application/x-ndjson'},
          );
        });
        if (legacy) {
          when(
            () => api.sendJsonStream(
              'POST',
              '/api/v1/workspaces/ws/chat/conversations/11111111-1111-4111-81'
                  '11-111111111111/messages',
              any(),
              accept: 'application/x-ndjson',
            ),
          ).thenThrow(const ApiException(message: 'legacy', statusCode: 404));
          final sse = failed
              ? 'data: {"type":"error","errorText":"Not saved"}\n\n'
                    'data: {"type":"error","errorText":"private token"}\n\n'
                    'data: [DONE]\n\n'
              : 'data: {"type":"start", '
                    '"messageId":"22222222-2222-4222-8222-222222222222"}\n\n'
                    'data: {"type":"text-delta","delta":"Saved answer"}\n\n'
                    'data: [DONE]\n\n';
          when(
            () => api.sendJsonStream(
              'POST',
              '/api/ai/chat',
              any(),
              accept: 'text/event-stream',
            ),
          ).thenAnswer((invocation) async {
            final body =
                invocation.positionalArguments[2] as Map<String, dynamic>;
            legacyRequestId = body['persistenceRequestId'] as String;
            return http.StreamedResponse(Stream.value(utf8.encode(sse)), 200);
          });
        }
        final preferences = _Preferences();
        when(() => preferences.loadChatId('ws')).thenAnswer(
          (_) async => legacy
              ? 'ai-chat-11111111-1111-4111-8111-111111111111'
              : '11111111-1111-4111-8111-111111111111',
        );
        final events = <OperationalErrorEvent>[];
        final cubit = AssistantChatCubit(
          operationalReporter: OperationalErrorReporter(
            sink: (event) async {
              events.add(event);
            },
          ),
          repository: _Repository(api),
          preferences: preferences,
          onWorkspaceContextChanged: (_) async {},
          onSoulRefreshRequested: () async {},
          onImmersiveModeChanged: (_) {},
          onChatRestored: (_) async {},
        );
        addTearDown(cubit.close);
        await cubit.loadWorkspace('ws');
        await cubit.submit(
          wsId: 'ws',
          message: 'Synthetic prompt',
          modelId: 'model',
          thinkingMode: AssistantThinkingMode.thinking,
          creditSource: AssistantCreditSource.workspace,
          workspaceContextId: 'ws',
          timezone: 'UTC',
        );
        final settled = await cubit.stream
            .firstWhere(
              (state) =>
                  state.status == AssistantChatStatus.error ||
                  (state.status == AssistantChatStatus.idle &&
                      state.messages.any((m) => m.role == 'assistant')),
            )
            .timeout(const Duration(seconds: 2));
        expect(api.nativeCalls, legacy ? 0 : 1);
        if (failed) {
          expect(settled.status, AssistantChatStatus.error);
          expect(settled.diagnostics?.kind, 'stream');
          expect(settled.error, 'Not saved');
          expect(events, hasLength(1));
          expect(events.single.phase, OperationalPhase.assistantReply);
          expect(events.single.kind, OperationalFailureKind.stream);
          expect(events.single.fields.toString(), isNot(contains('Not saved')));
          expect(events.single.fields.toString(), isNot(contains('private')));
        } else {
          expect(settled.status, AssistantChatStatus.idle);
          expect(settled.error, isNull);
          expect(settled.diagnostics, isNull);
          expect(
            settled.messages.last.id,
            '22222222-2222-4222-8222-222222222222',
          );
          expect(events, isEmpty);
        }
      });
    }
  }
}
