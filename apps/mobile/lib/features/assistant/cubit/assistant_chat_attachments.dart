part of 'assistant_chat_cubit.dart';

extension AssistantChatAttachments on AssistantChatCubit {
  int get attachmentScopeVersion => _workspaceVersion;

  Future<void> addComposerAttachments({
    required String wsId,
    required List<PlatformFile> files,
    required String modelId,
    required String timezone,
    int? expectedWorkspaceVersion,
    bool Function()? isCurrentActor,
  }) async {
    final workspaceVersion = expectedWorkspaceVersion ?? _workspaceVersion;
    bool isCurrentScope() =>
        !isClosed &&
        state.workspaceId == wsId &&
        _workspaceVersion == workspaceVersion &&
        (isCurrentActor?.call() ?? true);
    if (!isCurrentScope()) return;
    // Sources outlive a composer reset; drop those no attachment refers to.
    _attachmentSources.removeWhere((id, _) => _composerAttachment(id) == null);
    for (final file in files) {
      if (!isCurrentScope()) return;
      final id = _repository.generateUuid();
      final picked = await AssistantFilePickerResult.fromPlatformFile(file, id);
      if (!isCurrentScope()) return;
      _attachmentSources[id] = picked;
      _emitIfOpen(
        state.copyWith(
          composerAttachments: [
            ...state.composerAttachments,
            AssistantAttachment(
              id: id,
              name: picked.name,
              size: picked.size,
              type: picked.mimeType,
              localPath: picked.path,
              uploadState: AssistantAttachmentUploadState.uploading,
            ),
          ],
        ),
      );
      await _uploadComposerAttachment(
        id: id,
        picked: picked,
        wsId: wsId,
        modelId: modelId,
        timezone: timezone,
        isCurrentScope: isCurrentScope,
      );
    }
  }

  /// Re-runs a failed upload from the retained local source.
  Future<void> retryComposerAttachment({
    required String wsId,
    required String attachmentId,
    required String modelId,
    required String timezone,
    int? expectedWorkspaceVersion,
    bool Function()? isCurrentActor,
  }) async {
    final picked = _attachmentSources[attachmentId];
    final index = state.composerAttachments.indexWhere(
      (attachment) => attachment.id == attachmentId,
    );
    final workspaceVersion = _workspaceVersion;
    bool isCurrentScope() =>
        !isClosed &&
        state.workspaceId == wsId &&
        _workspaceVersion == workspaceVersion &&
        (isCurrentActor?.call() ?? true);
    if (picked == null ||
        index < 0 ||
        // A second tap before the rebuild must not start a parallel upload.
        state.composerAttachments[index].uploadState !=
            AssistantAttachmentUploadState.error ||
        (expectedWorkspaceVersion != null &&
            expectedWorkspaceVersion != workspaceVersion) ||
        !isCurrentScope()) {
      return;
    }
    final previous = state.composerAttachments[index];
    _replaceComposerAttachment(
      attachmentId,
      AssistantAttachment(
        id: previous.id,
        name: picked.name,
        size: picked.size,
        type: picked.mimeType,
        localPath: picked.path,
        uploadState: AssistantAttachmentUploadState.uploading,
      ),
    );
    await _uploadComposerAttachment(
      id: attachmentId,
      picked: picked,
      wsId: wsId,
      modelId: modelId,
      timezone: timezone,
      isCurrentScope: isCurrentScope,
    );
  }

  Future<void> _uploadComposerAttachment({
    required String id,
    required AssistantFilePickerResult picked,
    required String wsId,
    required String modelId,
    required String timezone,
    required bool Function() isCurrentScope,
  }) async {
    var lastProgress = -1.0;
    void progress(double value) {
      // Whole-percent steps keep a large upload from rebuilding every chunk.
      if (value < 1 && value - lastProgress < 0.01) return;
      lastProgress = value;
      if (!isCurrentScope()) return;
      final current = _composerAttachment(id);
      if (current == null ||
          current.uploadState != AssistantAttachmentUploadState.uploading) {
        return;
      }
      _replaceComposerAttachment(id, current.copyWith(uploadProgress: value));
    }

    try {
      // Optimization runs off the UI isolate; the original stays on device.
      final optimized = (await _mediaOptimizer.optimize(picked)).result;
      if (!isCurrentScope() || _composerAttachment(id) == null) return;
      final chatId = await _chatIdForAttachment(
        wsId: wsId,
        modelId: modelId,
        timezone: timezone,
      );
      if (!isCurrentScope() || _composerAttachment(id) == null) return;
      final uploaded = await _repository.uploadAttachment(
        wsId: wsId,
        chatId: chatId,
        file: optimized,
        onProgress: progress,
      );
      if (!isCurrentScope() || _composerAttachment(id) == null) return;
      _attachmentSources.remove(id);
      _replaceComposerAttachment(id, uploaded);
    } on Exception catch (error) {
      if (!isCurrentScope()) return;
      final current = _composerAttachment(id);
      if (current == null) return;
      _replaceComposerAttachment(
        id,
        current.copyWith(
          uploadState: AssistantAttachmentUploadState.error,
          failure: switch (error) {
            AssistantAttachmentUploadException(:final failure) => failure,
            ApiException() => AssistantAttachmentFailure.fromApi(error),
            _ => AssistantAttachmentFailure.server,
          },
        ),
      );
    }
  }

