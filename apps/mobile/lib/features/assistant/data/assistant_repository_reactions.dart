part of 'assistant_repository.dart';

extension AssistantReactionOperations on AssistantRepository {
  int get reactionActorEpoch =>
      AssistantReactionJournal.actorEpoch(currentActorId ?? '');

  Future<void> prepareMessageReactions({
    required String wsId,
    required bool Function() isCurrent,
  }) async {
    final actor = currentActorId;
    if (actor == null) throw const AssistantChatCacheCancellation();
    final epoch = AssistantReactionJournal.actorEpoch(actor);
    bool current() =>
        currentActorId == actor &&
        isCurrent() &&
        AssistantReactionJournal.actorEpoch(actor) == epoch;
    for (var batch = 0; batch < 10; batch++) {
      final ids = (await _reactionJournal.retirementIds(
        actor,
      )).take(100).toList();
      if (!current()) throw const AssistantChatCacheCancellation();
      if (ids.isEmpty) return;
      final receipt = await _apiClient.postJsonAcknowledged(
        '/api/v1/workspaces/$wsId/chat/reactions/retire',
        {'opIds': ids},
        actorId: actor,
        isCurrent: current,
      );
      final retired = receipt['retiredOpIds'];
      if (retired is! List ||
          retired.length != ids.length ||
          retired.toSet().length != ids.length ||
          !retired.toSet().containsAll(ids)) {
        throw const FormatException('Reaction retirement receipt differs');
      }
      await _reactionJournal.finishRetirement(actor, ids);
    }
    throw const FormatException('Reaction retirement needs another attempt');
  }

  Future<AssistantReactionBegin> beginMessageReaction({
    required String wsId,
    required String chatId,
    required String messageId,
    required AssistantReactionIntent intent,
    required bool Function() isCurrent,
  }) async {
    final current = _reactionLease(wsId, chatId, messageId, isCurrent);
    await prepareMessageReactions(wsId: wsId, isCurrent: current);
    return await _reactionJournal.begin(
      AssistantReactionJournal.keyFor(currentActorId!, wsId, chatId, messageId),
      intent: intent,
      isCurrent: current,
    );
  }

  Future<AssistantReactionIntent?> pendingMessageReaction({
    required String actorId,
    required String wsId,
    required String chatId,
    required String messageId,
  }) => _reactionJournal.pending(
    AssistantReactionJournal.keyFor(actorId, wsId, chatId, messageId),
  );

  Future<bool> confirmMessageReaction({
    required String actorId,
    required String wsId,
    required String chatId,
    required String messageId,
    required String opId,
  }) => _reactionJournal.confirm(
    AssistantReactionJournal.keyFor(actorId, wsId, chatId, messageId),
    opId: opId,
  );

  /// Desired state receipts clean their origin even after departure.
  Future<({ChatMessage message, bool confirmed})> setMessageReaction({
    required String actorId,
    required String wsId,
    required String chatId,
    required String messageId,
    required AssistantReactionIntent intent,
    required bool clearIfNotDispatched,
    required bool Function() isCurrent,
  }) async {
    final key = AssistantReactionJournal.keyFor(
      actorId,
      wsId,
      chatId,
      messageId,
    );
    ApiMutationAdmission? admission;
    var confirmed = false;
    try {
      final current = _reactionLease(wsId, chatId, messageId, isCurrent);
      if (currentActorId != actorId) {
        throw const AssistantChatCacheCancellation();
      }
      await prepareMessageReactions(wsId: wsId, isCurrent: current);
      admission = ApiMutationAdmission(actorId: actorId, isCurrent: current);
      final response = await _apiClient.putJsonOperationAcknowledged(
        '/api/v1/workspaces/$wsId/chat/conversations/$chatId/reactions',
        {'messageId': messageId, ...intent.toJson()},
        admission: admission,
        onAcknowledged: (receipt) async {
          _requireReactionOperation(receipt['operation'], intent);
          _reactionReceipt(receipt['message'], chatId, messageId);
          confirmed = await _reactionJournal.confirm(key, opId: intent.opId);
        },
      );
      _requireReactionOperation(response['operation'], intent);
      return (
        message: _reactionReceipt(response['message'], chatId, messageId),
        confirmed: confirmed,
      );
    } on Object {
      if (clearIfNotDispatched &&
          (admission == null || admission.definitelyNotDispatched)) {
        await _reactionJournal.confirm(key, opId: intent.opId);
      }
      rethrow;
    }
  }

  Future<ChatMessage> refreshMessageReactions({
    required String wsId,
    required String chatId,
    required String messageId,
    required bool Function() isCurrent,
  }) async {
    final current = _reactionLease(wsId, chatId, messageId, isCurrent);
    final response = await _apiClient.getJson(
      '/api/v1/workspaces/$wsId/chat/conversations/$chatId/reactions'
      '?messageId=$messageId',
    );
    if (!current()) throw const AssistantChatCacheCancellation();
    return _reactionReceipt(response['message'], chatId, messageId);
  }

  bool Function() _reactionLease(
    String wsId,
    String chatId,
    String messageId,
    bool Function() isCurrent,
  ) {
    final route = AssistantChatRoute.parse(chatId);
    final actor = currentActorId;
    if (route.kind != AssistantChatRouteKind.native ||
        !isUuid(wsId) ||
        !isUuid(messageId) ||
        actor == null ||
        actor.isEmpty) {
      throw const FormatException('Native reaction scope is unavailable');
    }
    final version = _creationGenerationVersion;
    final actorEpoch = AssistantReactionJournal.actorEpoch(actor);
    var retired = false;
    bool current() {
      final parentCurrent = isCurrent();
      retired =
          retired ||
          currentActorId != actor ||
          version != _creationGenerationVersion ||
          actorEpoch != AssistantReactionJournal.actorEpoch(actor) ||
          !parentCurrent;
      return !retired;
    }

    if (!current()) throw const AssistantChatCacheCancellation();
    return current;
  }
}

void _requireReactionOperation(Object? raw, AssistantReactionIntent intent) {
  if (raw is! Map ||
      raw['id'] != intent.opId ||
      raw['emoji'] != intent.emoji ||
      raw['present'] != intent.present) {
    throw const FormatException('Reaction operation receipt differs');
  }
}

ChatMessage _reactionReceipt(Object? raw, String chatId, String messageId) {
  if (raw is! Map<String, dynamic> || raw['reactions'] is! List) {
    throw const FormatException('Invalid reaction receipt');
  }
  for (final summary in raw['reactions'] as List) {
    if (summary is! Map<String, dynamic> ||
        summary['emoji'] is! String ||
        (summary['emoji'] as String).trim().isEmpty ||
        summary['count'] is! int ||
        (summary['count'] as int) < 0) {
      throw const FormatException('Invalid reaction summary');
    }
    final users = summary['userIds'] ?? summary['user_ids'];
    if (users is! List || users.any((id) => id is! String || id.isEmpty)) {
      throw const FormatException('Invalid reaction actors');
    }
  }
  final message = ChatMessage.fromJson(raw);
  requireAssistantMessageReceipts([message], conversationId: chatId);
  if (message.id != messageId) {
    throw const FormatException('Reaction receipt target differs');
  }
  return message;
}
