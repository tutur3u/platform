import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Api extends Mock implements ApiClient {
  @override
  Future<Map<String, dynamic>> postJsonAcknowledged(
    String path,
    Map<String, dynamic> body, {
    required String actorId,
    required bool Function() isCurrent,
  }) {
    if (!isCurrent()) throw StateError('Synthetic retired creation');
    return postJson(path, body);
  }
}

class _Chats extends Mock implements ChatRepository {}

const ws = '11111111-1111-4111-8111-111111111111';
const chat = '22222222-2222-4222-8222-222222222222';
void main() {
  setUpAll(() => registerFallbackValue(() => true));
  late _Api api;
  late _Chats chats;
  late AssistantRepository repository;
  setUp(() async {
    SharedPreferences.setMockInitialValues({
      '33333333-3333-4333-8333-333333333333::'
          'mira-conversation-envelope::v1::$ws': jsonEncode({
        'schema': 1,
        'actorId': '33333333-3333-4333-8333-333333333333',
        'workspaceId': ws,
        'revision': 1,
        'generation': 1,
        'selectedChatId': null,
        'contextId': null,
        'creation': {'status': 'clear', 'attemptId': null},
        'resetConsent': null,
        'resetIntent': null,
      }),
    });
    // Each fixture uses the actual informed protocol, never legacy adoption.
    final resetStore = AssistantResetPreferences(
      actorId: '33333333-3333-4333-8333-333333333333',
      workspaceId: ws,
      isCurrent: () => true,
    );
    final consentTarget = await resetStore.inspectResetConsentTarget();
    final reset = await resetStore.reset(
      '77777777-7777-4777-8777-777777777777',
      informed: true,
      consentTarget: consentTarget,
    );
    if (!reset.committedCurrent) {
      throw StateError('Synthetic reset not confirmed');
    }
    api = _Api();
    chats = _Chats();
    repository = AssistantRepository(
      apiClient: api,
      tasksApiClient: api,
      chatRepository: chats,
      currentUserId: () => '33333333-3333-4333-8333-333333333333',
    );
    when(
      () => api.getJson(
        '/api/v1/workspaces/$ws/chat/conversations/$chat/ai-settings',
      ),
    ).thenAnswer(
      (_) async => {
        'settings': {
          'conversationId': chat,
          'modelId': 'synthetic/model',
          'creditSource': 'workspace',
          'creditWsId': null,
          'thinkingMode': 'thinking',
        },
      },
    );
    when(() => api.postJson('/api/ai/chat/restore', any())).thenThrow(
      const ApiException(message: 'Synthetic unavailable', statusCode: 503),
    );
  });
  for (final status in [401, 403, 429, 500, 503]) {
    test('native restore $status preserves failure instead of selecting legacy '
        'or clearing history', () async {
      when(() => chats.listMessages(ws, chat)).thenThrow(
        ApiException(message: 'Synthetic failure', statusCode: status),
      );
      await expectLater(
        repository.restoreChat(wsId: ws, chatId: chat, forceRefresh: true),
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'status', status),
        ),
      );
      verifyNever(() => api.postJson(any(), any()));
    });
    test('native settings $status never starts legacy generation', () async {
      when(
        () => api.getJson(
          '/api/v1/workspaces/$ws/chat/conversations/$chat/ai-settings',
        ),
      ).thenThrow(
        ApiException(message: 'Synthetic failure', statusCode: status),
      );
      final streaming = AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: ChatRepository(apiClient: api),
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      );
      when(
        () => api.sendJsonStream(
          any(),
          any(),
          any(),
          accept: any(named: 'accept'),
        ),
      ).thenThrow(
        const ApiException(message: 'Legacy route was called', statusCode: 418),
      );
      await expectLater(
        streaming.streamChat(
          chatId: chat,
          wsId: ws,
          workspaceContextId: ws,
          modelId: 'synthetic/model',
          messages: const [],
          thinkingMode: AssistantThinkingMode.thinking,
          creditSource: AssistantCreditSource.workspace,
          timezone: 'UTC',
        ),
        emitsError(
          isA<ApiException>().having((e) => e.statusCode, 'status', status),
        ),
      );
      verifyNever(
        () => api.sendJsonStream(
          any(),
          any(),
          any(),
          accept: any(named: 'accept'),
        ),
      );
    });
  }
  test(
    'pending-shaped response is not a durable HTTP creation receipt',
    () async {
      when(
        () => api.postJson('/api/v1/workspaces/$ws/chat/conversations', any()),
      ).thenAnswer(
        (_) async => {
          'conversation': {
            'id': chat,
            'ws_id': ws,
            'type': 'ai',
            'updated_at': '2026-10-12T00:00:00Z',
          },
        },
      );
      final direct = AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: ChatRepository(apiClient: api),
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      );
      await expectLater(
        direct.createChat(
          id: chat,
          wsId: ws,
          modelId: 'synthetic/model',
          message: 'Synthetic prompt',
          timezone: 'UTC',
        ),
        throwsA(isA<FormatException>()),
      );
    },
  );
  test('route identity never changes stores after a failure', () {
    expect(AssistantChatRoute.parse(chat).kind, AssistantChatRouteKind.native);
    expect(
      AssistantChatRoute.parse('ai-chat-$chat').kind,
      AssistantChatRouteKind.legacy,
    );
    expect(AssistantChatRoute.parse('legacy-ai-$chat').storageId, chat);
    for (final id in ['', 'chat', 'ai-chat-invalid', 'ai-agent-thread-$chat']) {
      expect(() => AssistantChatRoute.parse(id), throwsFormatException);
    }
  });
  test(
    'create send reopen follow-up reopen retains replies and attachments',
    () async {
      const attachment = AssistantAttachment(
        id: '66666666-6666-4666-8666-000000000001',
        name: 'context.txt',
        size: 12,
        type: 'text/plain',
        storagePath: 'chats/$chat/context.txt',
        uploadState: AssistantAttachmentUploadState.uploaded,
      );
      final saved = <Map<String, dynamic>>[];
      var calls = 0;
      var requests = 0;
      final receipts = <String, List<Map<String, dynamic>>>{};
      when(
        () => api.postJson('/api/v1/workspaces/$ws/chat/conversations', any()),
      ).thenAnswer(
        (_) async => {
          'conversation': {
            'id': chat,
            'wsId': ws,
            'type': 'ai',
            'createdAt': '2026-10-12T00:00:00Z',
            'updatedAt': '2026-10-12T00:00:00Z',
          },
        },
      );
      when(
        () => api.patchJson(
          '/api/v1/workspaces/$ws/chat/conversations/$chat/ai-settings',
          any(),
        ),
      ).thenAnswer(
        (_) async => {
          'settings': {
            'conversationId': chat,
            'modelId': 'synthetic/model',
            'creditSource': 'workspace',
            'creditWsId': null,
            'thinkingMode': 'thinking',
          },
        },
      );
      when(() => api.getJson(any())).thenAnswer(
        (invocation) async =>
            invocation.positionalArguments.single.toString().endsWith(
              '/ai-settings',
            )
            ? {
                'settings': {
                  'conversationId': chat,
                  'modelId': 'synthetic/model',
                  'creditSource': 'workspace',
                  'creditWsId': null,
                  'thinkingMode': 'thinking',
                },
              }
            : {'messages': saved},
      );
      when(
        () => api.sendJsonStream(
          'POST',
          '/api/v1/workspaces/$ws/chat/conversations/$chat/messages',
          any(),
          accept: 'application/x-ndjson',
        ),
      ).thenAnswer((invocation) async {
        final body = invocation.positionalArguments[2] as Map<String, dynamic>;
        requests++;
        final request = body['clientRequestId'] as String;
        final existing = receipts[request];
        if (existing != null) {
          expect(existing.first['content'], body['content']);
          final userReceipt = jsonEncode({
            'type': 'message',
            'message': existing.first,
          });
          return http.StreamedResponse(
            Stream.value(
              utf8.encode(
                '$userReceipt\n${jsonEncode({
                  'type': 'messages',
                  'messages': [existing.last],
                })}\n{"type":"done"}\n',
              ),
            ),
            201,
            headers: {'content-type': 'application/x-ndjson'},
          );
        }
        calls++;
        final userId =
            '33333333-3333-4333-8333-${calls.toString().padLeft(12, '0')}';
        final replyId =
            '44444444-4444-4444-8444-${calls.toString().padLeft(12, '0')}';
        saved.add({
          'id': userId,
          'conversationId': chat,
          'kind': 'user',
          'content': body['content'],
          'metadata': {'clientRequestId': body['clientRequestId']},
          'attachments': [
            for (final draft in body['attachments'] as List<dynamic>)
              {
                ...draft as Map<String, dynamic>,
                'id': '66666666-6666-4666-8666-000000000001',
                'conversationId': chat,
                'messageId': userId,
                'storagePath': draft['path'],
              },
          ],
          'createdAt': '2026-10-12T00:00:00Z',
        });
        final reply = {
          'id': replyId,
          'conversationId': chat,
          'kind': 'assistant',
          'metadata': {
            'ai': {
              'parts': [
                {'type': 'text', 'text': 'Synthetic reply $calls'},
              ],
            },
          },
          'content': 'Synthetic reply $calls',
          'createdAt': '2026-10-12T00:00:00Z',
        };
        saved.add(reply);
        receipts[request] = saved.sublist(saved.length - 2);
        final userReceipt = jsonEncode({
          'type': 'message',
          'message': saved[saved.length - 2],
        });
        return http.StreamedResponse(
          Stream.value(
            utf8.encode(
              '$userReceipt\n${jsonEncode({
                'type': 'messages',
                'messages': [reply],
              })}\n{"type":"done"}\n',
            ),
          ),
          201,
          headers: {'content-type': 'application/x-ndjson'},
        );
      });
      AssistantRepository fresh() => AssistantRepository(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: ChatRepository(apiClient: api),
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      );
      final created = await fresh().createChat(
        id: chat,
        wsId: ws,
        modelId: 'synthetic/model',
        message: 'First',
        timezone: 'UTC',
      );
      expect(created.id, chat);
      for (var turn = 1; turn <= 2; turn++) {
        final prior = turn == 1
            ? <AssistantMessage>[]
            : (await fresh().restoreChat(
                wsId: ws,
                chatId: chat,
                forceRefresh: true,
              ))!.messages;
        final requestId =
            '55555555-5555-4555-8555-${turn.toString().padLeft(12, '0')}';
        await fresh()
            .streamChat(
              chatId: chat,
              wsId: ws,
              workspaceContextId: ws,
              modelId: 'synthetic/model',
              messages: [
                ...prior,
                AssistantMessage(
                  id: requestId,
                  role: 'user',
                  parts: [
                    AssistantMessagePart(type: 'text', text: 'Prompt $turn'),
                  ],
                ),
              ],
              thinkingMode: AssistantThinkingMode.thinking,
              creditSource: AssistantCreditSource.workspace,
              timezone: 'UTC',
              attachments: [attachment],
            )
            .toList();
        final reopened = await fresh().restoreChat(
          wsId: ws,
          chatId: chat,
          forceRefresh: true,
        );
        expect(
          reopened!.messages.map((message) => message.id),
          saved.map((row) => row['id']),
        );
        expect(reopened.messages.length, turn * 2);
        expect(
          reopened.messages
              .where((message) => message.role == 'assistant')
              .map((message) => message.parts.single.text),
          [
            for (var index = 1; index <= turn; index++)
              'Synthetic reply $index',
          ],
        );
        for (final message in reopened.messages.where(
          (m) => m.role == 'user',
        )) {
          final attachment =
              reopened.attachmentsByMessageId[message.id]!.single;
          expect(attachment.storagePath, 'chats/$chat/context.txt');
          expect(attachment.name, 'context.txt');
        }
        expect(saved[saved.length - 2]['metadata'], {
          'clientRequestId': requestId,
        });
      }
      final reopened = (await fresh().restoreChat(
        wsId: ws,
        chatId: chat,
        forceRefresh: true,
      ))!;
      expect(
        reopened.messages.first.clientRequestId,
        '55555555-5555-4555-8555-000000000001',
      );
      await fresh()
          .streamChat(
            chatId: chat,
            wsId: ws,
            workspaceContextId: ws,
            modelId: 'synthetic/model',
            messages: [reopened.messages.first],
            attachments: [attachment],
            thinkingMode: AssistantThinkingMode.thinking,
            creditSource: AssistantCreditSource.workspace,
            timezone: 'UTC',
          )
          .toList();
      expect(requests, 3);
      expect(calls, 2);
      expect(saved, hasLength(4));
      verifyNever(() => api.postJson('/api/ai/chat/restore', any()));
    },
  );
  test('saved user receipt preserves attachment ownership and original request '
      'identity', () {
    const original = '55555555-5555-4555-8555-000000000001';
    const server = '33333333-3333-4333-8333-000000000001';
    const attachment = AssistantAttachment(
      id: 'attachment',
      name: 'fixture.png',
      size: 4,
      type: 'image/png',
      storagePath: 'chats/$chat/fixture.png',
      uploadState: AssistantAttachmentUploadState.uploaded,
    );
    const message = AssistantMessage(
      id: original,
      role: 'user',
      clientRequestId: original,
      parts: [AssistantMessagePart(type: 'text', text: 'Fixture')],
    );
    final result = reconcileAssistantUserReceipt(
      [message],
      {
        original: [attachment],
      },
      requestId: original,
      savedId: server,
      savedText: 'Fixture',
    )!;
    expect(result.messages.single.id, server);
    expect(result.messages.single.clientRequestId, original);
    expect(result.attachments, {
      server: [attachment],
    });
    expect(
      () => reconcileAssistantUserReceipt(
        [message],
        {},
        requestId: original,
        savedId: server,
        savedText: 'Changed',
      ),
      throwsFormatException,
    );
    expect(
      () => assistantClientRequestId({'clientRequestId': 42}),
      throwsFormatException,
    );
    expect(
      () => assistantClientRequestId({'clientRequestId': 'not-a-request'}),
      throwsFormatException,
    );
  });
  test('generic parser preserves its existing coercion compatibility', () {
    final events = ChatNdjsonStreamParser().addChunk(
      utf8.encode(
        '${jsonEncode({
          'type': 'message',
          'message': {'id': 42, 'kind': 'unknown'},
        })}\n',
      ),
    );
    expect((events.single as ChatStreamMessageEvent).message.id, '42');
  });
  for (final ndjson in [true, false]) {
    for (final variant in [
      'valid',
      for (final offset in ['+24:60', '+23:60', '-24:00', '+00:60', '-23:60'])
        'offset:$offset',
      for (final offset in ['+00:00', '+07:30', '-05:45', '+23:59'])
        'valid-offset:$offset',
      'kind',
      'missing-kind',
      'numeric-kind',
      'id',
      'conversation',
      'content',
      'timestamp',
      'missing-timestamp',
      'calendar',
      'metadata',
      'request',
      'batch-row',
      'batch-kind',
    ]) {
      test(
        'actual native ${ndjson ? 'NDJSON' : 'JSON'} receipt: $variant',
        () async {
          const request = '33333333-3333-4333-8333-333333333333';
          final user = <String, dynamic>{
            'id': '44444444-4444-4444-8444-444444444444',
            'conversationId': chat,
            'kind': 'user',
            'content': 'Synthetic',
            'createdAt': '2026-10-12T00:00:00Z',
            'metadata': {'clientRequestId': request},
          };
          final reply = <String, dynamic>{
            ...user,
            'id': '55555555-5555-4555-8555-555555555555',
            'kind': 'assistant',
            'content': 'Synthetic reply',
            'metadata': <String, dynamic>{},
          };
          if (variant.startsWith('offset:') ||
              variant.startsWith('valid-offset:')) {
            user['createdAt'] =
                '2026-10-13T10:00:00${variant.split(':').skip(1).join(':')}';
          }
          switch (variant) {
            case 'kind':
              user['kind'] = 'not-a-message-kind';
            case 'missing-kind':
              user.remove('kind');
            case 'numeric-kind':
              user['kind'] = 1;
            case 'id':
              user['id'] = 42;
            case 'conversation':
              user['conversationId'] = ws;
            case 'content':
              user['content'] = 42;
            case 'timestamp':
              user['createdAt'] = 42;
            case 'missing-timestamp':
              user.remove('createdAt');
            case 'calendar':
              user['createdAt'] = '2026-02-31T00:00:00Z';
            case 'metadata':
              user['metadata'] = <Object>[];
            case 'request':
              user['metadata'] = {'clientRequestId': 42};
            case 'batch-kind':
              reply['kind'] = 'unknown';
          }
          final batch = <Object>[user, reply, if (variant == 'batch-row') 42];
          final encodedBatch = jsonEncode({
            'type': 'messages',
            'messages': batch,
          });
          when(() => api.getJson(any())).thenAnswer(
            (_) async => {
              'settings': {
                'conversationId': chat,
                'modelId': 'synthetic/model',
                'thinkingMode': 'thinking',
                'creditSource': 'workspace',
              },
            },
          );
          when(
            () => api.sendJsonStream(
              'POST',
              any(),
              any(),
              accept: 'application/x-ndjson',
            ),
          ).thenAnswer(
            (_) async => http.StreamedResponse(
              Stream.value(
                utf8.encode(
                  ndjson
                      ? '$encodedBatch\n'
                            '${jsonEncode({'type': 'done'})}\n'
                      : jsonEncode({'messages': batch}),
                ),
              ),
              201,
              headers: {
                'content-type': ndjson
                    ? 'application/x-ndjson'
                    : 'application/json',
              },
            ),
          );
          final actual = AssistantRepository(
            apiClient: api,
            tasksApiClient: api,
            chatRepository: ChatRepository(apiClient: api),
          );
          final events = actual
              .streamChat(
                chatId: chat,
                wsId: ws,
                workspaceContextId: ws,
                modelId: 'synthetic/model',
                messages: const [
                  AssistantMessage(
                    id: request,
                    clientRequestId: request,
                    role: 'user',
                    parts: [
                      AssistantMessagePart(type: 'text', text: 'Synthetic'),
                    ],
                  ),
                ],
                thinkingMode: AssistantThinkingMode.thinking,
                creditSource: AssistantCreditSource.workspace,
                timezone: 'UTC',
              )
              .toList();
          if (variant != 'valid' && !variant.startsWith('valid-offset:')) {
            await expectLater(events, throwsFormatException);
          } else {
            final actualEvents = await events;
            final types = actualEvents
                .whereType<AssistantJsonStreamEvent>()
                .map((event) => event.payload['type'])
                .toList();
            expect(
              types,
              containsAllInOrder([
                'saved-user-message',
                'start',
                'saved-messages',
              ]),
            );
            expect(actualEvents.last, isA<AssistantDoneStreamEvent>());
          }
        },
      );
    }
  }
}
