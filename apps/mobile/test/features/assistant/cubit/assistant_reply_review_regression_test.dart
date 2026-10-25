import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';

import 'assistant_chat_persistence_actions_harness.dart';

const _savedUser = '77777777-7777-4777-8777-777777777777';
const _text = 'The same reply text';
const _replyB = AssistantMessage(
  id: actionOther,
  role: 'assistant',
  isPersisted: true,
  parts: [AssistantMessagePart(type: 'text', text: 'Another saved answer')],
);

class _HeldMessageTransport extends ChatRepository {
  _HeldMessageTransport(ActionsApi api) : super(apiClient: api);
  final started = Completer<void>();
  final retryStarted = Completer<void>();
  final bodies = <StreamController<ChatMessageStreamEvent>>[];
  StreamController<ChatMessageStreamEvent> get body => bodies.last;
  final requests = <({String? request, String? reply, String text})>[];

  @override
  Stream<ChatMessageStreamEvent> sendMessageStream(
    String wsId,
    String conversationId, {
    required String content,
    ChatMessageKind kind = ChatMessageKind.user,
    List<ChatAttachmentDraft> attachments = const [],
    String? replyToMessageId,
    String? clientRequestId,
    bool miraMode = false,
    ApiMutationAdmission? admission,
  }) {
    expect(wsId, actionWorkspace);
    expect(conversationId, actionChat);
    expect(miraMode, isTrue);
    expect(admission?.actorId, actionActor);
    admission?.recordDispatchPossible();
    requests.add((
      request: clientRequestId,
      reply: replyToMessageId,
      text: content,
    ));
    final response = StreamController<ChatMessageStreamEvent>(
      onListen: () {
        if (!started.isCompleted) started.complete();
        if (requests.length == 2 && !retryStarted.isCompleted) {
          retryStarted.complete();
        }
      },
    );
    bodies.add(response);
    return response.stream;
  }
}

// Only restored storage and cache publication are substituted. Native send and
// pending-receipt reconciliation run through the production repository.
class _RestoredReplyRepository extends AssistantRepository {
  _RestoredReplyRepository(ActionsApi api, _HeldMessageTransport transport)
    : super(
        apiClient: api,
        tasksApiClient: api,
        chatRepository: transport,
        currentUserId: () => actionActor,
      );

