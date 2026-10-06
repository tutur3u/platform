part of 'assistant_chat_cubit.dart';

extension _AssistantChatToolEffects on AssistantChatCubit {
  String? _currentInputToolName(Object? callId) {
    if (callId is! String || callId.isEmpty) return null;
    final message = state.messages
        .where((message) => message.id == _activeAssistantMessageId)
        .firstOrNull;
    return message?.parts
        .where(
          (part) =>
              part.type == 'dynamic-tool' &&
              part.toolCallId == callId &&
              part.input != null,
        )
        .firstOrNull
        ?.toolName;
  }

  Future<void> _handleToolSideEffect(
    Map<String, dynamic> payload, {
    required String? retainedName,
    required bool Function() isCurrent,
    required Set<String> handled,
  }) async {
    if (!isCurrent()) return;
    final output = payload['output'];
    final reportedName = payload['toolName'];
    final toolName = reportedName is String ? reportedName : retainedName;

    if (toolName == 'update_my_settings') {
      final callId = payload['toolCallId'];
      // Normal SDK output omits toolName. Only the current message's input
      // establishes call identity. Unsolicited/conflicting names fail closed.
      if (retainedName != toolName ||
          callId is! String ||
          callId.isEmpty ||
          payload['preliminary'] == true ||
          output is! Map ||
          output['success'] != true ||
          output.containsKey('error') ||
          !handled.add(callId)) {
        return;
      }
      try {
        await _onSoulRefreshRequested();
      } on Object catch (error) {
        if (!isCurrent()) return;
        // A confirmed tool write is independent from reply persistence.
        // Retain the typed metadata failure without changing transport status.
        _onSoulRefreshFailed?.call(
          SafeErrorDiagnostics.capture(
            error,
            DiagnosticStage.assistantSettings,
          ),
        );
      }
      return;
    }

    // Other tool effects retain their existing behavior.
    if (reportedName == 'set_workspace_context') {
      final contextId = readWorkspaceContextId(output);
      if (contextId != null && contextId.isNotEmpty) {
        await _onWorkspaceContextChanged(contextId);
      }
    }
    if (reportedName == 'set_immersive_mode') {
      _onImmersiveModeChanged(readImmersiveFlag(output));
    }
  }
}
