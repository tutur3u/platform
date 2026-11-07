part of 'assistant_chat_cubit.dart';

extension AssistantChatVoiceSend on AssistantChatCubit {
  Future<void> retryVoiceMessage(String id) async {
    if (state.attachmentsByMessageId[id]?.any(
          (a) => a.uploadState == AssistantAttachmentUploadState.error,
        ) ??
        false) {
      await _voiceRetries[id]?.call();
    }
  }

  Future<void> sendVoiceMessage({
    required String wsId,
    required PlatformFile file,
    required String modelId,
    required String timezone,
    required String message,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    String? creditWsId,
    bool Function()? isCurrentActor,
  }) async {
    final version = _workspaceVersion;
    final actor = _repository.currentActorId;
    final selected = state.storedChatId;
    String? created;
    bool current() =>
        !isClosed &&
        version == _workspaceVersion &&
        state.workspaceId == wsId &&
        _repository.currentActorId == actor &&
        (state.storedChatId == selected || state.storedChatId == created) &&
        (isCurrentActor?.call() ?? true);
    if (!current() ||
        state.isBusy ||
        state.creationOutcomeUnknown ||
        state.status == AssistantChatStatus.restoring) {
      return;
    }
    final id = _repository.generateUuid();
    final picked = await AssistantFilePickerResult.fromPlatformFile(file, id);
    if (!current()) return;
    var attachment = AssistantAttachment(
      id: id,
      name: picked.name,
      size: picked.size,
      type: picked.mimeType,
      localPath: picked.path,
      uploadState: AssistantAttachmentUploadState.uploading,
    );
    void publish(AssistantAttachment next) {
      attachment = next;
      if (current()) {
        _emitIfOpen(
          state.copyWith(
            attachmentsByMessageId: {
              ...state.attachmentsByMessageId,
              id: [next],
            },
          ),
        );
      }
    }

    _emitIfOpen(
      state.copyWith(
        messages: [
          ...state.messages,
          AssistantMessage(
            id: id,
            clientRequestId: id,
            role: 'user',
            parts: [AssistantMessagePart(type: 'text', text: message)],
            createdAt: DateTime.now(),
          ),
        ],
        attachmentsByMessageId: {
          ...state.attachmentsByMessageId,
          id: [attachment],
        },
      ),
    );
    Future<void> attempt() async {
      if (!current() || !_voiceUploads.add(id)) return;
      try {
        if (attachment.storagePath == null) {
          publish(
            AssistantAttachment(
              id: id,
              name: picked.name,
              size: picked.size,
              type: picked.mimeType,
              localPath: picked.path,
              uploadState: AssistantAttachmentUploadState.uploading,
            ),
          );
          final chatId = await _chatIdForAttachment(
            wsId: wsId,
            modelId: modelId,
            timezone: timezone,
          );
          created = chatId;
          if (!current()) return;
          final uploaded = await _repository.uploadAttachment(
            wsId: wsId,
            chatId: chatId,
            file: picked,
            onProgress: (value) {
              publish(attachment.copyWith(uploadProgress: value));
            },
          );
          if (!current()) return;
          if (!(uploaded.storagePath?.startsWith('chats/$chatId/') ?? false)) {
            throw const AssistantAttachmentUploadException(
              AssistantAttachmentFailure.forbidden,
            );
          }
          publish(uploaded);
        }
        if (!current()) return;
        publish(
          attachment.copyWith(
            uploadState: AssistantAttachmentUploadState.uploaded,
          ),
        );
        await _submit(
          wsId: wsId,
          message: message,
          modelId: modelId,
          timezone: timezone,
          thinkingMode: thinkingMode,
          creditSource: creditSource,
          workspaceContextId: workspaceContextId,
          creditWsId: creditWsId,
          retryMessageId: id,
          clientRequestId: id,
          isCurrent: current,
        );
      } on Exception catch (error) {
        if (!current()) return;
        publish(
          attachment.copyWith(
            uploadState: AssistantAttachmentUploadState.error,
            failure: switch (error) {
              AssistantAttachmentUploadException(:final failure) => failure,
              ApiException() => AssistantAttachmentFailure.fromApi(error),
              AssistantCreationUncertainException() ||
              AssistantCreationSelectedException() =>
                AssistantAttachmentFailure.newChatRequired,
              _ => AssistantAttachmentFailure.server,
            },
          ),
        );
      } finally {
        _voiceUploads.remove(id);
      }
    }

    _voiceRetries[id] = attempt;
    await attempt();
  }
}