  @override
  Future<bool> hasUnknownChatCreation(String wsId) async => false;

  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [];

  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(id: chatId),
    messages: const [actionRow, _replyB],
    attachmentsByMessageId: const {},
  );

  @override
  AssistantChatCacheOrigin? captureChatCacheOrigin({
    required String wsId,
    required String chatId,
    required bool Function() isCurrent,
  }) => null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() => registerFallbackValue(() => true));
  late ActionsApi api;
  late _HeldMessageTransport transport;
  late AssistantChatCubit cubit;
  var receiptReads = 0;
  var settingsReads = 0;

  Map<String, dynamic> receipt() => {
    'id': _savedUser,
    'conversationId': actionChat,
    'content': _text,
    'kind': 'user',
    'createdAt': '2026-10-25T00:00:00.000Z',
    'senderId': actionActor,
    'metadata': {'clientRequestId': transport.requests.single.request},
    'replyToMessageId': actionMessage,
    'attachments': <Map<String, dynamic>>[],
    'reactions': <Map<String, dynamic>>[],
  };

  Future<AssistantSubmissionOutcome> submit() => cubit.submitAcknowledged(
    wsId: actionWorkspace,
    message: _text,
    modelId: 'model',
    thinkingMode: AssistantThinkingMode.fast,
    creditSource: AssistantCreditSource.workspace,
    workspaceContextId: actionWorkspace,
    timezone: 'UTC',
  );

  Future<void> waitForTransport(
    Future<AssistantSubmissionOutcome> submission,
  ) async {
    if (cubit.state.status == AssistantChatStatus.error) {
      fail('Native transport blocked: ${cubit.state.error}');
    }

    await Future.any<void>([
      transport.started.future,
      submission.then(
        (outcome) => fail(
          'Send ended before transport: ${outcome.disposition}; '
          '${cubit.state.error}',
        ),
      ),
      cubit.stream
          .firstWhere((state) => state.status == AssistantChatStatus.error)
          .then((state) => fail('Native transport blocked: ${state.error}')),
    ]);
  }

  setUp(() async {
    api = ActionsApi();
    transport = _HeldMessageTransport(api);
    receiptReads = 0;
    settingsReads = 0;
    when(() => api.getJson(any())).thenAnswer((call) async {
      final path = call.positionalArguments.single as String;
      if (path.endsWith('/ai-settings')) {
        settingsReads++;
        return {
          'settings': {
            'conversationId': actionChat,
            'modelId': 'model',
            'creditSource': 'workspace',
            'creditWsId': null,
            'thinkingMode': 'fast',
          },
        };
      }
      expect(
        path,
        '/api/v1/workspaces/$actionWorkspace/chat/conversations/'
        '$actionChat/messages?limit=100',
      );
      receiptReads++;
      return {
        'messages': [receipt()],
      };
    });
    final preferences = ActionsPreferences();
    when(
      () => preferences.saveChatId(
        any(),
        any(),
        shouldWrite: any(named: 'shouldWrite'),
      ),
    ).thenAnswer((_) async {});
    cubit = AssistantChatCubit(
      repository: _RestoredReplyRepository(api, transport),
      preferences: preferences,
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    await cubit.openChatById(actionWorkspace, actionChat);
  });

  tearDown(() async {
    for (final response in transport.bodies) {
      if (!response.isClosed) await response.close();
    }
    await cubit.close();
    transport.dispose();
  });

  test(
    'unknown reply A cannot consume same-text draft newly replying to B',
    () async {
      expect(cubit.setReplyTarget(actionMessage), isTrue);
      final first = submit();
      await waitForTransport(first);
      final original = transport.requests.single;
      expect(original.request, isNotNull);
      expect(original.reply, actionMessage);
      expect(original.text, _text);
      transport.body.add(const ChatStreamErrorEvent('Unknown USER receipt'));
      await transport.body.close();
      expect((await first).disposition, AssistantSubmissionDisposition.unknown);
      final pendingRow = cubit.state.messages.lastWhere(
        (m) => m.role == 'user',
      );
      expect(pendingRow.id, original.request);
      expect(pendingRow.clientRequestId, original.request);
      expect(pendingRow.replyToMessageId, actionMessage);
      expect(pendingRow.isPersisted, isFalse);
      expect(receiptReads, 0);
      expect(settingsReads, 1);

      expect(cubit.setReplyTarget(actionOther), isTrue);
      expect(cubit.replyBlockedByPendingSubmission, isTrue);
      expect(
        (await submit()).disposition,
        AssistantSubmissionDisposition.denied,
      );
      expect(cubit.state.replyTarget, _replyB);
      expect(receiptReads, 0);
      expect(settingsReads, 1);
      expect(transport.requests, [original]);
      expect(cubit.state.messages.where((m) => m.role == 'user'), [pendingRow]);
      expect(identical(cubit.state.messages.last, pendingRow), isTrue);
      expect(pendingRow.parts.single.text, _text);
      expect(pendingRow.replyToMessageId, actionMessage);

      // Clearing the new reply permits original-request reconciliation.
      cubit.clearReplyTarget();
      final reconciled = await submit();
      expect(
        reconciled.disposition,
        AssistantSubmissionDisposition.acknowledged,
      );
      expect(reconciled.requestId, original.request);
      expect(reconciled.messageId, _savedUser);
      expect(receiptReads, 1);
      expect(settingsReads, 1);
      expect(transport.requests, [original]);
      final saved = cubit.state.messages.lastWhere((m) => m.role == 'user');
      expect(saved.id, _savedUser);
      expect(saved.clientRequestId, original.request);
      expect(saved.replyToMessageId, actionMessage);
      expect(saved.isPersisted, isTrue);
    },
  );

  test(
    'USER acknowledgment for A preserves B selected during the pending send',
    () async {
      expect(cubit.setReplyTarget(actionMessage), isTrue);
      final first = submit();
      await waitForTransport(first);
      expect(cubit.setReplyTarget(actionOther), isTrue);
      transport.body.add(
        ChatStreamMessageEvent(ChatMessage.fromJson(receipt())),
      );
      await transport.body.close();

      final outcome = await first;

      expect(outcome.disposition, AssistantSubmissionDisposition.acknowledged);
      expect(outcome.requestId, transport.requests.single.request);
      expect(cubit.state.replyTarget, _replyB);
      final saved = cubit.state.messages.lastWhere((m) => m.role == 'user');
      expect(saved.replyToMessageId, actionMessage);
      expect(saved.isPersisted, isTrue);
      expect(transport.requests, hasLength(1));
      expect(receiptReads, 0);
    },
  );

  test(
    'retryLast keeps draft B while native transport retries original reply A',
    () async {
      expect(cubit.setReplyTarget(actionMessage), isTrue);
      final first = submit();
      await waitForTransport(first);
      final original = transport.requests.single;
      expect(original.request, isNotNull);
      expect(original.reply, actionMessage);
      expect(original.text, _text);
      transport.body.add(
        ChatStreamMessageEvent(ChatMessage.fromJson(receipt())),
      );
      await transport.body.close();
      expect(
        (await first).disposition,
        AssistantSubmissionDisposition.acknowledged,
      );
      final saved = cubit.state.messages.lastWhere((m) => m.role == 'user');
      expect(saved.id, _savedUser);
      expect(saved.clientRequestId, original.request);
      expect(saved.replyToMessageId, actionMessage);
      expect(saved.isPersisted, isTrue);

      expect(cubit.setReplyTarget(actionOther), isTrue);
      await cubit.retryLast(
        wsId: actionWorkspace,
        modelId: 'model',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: actionWorkspace,
        timezone: 'UTC',
      );
      expect(cubit.state.replyTarget, _replyB);
      await transport.retryStarted.future;
      expect(transport.requests, [original, original]);
      expect(cubit.state.replyTarget, _replyB);
      final retried = cubit.state.messages.lastWhere((m) => m.role == 'user');
      expect(retried.id, _savedUser);
      expect(retried.clientRequestId, original.request);
      expect(retried.replyToMessageId, actionMessage);
      expect(retried.parts.single.text, _text);
      expect(cubit.state.messages.where((m) => m.role == 'user'), hasLength(1));
      expect(receiptReads, 0);
    },
  );
}
