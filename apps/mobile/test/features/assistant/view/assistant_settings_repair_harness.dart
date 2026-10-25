import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:http/http.dart' as http;
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_first_message_creation.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'background_reply_harness.dart';

const repairActor = '33333333-3333-4333-8333-333333333333';
const repairWorkspace = '22222222-2222-4222-8222-222222222222';
const repairChat = '44444444-4444-4444-8444-444444444444';

// Real page and creation envelope, provider-free metadata and transport.
class RepairRepository extends ReplyRepository {
  RepairRepository(this.api) : super(apiClient: api);
  final SettingsApi api;
  late final chats = RepairChats(api);
  late final native = AssistantRepository(
    apiClient: api,
    chatRepository: chats,
    currentUserId: () => repairActor,
  );
  @override
  Stream<AssistantStreamEvent> streamChat({
    required String chatId,
    required String wsId,
    required String? workspaceContextId,
    required String modelId,
    required List<AssistantMessage> messages,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String timezone,
    List<AssistantAttachment> attachments = const [],
    String? creditWsId,
    ApiMutationAdmission? admission,
  }) {
    starts++;
    return native.streamChat(
      chatId: chatId,
      wsId: wsId,
      workspaceContextId: workspaceContextId,
      modelId: modelId,
      messages: messages,
      thinkingMode: thinkingMode,
      creditSource: creditSource,
      timezone: timezone,
      attachments: attachments,
      creditWsId: creditWsId,
      admission: admission,
    );
  }

  @override
  Stream<AssistantStreamEvent> streamFirstChat({
    required AssistantFirstMessageCreation creation,
    required String chatId,
    required String wsId,
    required List<AssistantMessage> messages,
    required String timezone,
    required ApiMutationAdmission admission,
  }) {
    starts++;
    api.firstChats = chats;
    return native.streamFirstChat(
      creation: creation,
      chatId: chatId,
      wsId: wsId,
      messages: messages,
      timezone: timezone,
      admission: admission,
    );
  }

  @override
  Future<AssistantChatRecord> createChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
    ChatInitialAiSettings? initialSettings,
    bool Function()? isCurrent,
  }) => native.createChat(
    id: id,
    wsId: wsId,
    modelId: modelId,
    message: message,
    timezone: timezone,
    initialSettings: initialSettings,
    isCurrent: isCurrent,
  );
  @override
  Future<String?> resolvePersonalWorkspaceId({
    bool forceRefresh = false,
  }) async => '55555555-5555-4555-8555-555555555555';
  @override
  Future<AssistantCredits> fetchCredits(
    String wsId, {
    bool forceRefresh = false,
  }) async => const AssistantCredits(remaining: 1000, tier: 'PRO');
  final preferences = AssistantPreferences(currentUserId: () => repairActor);
  @override
  String? get currentActorId => repairActor;
  @override
  Future<bool> hasUnknownChatCreation(String wsId) =>
      preferences.resetStore(wsId).hasUnknownCreation();
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
}

class RepairHarness extends BackgroundReplyHarness {
  RepairHarness({SettingsApi? api})
    : this._(RepairRepository(api ?? SettingsApi()));
  RepairHarness._(this._repository) : super(repository: _repository);
  final RepairRepository _repository;
  @override
  RepairRepository get repository => _repository;
  TextEditingController composer(WidgetTester tester) => tester
      .widget<AssistantComposerDock>(find.byType(AssistantComposerDock))
      .controller;
  Future<void> startNew(WidgetTester tester) async {
    actions.state
        .resolveForLocation('/assistant')
        .firstWhere((action) => action.id == 'assistant-more')
        .onPressed!
        .call();
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(LucideIcons.history));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('assistant-history-new')));
    await tester.pumpAndSettle();
  }
}

class SettingsApi extends ApiClient {
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