  AssistantAttachment? _composerAttachment(String id) {
    for (final attachment in state.composerAttachments) {
      if (attachment.id == id) return attachment;
    }
    return null;
  }

  void _replaceComposerAttachment(String id, AssistantAttachment next) {
    _emitIfOpen(
      state.copyWith(
        composerAttachments: [
          for (final attachment in state.composerAttachments)
            if (attachment.id == id) next else attachment,
        ],
      ),
    );
  }

  Future<String> _chatIdForAttachment({
    required String wsId,
    required String modelId,
    required String timezone,
  }) async {
    if (state.status == AssistantChatStatus.restoring) {
      throw Exception('Assistant chat is still loading');
    }
    final existingChat = state.chat;
    if (state.storedChatId != null && existingChat != null) {
      return existingChat.id;
    }
    final pending = _pendingAttachmentChatId;
    if (pending != null &&
        _pendingAttachmentWorkspaceId == wsId &&
        _pendingAttachmentWorkspaceVersion == _workspaceVersion) {
      return await pending;
    }
    final creating = _createChatForAttachment(
      wsId: wsId,
      modelId: modelId,
      timezone: timezone,
    );
    _pendingAttachmentChatId = creating;
    _pendingAttachmentWorkspaceId = wsId;
    _pendingAttachmentWorkspaceVersion = _workspaceVersion;
    try {
      return await creating;
    } finally {
      if (identical(_pendingAttachmentChatId, creating)) {
        _pendingAttachmentChatId = null;
        _pendingAttachmentWorkspaceId = null;
        _pendingAttachmentWorkspaceVersion = null;
      }
    }
  }

  Future<String> _createChatForAttachment({
    required String wsId,
    required String modelId,
    required String timezone,
  }) async {
    final workspaceVersion = _workspaceVersion;
    bool current() =>
        !isClosed &&
        workspaceVersion == _workspaceVersion &&
        state.workspaceId == wsId;
    final settingsPlan = _prepareCreationSettings?.call(wsId, modelId, current);
    if (_prepareCreationSettings != null && settingsPlan == null) {
      throw const FormatException('Assistant creation settings are stale');
    }
    final chat = await _repository.createChat(
      id: state.fallbackChatId,
      wsId: wsId,
      modelId: modelId,
      message: 'New chat',
      timezone: timezone,
      initialSettings: settingsPlan?.take(),
      isCurrent: settingsPlan?.isCurrent,
    );
    if (isClosed ||
        workspaceVersion != _workspaceVersion ||
        state.workspaceId != wsId) {
      throw Exception('Assistant workspace changed during upload');
    }
    await _preferences.saveChatId(wsId, chat.id, shouldWrite: current);
    if (isClosed || workspaceVersion != _workspaceVersion) {
      throw Exception('Assistant workspace changed during upload');
    }
    _emitIfOpen(state.copyWith(chat: chat, storedChatId: chat.id));
    if (!current()) {
      throw const FormatException('Assistant creation settings are stale');
    }
    return chat.id;
  }

  Future<void> removeComposerAttachment({
    required String wsId,
    required String attachmentId,
  }) async {
    AssistantAttachment? target;
    for (final attachment in state.composerAttachments) {
      if (attachment.id == attachmentId) {
        target = attachment;
        break;
      }
    }

    _attachmentSources.remove(attachmentId);
    _emitIfOpen(
      state.copyWith(
        composerAttachments: state.composerAttachments
            .where((attachment) => attachment.id != attachmentId)
            .toList(),
      ),
    );

    if (target?.storagePath case final storagePath?) {
      unawaited(_repository.deleteAttachment(wsId: wsId, path: storagePath));
    }
  }
}
