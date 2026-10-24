part of 'assistant_repository.dart';

class _AssistantCacheFlight {
  Future<void> tail = Future<void>.value();
  int sequence = 0;
}

extension _AssistantCacheOperations on AssistantRepository {
  AssistantChatCacheOrigin? _captureChatCacheOrigin({
    required String wsId,
    required String chatId,
    required bool Function() isCurrent,
  }) {
    final actor = _currentUserId();
    if (actor == null || actor.isEmpty) return null;
    final epoch = _creationGenerationVersion;
    final settingsRevision = _chatSettingsRevision;
    final key = CacheKey(
      namespace: 'assistant.chat_restore',
      userId: actor,
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
      params: {'chatId': chatId},
    );
    final revision = _chatCacheStore.resourceRevisionFor(key);
    return AssistantChatCacheOrigin(
      key: key,
      epoch: epoch,
      revision: revision,
      isCurrent: () =>
          epoch == _creationGenerationVersion &&
          settingsRevision == _chatSettingsRevision &&
          _currentUserId() == actor &&
          _chatCacheStore.resourceRevisionFor(key) == revision &&
          isCurrent(),
    );
  }

  Future<AssistantChatCachePublication> _publishAssistantChatSnapshot({
    required AssistantChatCacheOrigin origin,
    required AssistantRestoredChat restored,
  }) {
    // Freeze mutable lists/maps before any await or queued publication.
    late String encoded;
    try {
      origin.checkScope();
      encoded = jsonEncode(restored.toJson());
    } on Object catch (error) {
      return Future.value(_cacheFailure(origin, error));
    }
    final previous = _lastChatSnapshot;
    if (previous != null &&
        previous.key == origin.key.value &&
        previous.epoch == origin.epoch &&
        previous.revision == origin.revision &&
        previous.payload == encoded &&
        previous.origin.isCurrent()) {
      return previous.result;
    }
    final flight = _chatCacheFlights.putIfAbsent(
      origin.key.value,
      _AssistantCacheFlight.new,
    );
    final sequence = ++flight.sequence;
    final preceding = flight.tail;
    final result = () async {
      await preceding;
      try {
        void check() {
          origin.checkScope();
          if (flight.sequence != sequence) {
            throw const AssistantChatCacheCancellation();
          }
        }

        check();
        await _chatCacheStore.write(
          key: origin.key,
          policy: AssistantRepository._assistantChatCachePolicy,
          payload: jsonDecode(encoded),
          tags: [
            AssistantRepository._assistantChatCacheTag,
            'workspace:${origin.key.workspaceId}',
            'module:assistant',
          ],
          expectedRevision: origin.revision,
          requirePublication: true,
          // Scheduling supersession cannot revoke journal rollback authority.
          checkScope: origin.checkScope,
        );
        check();
        return const AssistantChatCachePublication(
          AssistantChatCacheStatus.published,
        );
      } on Object catch (error) {
        return _cacheFailure(origin, error);
      }
    }();
    final observed = result.then<void>((publication) {
      if (publication.status != AssistantChatCacheStatus.published &&
          identical(_lastChatSnapshot?.result, result)) {
        _lastChatSnapshot = null;
      }
    });
    flight.tail = observed;
    _trackChatCache(
      observed.whenComplete(() {
        if (flight.sequence == sequence) {
          _chatCacheFlights.remove(origin.key.value);
        }
      }),
    );
    _lastChatSnapshot = (
      key: origin.key.value,
      epoch: origin.epoch,
      revision: origin.revision,
      payload: encoded,
      origin: origin,
      result: result,
    );
    return result;
  }

  AssistantChatCachePublication _classifyCacheFailure(
    AssistantChatCacheOrigin origin,
    Object error,
  ) {
    final invalidated =
        error is StateError &&
        (error.message == 'Cache write was invalidated.' ||
            error.message == 'Cache scope is clearing.') &&
        (!origin.isCurrent() ||
            _chatCacheStore.resourceRevisionFor(origin.key) != origin.revision);
    if (error is AssistantChatCacheCancellation || invalidated) {
      return const AssistantChatCachePublication(
        AssistantChatCacheStatus.cancelled,
      );
    }
    final diagnostics = SafeErrorDiagnostics.capture(
      error,
      DiagnosticStage.assistantReply,
    );
    if (origin.isCurrent()) {
      chatCacheDiagnostics = diagnostics;
    }
    return AssistantChatCachePublication(
      AssistantChatCacheStatus.failed,
      diagnostics: diagnostics,
    );
  }

  void _trackChatCacheOperation(Future<void> operation) {
    late Future<void> observed;
    observed = operation.whenComplete(() => _chatCacheTasks.remove(observed));
    _chatCacheTasks.add(observed);
  }

  Future<void> _drainAssistantChatCache() async {
    while (_chatCacheTasks.isNotEmpty) {
      await Future.wait(_chatCacheTasks.toList());
    }
  }

  Future<void> _writeAssistantChatCache({
    required String wsId,
    required String chatId,
    required AssistantRestoredChat restored,
  }) async {
    final origin = captureChatCacheOrigin(
      wsId: wsId,
      chatId: chatId,
      isCurrent: () => true,
    );
    if (origin != null) {
      final result = await publishAssistantChatSnapshot(
        origin: origin,
        restored: restored,
      );
      if (result.status == AssistantChatCacheStatus.failed) {
        throw AssistantChatCacheStorageFailure(result.diagnostics);
      }
    }
  }
}
