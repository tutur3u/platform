import 'dart:async';

import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

const actionActor = '33333333-3333-4333-8333-333333333333';
const actionWorkspace = '11111111-1111-4111-8111-111111111111';
const actionChat = '44444444-4444-4444-8444-444444444444';
const actionMessage = '55555555-5555-4555-8555-555555555555';
const actionOther = '66666666-6666-4666-8666-666666666666';
const actionRow = AssistantMessage(
  id: actionMessage,
  role: 'assistant',
  isPersisted: true,
  parts: [AssistantMessagePart(type: 'text', text: 'Current content')],
);

class ActionsApi extends Mock implements ApiClient {}

class ActionsPreferences extends Mock implements AssistantPreferences {}

class _TestReactionJournal extends AssistantReactionJournal {
  final _pending = <String>{};

  @override
  Future<bool> begin(String key, {required bool Function() isCurrent}) async {
    if (!isCurrent()) return false;
    return _pending.add(key);
  }

  @override
  Future<bool> confirm(String key, {required bool Function() isCurrent}) async {
    if (!isCurrent()) return false;
    _pending.remove(key);
    return true;
  }
}

class ActionsRepository extends AssistantRepository {
  ActionsRepository(ActionsApi api, {AssistantReactionJournal? reactionJournal})
    : super(
        apiClient: api,
        tasksApiClient: api,
        reactionJournal: reactionJournal ?? _TestReactionJournal(),
      );
  String actor = actionActor;
  List<AssistantMessage> rows = [actionRow];
  Map<String, List<AssistantAttachment>> savedAttachments = {};
  final snapshots =
      <({AssistantChatCacheOrigin origin, AssistantRestoredChat restored})>[];
  final turns = <List<AssistantMessage>>[];
  final frames = StreamController<AssistantStreamEvent>.broadcast(sync: true);
  int ids = 0;
  @override
  String? get currentActorId => actor;
  @override
  String generateUuid() =>
      'aaaaaaaa-aaaa-4aaa-8aaa-${(++ids).toString().padLeft(12, '0')}';
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
    messages: rows,
    attachmentsByMessageId: savedAttachments,
  );
  @override
  AssistantChatCacheOrigin? captureChatCacheOrigin({
    required String wsId,
    required String chatId,
    required bool Function() isCurrent,
  }) => AssistantChatCacheOrigin(
    key: CacheKey(
      namespace: 'actions',
      userId: actor,
      workspaceId: wsId,
      params: {'chatId': chatId},
    ),
    epoch: 0,
    revision: 0,
    isCurrent: isCurrent,
  );
  @override
  Future<AssistantChatCachePublication> publishAssistantChatSnapshot({
    required AssistantChatCacheOrigin origin,
    required AssistantRestoredChat restored,
  }) async {
    if (!origin.isCurrent()) {
      return const AssistantChatCachePublication(
        AssistantChatCacheStatus.cancelled,
      );
    }
    snapshots.add((origin: origin, restored: restored));
    return const AssistantChatCachePublication(
      AssistantChatCacheStatus.published,
    );
  }

  @override
  Future<void> drainAssistantChatCache() async {}
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
    turns.add(messages);
    return frames.stream;
  }
}

AssistantChatCubit actionsCubit(
  ActionsRepository repository,
  ActionsPreferences preferences,
) => AssistantChatCubit(
  repository: repository,
  preferences: preferences,
  onWorkspaceContextChanged: (_) async {},
  onSoulRefreshRequested: () async {},
  onImmersiveModeChanged: (_) {},
  onChatRestored: (_) async {},
);

Map<String, dynamic> actionReceipt({String chatId = actionChat}) => {
  'id': actionMessage,
  'conversationId': chatId,
  'content': 'Outdated server content',
  'kind': 'assistant',
  'reactions': [
    {
      'emoji': 'heart',
      'count': 1,
      'userIds': [actionActor],
    },
  ],
};
