import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_first_message_creation.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'assistant_creation_marker_test.dart' show informedReset;

const actor = 'a6742000-0000-4000-8000-000000000001';
const ws = 'a6742000-0000-4000-8000-000000000011';
const chat = 'a6742000-0000-4000-8000-000000000021';
const key = 'a6742000-0000-4000-8000-000000000031';
const settings = ChatInitialAiSettings(
  modelId: 'google/test',
  creditSource: 'workspace',
  creditWsId: null,
  thinkingMode: 'fast',
);

class FirstApi extends ApiClient {
  int requests = 0;
  String? path;
  Map<String, dynamic>? body;
  String? malformed;
  bool transportFailure = false;
  Completer<void>? responseGate;
  final headers = Completer<void>();
  final releaseBody = Completer<void>();
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
    requests++;
    this.path = path;
    this.body = body;
    if (transportFailure) throw StateError('Synthetic lost response');
    final receipt = <String, dynamic>{
      'id': chat,
      'wsId': ws,
      'createdBy': actor,
      'type': 'ai',
      'createdAt': '2026-10-25T14:00:00Z',
      'creationRequestId': malformed == 'nested key' ? chat : key,
      'initialAiSettings': {
        ...settings.toJson(),
        'actorUserId': actor,
        'wsId': ws,
        'conversationId': chat,
      },
    };
    if (malformed == 'actor') receipt['createdBy'] = ws;
    if (malformed == 'workspace') receipt['wsId'] = actor;
    if (malformed == 'id') receipt['id'] = key;
    if (malformed == 'settings') {
      (receipt['initialAiSettings'] as Map)['modelId'] = 'foreign/model';
    }
    final encoded = base64Url.encode(
      utf8.encode(
        jsonEncode({
          'conversation': receipt,
          'creationRequestId': malformed == 'key' ? chat : key,
        }),
      ),
    );
    if (!headers.isCompleted) headers.complete();
    await responseGate?.future;
    var cancelled = false;
    late final StreamController<List<int>> controller;
    controller = StreamController<List<int>>(
      onListen: () {
        unawaited(
          releaseBody.future.then((_) {
            if (cancelled) return;
            final user = {
              'id': 'a6742000-0000-4000-8000-000000000041',
              'conversationId': chat,
              'kind': 'user',
              'senderId': actor,
              'content': 'hello',
              'createdAt': '2026-10-25T14:00:00Z',
              'metadata': {'clientRequestId': malformed == 'user' ? chat : key},
              'attachments': <Object>[],
            };
            final assistant = {
              ...user,
              'id': 'a6742000-0000-4000-8000-000000000042',
              'kind': 'assistant',
              'senderId': null,
              'content': 'Hi',
              'metadata': <String, dynamic>{},
            };
            for (final event in [
              {'type': 'message', 'message': user},
              {
                'type': 'messages',
                'messages': [assistant],
              },
              {'type': 'done'},
            ]) {
              controller.add(utf8.encode('${jsonEncode(event)}\n'));
            }
            unawaited(controller.close());
          }),
        );
      },
      onCancel: () {
        cancelled = true;
        if (!releaseBody.isCompleted) releaseBody.complete();
      },
    );
    return http.StreamedResponse(
      controller.stream,
      200,
      headers: {
        'content-type': 'application/x-ndjson',
        if (malformed != 'missing') 'x-mira-chat-creation': encoded,
      },
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FirstApi api;
  late AssistantRepository repository;
  var current = true;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    current = true;
    api = FirstApi();
    repository = AssistantRepository(
      apiClient: api,
      currentUserId: () => actor,
    );
    await informedReset(repository, ws);
  });
  Stream<AssistantStreamEvent> send() => repository.streamFirstChat(
    creation: AssistantFirstMessageCreation(settings, () => current),
    chatId: chat,
    wsId: ws,
    messages: const [
      AssistantMessage(
        id: key,
        clientRequestId: key,
        role: 'user',
        parts: [AssistantMessagePart(type: 'text', text: 'hello')],
      ),
    ],
    timezone: 'Asia/Ho_Chi_Minh',
    admission: ApiMutationAdmission(actorId: actor, isCurrent: () => current),
  );
  test(
    'one POST creates with client ID/key and binds durably before the body',
    () async {
      final created = Completer<void>();
      final events = <AssistantStreamEvent>[];
      final finished = send().forEach((event) {
        events.add(event);
        if (event is AssistantChatCreatedStreamEvent) created.complete();
      });
      await created.future;
      expect(api.requests, 1);
      expect(
        api.path,
        '/api/v1/workspaces/$ws/chat/conversations/$chat/messages',
      );
      expect(api.body!['clientRequestId'], key);
      expect(api.body!['initialConversation'], settings.toJson());
      expect(await repository.hasUnknownChatCreation(ws), isFalse);
      expect(events.whereType<AssistantChatCreatedStreamEvent>(), hasLength(1));
      expect(
        events.whereType<AssistantJsonStreamEvent>().length,
        1,
      ); // Only dispatch; no USER consumed.
      api.releaseBody.complete();
      await finished;
      expect(events.last, isA<AssistantDoneStreamEvent>());
    },
  );
  for (final malformed in [
    'missing',
    'actor',
    'workspace',
    'id',
    'settings',
    'key',
    'nested key',
  ]) {
    test(
      'invalid $malformed receipt stays held and cannot retry with a new ID',
      () async {
        api.malformed = malformed;
        await expectLater(send().toList(), throwsA(isA<Object>()));
        expect(await repository.hasUnknownChatCreation(ws), isTrue);
        await expectLater(send().toList(), throwsA(isA<Object>()));
        expect(api.requests, 1);
      },
    );
  }
  test('lost response preserves the original attempt '
      'and never blindly dispatches again', () async {
    api.transportFailure = true;
    await expectLater(send().toList(), throwsA(isA<Object>()));
    expect(await repository.hasUnknownChatCreation(ws), isTrue);
    await expectLater(send().toList(), throwsA(isA<Object>()));
    expect(api.requests, 1);
  });
  test(
    'invalid user receipt after creation ACK does not re-hold known creation',
    () async {
      api.malformed = 'user';
      api.releaseBody.complete();
      await expectLater(send().toList(), throwsA(isA<Object>()));
      expect(await repository.hasUnknownChatCreation(ws), isFalse);
      expect(api.requests, 1);
    },
  );
  test('cancellation before creation ACK returns promptly and permanently fences the late receipt', () async {
    api.responseGate = Completer<void>();
    final events = <AssistantStreamEvent>[];
    final subscription = send().listen(events.add);
    await api.headers.future;
    await subscription.cancel();
    expect(api.responseGate!.isCompleted, isFalse);
    api.responseGate!.complete();
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    expect(events.whereType<AssistantChatCreatedStreamEvent>(), isEmpty);
    expect(await repository.hasUnknownChatCreation(ws), isTrue);
    expect(api.requests, 1);
  });
  test('retired admission performs no HTTP', () async {
    current = false;
    await expectLater(send().toList(), throwsA(isA<Object>()));
    expect(api.requests, 0);
  });
}
