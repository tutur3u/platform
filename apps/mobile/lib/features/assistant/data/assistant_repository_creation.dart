part of 'assistant_repository.dart';

extension _AssistantCreation on AssistantRepository {
  Future<AssistantChatRecord> _createBoundChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
    ChatInitialAiSettings? initialSettings,
    bool Function()? isCurrent,
  }) async {
    final settingsKey = initialSettings == null
        ? null
        : jsonEncode(initialSettings.toJson());
    final scope = _creationScopeKey(wsId);
    var pending = _generationCreation;
    if (pending != null &&
        (pending.scope != scope ||
            pending.fallbackId != id ||
            pending.version != _creationGenerationVersion)) {
      invalidateChatCreation();
      pending = null;
    }
    if (pending != null && pending.settingsKey != settingsKey) {
      throw const AssistantCreationUncertainException(
        'Pending creation settings differ',
      );
    }
    final version = _creationGenerationVersion;
    bool current() =>
        version == _creationGenerationVersion &&
        scope == _creationScopeKey(wsId) &&
        (isCurrent?.call() ?? true);
    final result =
        pending?.result ??
        _createChat(
          id: id,
          wsId: wsId,
          modelId: modelId,
          message: message,
          timezone: timezone,
          isCurrentCreation: current,
          initialSettings: initialSettings,
        );
    _generationCreation = (
      scope: scope,
      fallbackId: id,
      version: version,
      result: result,
      settingsKey: settingsKey,
    );
    try {
      final acknowledged = await result;
      if (!current()) {
        throw const AssistantCreationUncertainException(
          'Assistant creation generation changed',
        );
      }
      return acknowledged;
    } on Object {
      if (identical(_generationCreation?.result, result)) {
        _generationCreation = null;
      }
      rethrow;
    }
  }
}
