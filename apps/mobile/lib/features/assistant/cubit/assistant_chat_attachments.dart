part of 'assistant_chat_cubit.dart';

extension AssistantChatAttachments on AssistantChatCubit {
  int get attachmentScopeVersion => _workspaceVersion;

  Future<void> addComposerAttachments({
    required String wsId,
    required List<PlatformFile> files,
    required String modelId,
    required String timezone,
    int? expectedWorkspaceVersion,
  }) async {
    final workspaceVersion = expectedWorkspaceVersion ?? _workspaceVersion;
    bool isCurrentScope() =>
        !isClosed &&
        state.workspaceId == wsId &&
        _workspaceVersion == workspaceVersion;
    if (!isCurrentScope()) return;
    for (final file in files) {
      if (!isCurrentScope()) return;
      final id = _repository.generateUuid();
      final picked = await AssistantFilePickerResult.fromPlatformFile(file, id);
      if (!isCurrentScope()) return;
      final pendingAttachment = AssistantAttachment(
        id: id,
        name: picked.name,
        size: picked.size,
        type: picked.mimeType,
        localPath: picked.path,
        uploadState: AssistantAttachmentUploadState.uploading,
      );

      _emitIfOpen(
        state.copyWith(
          composerAttachments: [
            ...state.composerAttachments,
            pendingAttachment,
          ],
        ),
      );

      try {
        final chatId = await _chatIdForAttachment(
          wsId: wsId,
          modelId: modelId,
          timezone: timezone,
        );
        if (!isCurrentScope()) return;
        final uploaded = await _repository.uploadAttachment(
          wsId: wsId,
          chatId: chatId,
          file: picked,
        );
        if (!isCurrentScope()) return;
        _emitIfOpen(
          state.copyWith(
            composerAttachments: state.composerAttachments
                .map(
                  (attachment) => attachment.id == id ? uploaded : attachment,
                )
                .toList(),
          ),
        );
      } on Exception {
        if (!isCurrentScope()) return;
        _emitIfOpen(
          state.copyWith(
            composerAttachments: state.composerAttachments
                .map(
                  (attachment) => attachment.id == id
                      ? attachment.copyWith(
                          uploadState: AssistantAttachmentUploadState.error,
                        )
                      : attachment,
                )
                .toList(),
          ),
        );
      }
    }
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
    final chat = await _repository.createChat(
      id: state.fallbackChatId,
      wsId: wsId,
      modelId: modelId,
      message: 'New chat',
      timezone: timezone,
    );
    if (isClosed ||
        workspaceVersion != _workspaceVersion ||
        state.workspaceId != wsId) {
      throw Exception('Assistant workspace changed during upload');
    }
    await _preferences.saveChatId(wsId, chat.id);
    if (isClosed || workspaceVersion != _workspaceVersion) {
      throw Exception('Assistant workspace changed during upload');
    }
    _emitIfOpen(state.copyWith(chat: chat, storedChatId: chat.id));
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