  int? rejection;
  bool malformed = false;
  Map<String, dynamic>? overrideReceipt;
  bool uncertain = false;
  Completer<void>? gate;
  final entered = Completer<void>();
  int creates = 0;
  final patchPaths = <String>[];
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    creates++;
    final input = body! as Map<String, dynamic>;
    final createdId = input['id'] as String? ?? repairChat;
    final initial = input['initialAiSettings'] as Map<String, dynamic>?;
    settings = {'conversationId': createdId, ...?initial};
    return {
      'conversation': {
        'id': createdId,
        'wsId': repairWorkspace,
        'type': 'ai',
        'title': 'Fixture',
        'createdBy': repairActor,
        if (initial != null)
          'initialAiSettings': {
            ...initial,
            'conversationId': createdId,
            'wsId': repairWorkspace,
            'actorUserId': repairActor,
          },
        'createdAt': '2026-10-12T00:00:00Z',
      },
    };
  }

  RepairChats? firstChats;
  @override
  Future<http.StreamedResponse> sendJsonStreamAcknowledged(
    String method,
    String path,
    Object? rawBody, {
    required ApiMutationAdmission admission,
    String accept = 'text/event-stream',
  }) async {
    final body = rawBody! as Map<String, dynamic>;
    admission.recordDispatchPossible();
    final chatId = path.split('/')[7];
    final creation = await postJson('/synthetic-first-message', {
      'id': chatId,
      'initialAiSettings': body['initialConversation'],
    });
    final receipt = {...creation, 'creationRequestId': body['clientRequestId']};
    Stream<List<int>> bytes() async* {
      final events = firstChats!.sendMessageStream(
        repairWorkspace,
        chatId,
        content: body['content'] as String,
        clientRequestId: body['clientRequestId'] as String,
        admission: admission,
      );
      await for (final event in events) {
        final Map<String, dynamic> raw;
        if (event is ChatStreamMessageEvent) {
          raw = {'type': 'message', 'message': wireMessage(event.message)};
        } else if (event is ChatStreamMessagesEvent) {
          raw = {
            'type': 'messages',
            'messages': event.messages.map(wireMessage).toList(),
          };
        } else {
          raw = {'type': 'done'};
        }
        yield utf8.encode('${jsonEncode(raw)}\n');
      }
    }

    return http.StreamedResponse(
      bytes(),
      200,
      headers: {
        'content-type': 'application/x-ndjson',
        'x-mira-chat-creation': base64Url.encode(
          utf8.encode(jsonEncode(receipt)),
        ),
      },
    );
  }

  Map<String, dynamic> settings = {};
  int patches = 0;
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async => {
    'settings': {...settings},
  };
  @override
  Future<Map<String, dynamic>> patchJsonAcknowledged(
    String path,
    Map<String, dynamic> body, {
    required String actorId,
    required bool Function() isCurrent,
  }) async {
    if (!isCurrent()) throw StateError('fixture stale admission');
    return await patchJson(path, body);
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String path,
    Map<String, dynamic> body, {
    bool requiresAuth = true,
  }) async {
    patches++;
    patchPaths.add(path);
    if (!entered.isCompleted) entered.complete();
    await gate?.future;
    if (rejection != null) {
      throw ApiException(message: 'fixture denial', statusCode: rejection!);
    }
    if (uncertain) throw StateError('fixture transport uncertain');
    settings.addAll(body);
    if (overrideReceipt != null) return {'settings': overrideReceipt};
    if (malformed) {
      return {
        'settings': {...settings, 'modelId': 'foreign/model'},
      };
    }
    return {
      'settings': {...settings},
    };
  }
}

class RepairChats extends ChatRepository {
  RepairChats(ApiClient api) : super(apiClient: api);
  int sends = 0;
  Completer<void>? acknowledgmentGate;
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
  }) async* {
    admission?.recordDispatchPossible();
    final sender = admission?.actorId ?? repairActor;
    sends++;
    await acknowledgmentGate?.future;
    yield ChatStreamMessageEvent(
      ChatMessage.fromJson({
        'id': '66666666-6666-4666-8666-666666666666',
        'conversationId': conversationId,
        'senderId': sender,
        'attachments': attachments.map((a) => a.toJson()).toList(),
        'kind': 'user',
        'content': content,
        'createdAt': '2026-10-12T00:00:00Z',
        'metadata': {'clientRequestId': clientRequestId},
      }),
    );
    yield ChatStreamMessagesEvent([
      ChatMessage.fromJson({
        'id': '77777777-7777-4777-8777-777777777777',
        'conversationId': conversationId,
        'kind': 'assistant',
        'content': 'Saved reply',
        'createdAt': '2026-10-12T00:00:00Z',
        'metadata': const <String, dynamic>{},
      }),
    ]);
    yield const ChatStreamDoneEvent();
  }
}

Map<String, dynamic> wireMessage(ChatMessage message) => {
  'id': message.id,
  'conversationId': message.conversationId,
  'kind': message.kind.name,
  'senderId': message.senderId,
  'content': message.content,
  'createdAt': message.createdAt?.toUtc().toIso8601String(),
  'metadata': message.metadata,
  'attachments': <Object>[],
};
