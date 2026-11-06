import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'assistant_settings_repair_harness.dart';
import 'background_reply_harness.dart';

const chatB = '88888888-8888-4888-8888-888888888888';
const legacyChat = 'ai-chat-$repairChat';

class V87Api extends SettingsApi {
  final tuples = <String, Map<String, dynamic>>{
    repairChat: {
      'conversationId': repairChat,
      'modelId': 'synthetic/model-a',
      'creditSource': 'workspace',
      'creditWsId': null,
      'thinkingMode': 'fast',
    },
    chatB: {
      'conversationId': chatB,
      'modelId': 'synthetic/model-b',
      'creditSource': 'personal',
      'creditWsId': '55555555-5555-4555-8555-555555555555',
      'thinkingMode': 'thinking',
    },
  };
  final users = <Map<String, dynamic>>[];
  final streamBodies = <Map<String, dynamic>>[];
  bool omitDurableSave = false;
  bool augmentedContent = false;
  bool originalTextMetadata = true;
  String? wrongRequestText;
  bool hideReceipt = false;
  bool failAfterSave = false;
  bool modelFailure = false;
  Completer<void>? restoreGate;
  final restoreEntered = Completer<void>();
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    final tuple = {
      ...tuples.entries.firstWhere((e) => path.contains(e.key)).value,
    };
    if (path.contains(repairChat) && restoreGate != null) {
      if (!restoreEntered.isCompleted) restoreEntered.complete();
      await restoreGate!.future;
    }
    return {'settings': tuple};
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    if (path == '/api/ai/chat/restore') {
      return {
        'chat': {'id': repairChat, 'model': 'synthetic/model-a'},
        'messages': hideReceipt
            ? <dynamic>[]
            : users.map((e) => {...e}).toList(),
      };
    }
    if (path == '/api/ai/chat/file-urls') return {'files': <dynamic>[]};
    return await super.postJson(
      path,
      body,
      requiresAuth: requiresAuth,
      timeout: timeout,
    );
  }

  @override
  Future<http.StreamedResponse> sendJsonStream(
    String method,
    String path,
    Object? body, {
    String accept = 'application/octet-stream',
    bool requiresAuth = true,
  }) async {
    final payload = body! as Map<String, dynamic>;
    streamBodies.add(payload);
    final messages = payload['messages'] as List;
    final latest = messages.cast<Map<String, dynamic>>().lastWhere(
      (e) => e['role'] == 'user',
    );
    final parts = latest['parts'] as List;
    final text = parts
        .cast<Map<String, dynamic>>()
        .where((e) => e['type'] == 'text')
        .map((e) => e['text'])
        .join();
    final request = payload['persistenceRequestId'];
    if (!omitDurableSave &&
        !users.any(
          (e) =>
              (e['metadata'] as Map)['requestId'] == request && request != null,
        )) {
      final suffix = users.length.toString().padLeft(12, '0');
      users.add({
        'id': '66666666-6666-4666-8666-$suffix',
        'role': 'USER',
        'content': augmentedContent ? '$text\n[File: attached]' : text,
        'creator_id': repairActor,
        'metadata': {
          'requestId': request,
          'source': 'Mira',
          if (originalTextMetadata) 'requestText': wrongRequestText ?? text,
        },
        'created_at': '2026-10-12T00:00:00Z',
      });
    }
    if (failAfterSave) throw TimeoutException('Synthetic lost stream response');
    final modelError = modelFailure
        ? 'data: {"type":"error","errorText":"Model failed"}\n\n'
        : '';
    // AI SDK server-shaped SSE: no custom saved-user-message event.
    return http.StreamedResponse(
      Stream.value(
        utf8.encode(
          'data: {"type":"start","messageId":"reply"}\n\n'
          'data: {"type":"text-start","id":"text"}\n\n'
          'data: {"type":"text-delta","id":"text","delta":"Saved reply"}\n\n'
          'data: {"type":"text-end","id":"text"}\n\n'
          '$modelError'
          'data: {"type":"finish"}\n\ndata: [DONE]\n\n',
        ),
      ),
      200,
    );
  }
}

class V87Chats extends RepairChats {
  V87Chats(super.api);
  @override
  Future<List<ChatMessage>> listMessages(
    String wsId,
    String conversationId, {
    int limit = 60,
    String? before,
  }) async {
    if (conversationId == repairChat || conversationId == chatB) return [];
    throw const ApiException(
      message: 'Legacy separate storage',
      statusCode: 404,
    );
  }
}

class V87Repository extends ReplyRepository {
  V87Repository(this.api) : super(apiClient: api);
  final V87Api api;
  late final chats = V87Chats(api);
  late final real = AssistantRepository(
    apiClient: api,
    chatRepository: chats,
    currentUserId: () => repairActor,
  );
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) => real.restoreChat(
    wsId: wsId,
    chatId: chatId,
    forceRefresh: true,
    cacheOrigin: cacheOrigin,
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
    return real.streamChat(
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
  Future<AssistantAttachment> uploadAttachment({
    required String wsId,
    required AssistantFilePickerResult file,
    String? chatId,
    void Function(double progress)? onProgress,
  }) async => AssistantAttachment(
    id: file.id,
    name: file.name,
    size: file.size,
    type: file.mimeType,
    storagePath: 'chats/$chatId/${file.name}',
    uploadState: AssistantAttachmentUploadState.uploaded,
  );
  @override
  Future<List<AssistantGatewayModel>> fetchGatewayModels({
    bool forceRefresh = false,
  }) async => const [
    AssistantGatewayModel(
      value: 'synthetic/model-a',
      label: 'A',
      provider: 'synthetic',
    ),
    AssistantGatewayModel(
      value: 'synthetic/model-b',
      label: 'B',
      provider: 'synthetic',
    ),
  ];
}

class V87Harness extends BackgroundReplyHarness {
  V87Harness({V87Repository? repository})
    : this._(repository ?? V87Repository(V87Api()));
  V87Harness._(this.repo) : super(repository: repo);
  final V87Repository repo;
  TextEditingController draft(WidgetTester tester) => tester
      .widget<AssistantComposerDock>(find.byType(AssistantComposerDock))
      .controller;
  Future<void> attach(WidgetTester tester) => tester.runAsync(
    () => chat.addComposerAttachments(
      wsId: repairWorkspace,
      files: [
        AssistantMemoryFile(
          name: 'fixture.txt',
          bytes: Uint8List.fromList([1, 2, 3, 4]),
        ),
      ],
      modelId: 'synthetic/model-a',
      timezone: 'UTC',
    ),
  );
  Future<void> pageSend(WidgetTester tester, String text) async {
    await tester.pumpAndSettle();
    if (find.byType(AssistantComposerFab).evaluate().isNotEmpty) {
      await tester.tap(find.byType(AssistantComposerFab));
      await tester.pumpAndSettle();
    }
    draft(tester).text = text;
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('assistant-navigation-toggle')));
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 100));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
    }
  }
}
