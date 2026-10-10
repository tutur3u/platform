import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/observability/operational_error_reporter.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Preferences extends Mock implements AssistantPreferences {}

class _Repository extends AssistantRepository {
  _Repository(_Api api)
    : super(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: ChatRepository(apiClient: api),
      );
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
  }) async => const AssistantRestoredChat(
    chat: AssistantChatRecord(id: 'chat'),
    messages: [],
    attachmentsByMessageId: {},
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
        when(
          () => api.patchJson(
            '/api/v1/workspaces/ws/chat/conversations/chat/ai-settings',
            any(),
          ),
        ).thenAnswer((_) async => {});
        final body = failed
            ? '{"type":"assistant_delta","delta":"Partial"}\n'
                  '{"type":"error","message":"Not saved"}\n'
                  '{"type":"error","message":"private@example.com token"}\n'
                  '{"type":"done"}\n'
            : '{"type":"assistant_delta","delta":"Saved answer"}\n'
                  '{"type":"messages","messages":[{"id":"saved-reply",'
                  '"conversationId":"chat","kind":"assistant",'
                  '"content":"Saved answer"}]}\n{"type":"done"}\nnot-json\n';
        when(
          () => api.sendJsonStream(
            'POST',
            '/api/v1/workspaces/ws/chat/conversations/chat/messages',
            any(),
            accept: 'application/x-ndjson',
          ),
        ).thenAnswer(
          (_) async => http.StreamedResponse(
            Stream.value(utf8.encode(body)),
            201,
            headers: {'content-type': 'application/x-ndjson'},
          ),
        );
        if (legacy) {
          when(
            () => api.sendJsonStream(
              'POST',
              '/api/v1/workspaces/ws/chat/conversations/chat/messages',
              any(),
              accept: 'application/x-ndjson',
            ),
          ).thenThrow(const ApiException(message: 'legacy', statusCode: 404));
          final sse = failed
              ? 'data: {"type":"error","errorText":"Not saved"}\n\n'
                    'data: {"type":"error","errorText":"private token"}\n\n'
                    'data: [DONE]\n\n'
              : 'data: {"type":"start","messageId":"saved-reply"}\n\n'
                    'data: {"type":"text-delta","delta":"Saved answer"}\n\n'
                    'data: [DONE]\n\n';
          when(
            () => api.sendJsonStream(
              'POST',
              '/api/ai/chat',
              any(),
              accept: 'text/event-stream',
            ),
          ).thenAnswer(
            (_) async =>
                http.StreamedResponse(Stream.value(utf8.encode(sse)), 200),
          );
        }
        final preferences = _Preferences();
        when(
          () => preferences.loadChatId('ws'),
        ).thenAnswer((_) async => 'chat');
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
          expect(settled.messages.last.id, 'saved-reply');
          expect(events, isEmpty);
        }
      });
    }
  }
}
