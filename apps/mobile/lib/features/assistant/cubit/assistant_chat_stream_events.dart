part of 'assistant_chat_cubit.dart';

extension _AssistantChatStreamEvents on AssistantChatCubit {
  void _handleStreamEvent(
    AssistantStreamEvent event, {
    required bool Function() isCurrent,
    required Set<String> handledToolEffects,
  }) {
    if (isClosed || state.status == AssistantChatStatus.error) return;
    if (event is AssistantDoneStreamEvent) {
      _emitIfOpen(state.copyWith(status: AssistantChatStatus.idle));
      _persistAssistantChatCache();
      return;
    }
    if (event is! AssistantJsonStreamEvent) return;

    final payload = event.payload;
    final type = payload['type'] as String? ?? '';

    switch (type) {
      case 'start':
        _activeAssistantMessageId =
            payload['messageId'] as String? ?? _repository.generateUuid();
        _activeTextBlockId = null;
        _activeReasoningBlockId = null;
        _emitIfOpen(state.copyWith(status: AssistantChatStatus.streaming));
      case 'saved-user-message':
        final saved = reconcileAssistantUserReceipt(
          state.messages,
          state.attachmentsByMessageId,
          requestId: payload['clientRequestId'] as String,
          savedId: payload['messageId'] as String,
          savedText: payload['text'] as String,
        );
        if (saved != null) {
          _emitIfOpen(
            state.copyWith(
              messages: _applyNativeUserReceipt(
                saved.messages,
                payload,
                saved.attachments,
              ),
              attachmentsByMessageId: saved.attachments,
            ),
          );
        }
        _completeSubmissionAcknowledgment(payload, matched: saved != null);
        if (saved != null) _persistAssistantChatCache();
      case 'saved-messages':
        _reconcileSavedMessages(payload);
      case 'saved-message':
        _reconcileSavedMessage(payload);
      case 'text-start':
        _activeTextBlockId = payload['id'] as String?;
        _emitIfOpen(state.copyWith(status: AssistantChatStatus.streaming));
      case 'text-delta':
        _appendTextPart(
          blockId: payload['id'] as String?,
          delta: payload['delta'] as String? ?? '',
        );
      case 'reasoning-start':
        _activeReasoningBlockId = payload['id'] as String?;
        _emitIfOpen(state.copyWith(status: AssistantChatStatus.streaming));
      case 'reasoning-delta':
        _appendReasoningPart(
          blockId: payload['id'] as String?,
          delta: payload['delta'] as String? ?? '',
        );
      case 'source-url':
        _appendPart(
          AssistantMessagePart(
            type: 'source-url',
            sourceId: payload['sourceId'] as String?,
            url: payload['url'] as String?,
            title: payload['title'] as String?,
          ),
        );
      case 'tool-input-start':
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: payload['toolName'] as String?,
          toolState: 'input-streaming',
          input: const <String, dynamic>{},
        );
      case 'tool-input-delta':
        _appendToolInputText(
          toolCallId: payload['toolCallId'] as String?,
          delta: payload['inputTextDelta'] as String? ?? '',
        );
      case 'tool-input-available':
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: payload['toolName'] as String?,
          toolState: 'input-available',
          input: payload['input'],
        );
      case 'tool-output-available':
        final retainedName = _currentInputToolName(payload['toolCallId']);
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: retainedName ?? payload['toolName'] as String?,
          toolState: 'output-available',
          output: payload['output'],
        );
        unawaited(
          _handleToolSideEffect(
            payload,
            retainedName: retainedName,
            isCurrent: isCurrent,
            handled: handledToolEffects,
          ),
        );
      case 'start-step':
        _appendPart(const AssistantMessagePart(type: 'step-start'));
      case 'error':
        _emitIfOpen(
          state.copyWith(
            messages: _withoutEmptyAssistantReply(
              state.messages,
              _activeAssistantMessageId,
            ),
            status: AssistantChatStatus.error,
            error:
                payload['errorText'] as String? ?? 'Assistant stream failed.',
            diagnostics: const SafeErrorDiagnostics.streamFailure(),
          ),
        );
      case 'finish':
      case 'finish-step':
      case 'text-end':
      case 'reasoning-end':
      case 'abort':
        _emitIfOpen(state.copyWith(status: AssistantChatStatus.streaming));
      default:
    }
  }
}
