import 'dart:async';

import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mocktail/mocktail.dart';

class CubitFixtureApi extends Mock implements ApiClient {}

class CubitFixtureRealtime extends Mock implements ChatRealtimeClient {}

const fixtureWs = 'ws-1';
const threadId = '11111111-1111-4111-8111-111111111111';
const otherThreadId = '22222222-2222-4222-8222-222222222222';

/// Message id `n` as a UUID, like a synced server message.
String messageId(int n) =>
    '00000000-0000-4000-8000-${n.toString().padLeft(12, '0')}';

final DateTime fixtureStart = DateTime.utc(2026, 11, 1, 9);

/// Message `n` in [threadId], one minute after message `n - 1`.
ChatMessage fixtureMessage(
  int n, {
  String sender = 'ada',
  List<ChatReactionSummary> reactions = const [],
}) => ChatMessage(
  id: messageId(n),
  conversationId: threadId,
  content: 'message $n',
  kind: ChatMessageKind.user,
  senderId: sender,
  createdAt: fixtureStart.add(Duration(minutes: n)),
  reactions: reactions,
);

ChatConversation fixtureConversation(String id, {DateTime? updatedAt}) =>
    ChatConversation(
      id: id,
      wsId: fixtureWs,
      type: ChatConversationType.channel,
      title: id == threadId ? 'design' : 'general',
      updatedAt: updatedAt ?? fixtureStart,
    );

/// Programmable chat backend: each call is recorded and answered by the
/// handler a test installs.
class CubitFixtureRepository extends ChatRepository {
  CubitFixtureRepository(CubitFixtureApi api) : super(apiClient: api);

  List<ChatConversation> conversations = [
    fixtureConversation(
      threadId,
      updatedAt: fixtureStart.add(const Duration(days: 1)),
    ),
    fixtureConversation(otherThreadId),
  ];

  /// Answers `listMessages`; `before` is null for the newest page.
  Future<List<ChatMessage>> Function(String conversationId, String? before)
  onListMessages = (conversationId, before) async => const [];
  final List<String?> beforeCursors = [];

  Future<ChatMessage> Function(String messageId, bool present, String opId)?
  onSetReaction;
  final List<({String messageId, bool present, String opId})> reactionCalls =
      [];

  final List<String?> sentReplyIds = [];

  /// Fails `deleteConversation` with this message when set.
  String? deleteConversationFailure;

  @override
  Future<void> deleteConversation(String wsId, String conversationId) async {
    final failure = deleteConversationFailure;
    if (failure != null) throw ApiException(message: failure, statusCode: 500);
  }

  final List<String> deletedIds = [];

  @override
  Future<ChatConversationPage> listConversations(
    String wsId, {
    ChatArchivedFilter archived = ChatArchivedFilter.active,
    int limit = 40,
    int offset = 0,
    bool forceRefresh = false,
  }) async => ChatConversationPage(conversations: conversations);

  /// Server row count of a page; defaults to every returned message.
  int Function(List<ChatMessage> messages) serverCountOf = _allRows;
  static int _allRows(List<ChatMessage> messages) => messages.length;

  @override
  Future<ChatMessagePage> listMessagePage(
    String wsId,
    String conversationId, {
    String? before,
    int limit = 60,
    bool forceRefresh = false,
  }) async {
    beforeCursors.add(before);
    // Like the real repository, serve the cached page unless forced.
    final key = (conversationId, before);
    final cached = _cache[key];
    if (!forceRefresh && cached != null) return cached;
    final messages = await onListMessages(conversationId, before);
    final page = (messages: messages, serverCount: serverCountOf(messages));
    _cache[key] = page;
    return page;
  }

  final Map<(String, String?), ChatMessagePage> _cache = {};

  @override
  Future<ChatConversation> markRead(
    String wsId,
    String conversationId, {
    String? messageId,
  }) async => conversations.first;

  @override
  Future<ChatMessage> deleteMessage(
    String wsId,
    String conversationId,
    String messageId,
  ) async {
    deletedIds.add(messageId);
    return ChatMessage(
      id: messageId,
      conversationId: conversationId,
      content: '',
      kind: ChatMessageKind.user,
      deletedAt: DateTime.utc(2026, 11, 2),
    );
  }

  @override
  Future<ChatMessage> setReaction(
    String wsId,
    String conversationId, {
    required String messageId,
    required String emoji,
    required bool present,
    required String opId,
  }) {
    reactionCalls.add((messageId: messageId, present: present, opId: opId));
    return onSetReaction!(messageId, present, opId);
  }

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
    sentReplyIds.add(replyToMessageId);
    yield const ChatStreamDoneEvent();
  }
}

/// A cubit over [CubitFixtureRepository] with [threadId] open; realtime
/// events are pushed through [inbox].
class CubitHarness {
  CubitHarness() {
    when(() => api.getJson(any())).thenAnswer((_) async => {});
    when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
    when(
      () =>
          realtime.connect(any(), conversationId: any(named: 'conversationId')),
    ).thenAnswer(
      (invocation) => invocation.namedArguments[#conversationId] == null
          ? inbox.stream
          : const Stream<ChatRealtimeEvent>.empty(),
    );
  }

  final api = CubitFixtureApi();
  final realtime = CubitFixtureRealtime();
  final inbox = StreamController<ChatRealtimeEvent>.broadcast();
  late final repository = CubitFixtureRepository(api);
  late final cubit = ChatCubit(
    repository: repository,
    realtimeClient: realtime,
    currentUserId: () => 'me',
  );

  Future<void> open() async {
    await cubit.setWorkspace(fixtureWs, initialConversationId: threadId);
    await settle();
  }

  Future<void> settle() async {
    for (var i = 0; i < 5; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  Future<void> dispose() async {
    await inbox.close();
    await cubit.close();
  }
}

/// Messages `from..to` inclusive.
List<ChatMessage> fixtureRange(int from, int to) => [
  for (var n = from; n <= to; n++) fixtureMessage(n),
];
