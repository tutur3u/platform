import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

const actor = '33333333-3333-4333-8333-333333333333';
const workspace = '11111111-1111-4111-8111-111111111111';
const saved = '22222222-2222-4222-8222-222222222222';
const envelopeKey = '$actor::mira-conversation-envelope::v1::$workspace';

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

class _Host extends InMemorySharedPreferencesStore {
  _Host()
    : super.withData({
        'flutter.$envelopeKey': jsonEncode({
          'schema': 1,
          'actorId': actor,
          'workspaceId': workspace,
          'revision': 1,
          'generation': 1,
          'selectedChatId': saved,
          'contextId': 'prior',
          'creation': {'status': 'clear', 'attemptId': null},
          'resetIntent': null,
          'resetConsent': null,
        }),
      });
  int? heldBoundary;
  int writes = 0;
  final entered = Completer<void>();
  final release = Completer<void>();
  @override
  Future<bool> setValue(String type, String key, Object value) async {
    if (key == 'flutter.$envelopeKey' && ++writes == heldBoundary) {
      entered.complete();
      await release.future;
    }
    return await super.setValue(type, key, value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final boundary in [1, 2]) {
    test(
      'close entry fences reset boundary $boundary before cancel completes',
      () async {
        SharedPreferences.resetStatic();
        AssistantResetPreferences.revokeConsent(envelopeKey);
        final host = _Host();
        SharedPreferencesStorePlatform.instance = host;
        final api = _Api();
        final repository = AssistantRepository(
          apiClient: api,
          tasksApiClient: api,
          currentUserId: () => actor,
        );
        final prefs = AssistantPreferences(currentUserId: () => actor);
        final shell =
            AssistantShellCubit(repository: repository, preferences: prefs)
              ..emit(
                const AssistantShellState(
                  workspace: Workspace(id: workspace),
                  workspaceContextId: 'prior',
                ),
              );
        var notifications = 0;
        final chat = AssistantChatCubit(
          repository: repository,
          preferences: prefs,
          prepareResetWorkspaceContext: shell.prepareResetWorkspaceContext,
          onWorkspaceContextChanged: (_) async {},
          onSoulRefreshRequested: () async {},
          onImmersiveModeChanged: (_) {},
          onChatRestored: (_) async {
            notifications++;
          },
        );
        chat.emit(
          chat.state.copyWith(
            workspaceId: workspace,
            storedChatId: saved,
            chat: const AssistantChatRecord(id: saved),
          ),
        );
        final cancellationEntered = Completer<void>();
        final cancelRelease = Completer<void>();
        final body = StreamController<List<int>>();
        var listened = false;
        body.onCancel = () {
          if (!cancellationEntered.isCompleted) cancellationEntered.complete();
          return cancelRelease.future;
        };
        when(() => api.getJson(any())).thenAnswer(
          (_) async => {
            'settings': {
              'conversationId': saved,
              'modelId': 'model',
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
        ).thenAnswer((call) async {
          final request = call.positionalArguments[2] as Map<String, dynamic>;
          final sender = api.nativeActor ?? actor;
          body.onListen = () {
            listened = true;
            body.add(
              utf8.encode(
                '${jsonEncode({
                  'type': 'message',
                  'message': {
                    'id': '44444444-4444-4444-8444-444444444444',
                    'conversationId': saved,
                    'kind': 'user',
                    'senderId': sender,
                    'attachments': request['attachments'],
                    'content': request['content'],
                    'createdAt': '2026-10-12T00:00:00Z',
                    'metadata': {'clientRequestId': request['clientRequestId']},
                  },
                })}\n',
              ),
            );
          };
          return http.StreamedResponse(
            body.stream,
            201,
            headers: {'content-type': 'application/x-ndjson'},
          );
        });
        var posts = 0;
        when(() => api.postJson(any(), any())).thenAnswer((_) async {
          posts++;
          throw const ApiException.transport(
            message: 'Synthetic forbidden admission',
          );
        });
        Future<void>? closing;
        try {
          final userAck = await chat.submitAcknowledged(
            wsId: workspace,
            message: 'Synthetic existing-chat turn',
            modelId: 'model',
            thinkingMode: AssistantThinkingMode.thinking,
            creditSource: AssistantCreditSource.workspace,
            workspaceContextId: workspace,
            timezone: 'UTC',
          );
          expect(userAck.acknowledged, true);
          expect(api.nativeCalls, 1);
          expect(listened, isTrue);
          final before = chat.state;
          final consentTarget = await chat.inspectResetConsentTarget(workspace);
          host
            ..writes = 0
            ..heldBoundary = boundary;
          final reset = chat.resetConversationAcknowledged(
            workspace,
            acknowledgeUnknownCreation: true,
            consentTarget: consentTarget,
          );
          await host.entered.future;
          closing = chat.close();
          host.release.complete();
          final outcome = await reset;
          final visible = chat.state;
          final shellContext = shell.state.workspaceContextId;
          final observedNotifications = notifications;
          // Complete only this synthetic response after recording the reset
          // outcome, so native wrappers can drain their held cancellation.
          final finalReply = {
            'type': 'message',
            'message': {
              'id': '55555555-5555-4555-8555-555555555555',
              'conversationId': saved,
              'kind': 'assistant',
              'content': 'Synthetic final fixture reply',
              'createdAt': '2026-10-12T00:00:00Z',
              'metadata': <String, dynamic>{},
            },
          };
          body
            ..add(utf8.encode('${jsonEncode(finalReply)}\n'))
            ..add(utf8.encode('{"type":"done"}\n'));
          final bodyClosed = body.close();
          await cancellationEntered.future;
          cancelRelease.complete();
          await closing;
          await bodyClosed;
          final fresh = AssistantRepository(
            apiClient: api,
            tasksApiClient: api,
            currentUserId: () => actor,
          );
          final held = await fresh.hasUnknownChatCreation(workspace);
          Object? creationError;
          try {
            await fresh.createChat(
              id: before.fallbackChatId,
              wsId: workspace,
              modelId: 'model',
              message: 'Synthetic forbidden new chat',
              timezone: 'UTC',
            );
          } on Object catch (error) {
            creationError = error;
          }
          expect(posts, 0);
          expect(held, true);
          expect(creationError, isNotNull);
          expect(
            outcome.disposition,
            boundary == 1
                ? AssistantResetDisposition.uncertain
                : AssistantResetDisposition.committedStale,
          );
          expect(visible.chat, before.chat);
          expect(visible.messages, before.messages);
          expect(visible.fallbackChatId, before.fallbackChatId);
          expect(shellContext, 'prior');
          expect(observedNotifications, 0);
        } finally {
          if (!host.release.isCompleted) host.release.complete();
          if (!cancelRelease.isCompleted) cancelRelease.complete();
          if (closing != null) await closing;
          if (!chat.isClosed) await chat.close();
          await shell.close();
          // If preparation denied before transport subscribed, drain only this
          // fixture's unused body so cleanup cannot mask the primary assertion.
          if (!listened) body.stream.listen((_) {});
          await body.close();
        }
      },
    );
  }
}
