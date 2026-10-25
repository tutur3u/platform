part of 'assistant_live_cubit.dart';

extension _AssistantLiveTypedSubmission on AssistantLiveCubit {
  Future<AssistantLiveDispatch> _sendTypedMessage({
    required String wsId,
    required String text,
    required List<AssistantAttachment> attachments,
    required void Function(AssistantLiveState) publish,
    bool Function()? isCurrent,
    Future<void> Function(String wsId, String chatId)? onChatBound,
  }) async {
    final invocation = ++_typedSubmissionVersion;
    final actor = _currentUserId();
    final scope = _currentScopeToken();
    var request = _requestVersion;
    bool ownsScope() =>
        !_isClosing &&
        !isClosed &&
        invocation == _typedSubmissionVersion &&
        actor == _currentUserId() &&
        scope == _currentScopeToken() &&
        (isCurrent?.call() ?? true);
    bool current() =>
        ownsScope() &&
        !_isStale(request) &&
        state.workspaceId == wsId &&
        state.status == AssistantLiveConnectionStatus.connected;
    if (!ownsScope() ||
        (state.workspaceId != null && state.workspaceId != wsId)) {
      return AssistantLiveDispatch.stale;
    }
    final trimmed = text.trim();
    final uploaded = attachments
        .where((attachment) => attachment.isUploaded)
        .toList(growable: false);
    if (trimmed.isEmpty && uploaded.isEmpty) {
      return AssistantLiveDispatch.refused;
    }

    var dispatchPossible = false;
    AssistantLiveDispatch stopped() => dispatchPossible
        ? AssistantLiveDispatch.unknown
        : AssistantLiveDispatch.stale;
    try {
      if (state.status != AssistantLiveConnectionStatus.connected) {
        final prepared = await prepareSession(
          wsId: wsId,
          chatId: state.chatId,
          isCurrent: ownsScope,
          onChatBound: onChatBound,
        );
        if (!ownsScope()) return stopped();
        if (prepared == null) {
          return _requestVersion == request + 1 && !_isStale(_requestVersion)
              ? AssistantLiveDispatch.refused
              : AssistantLiveDispatch.stale;
        }
        request = prepared;
      } else {
        await _waitForReady();
      }
      if (!current()) return stopped();

      // Read every file before admitting any frame, so an async read cannot
      // strand a partially sent turn or resume into another actor/session.
      final images = <Uint8List>[];
      for (final attachment in uploaded.where((file) => file.isImage)) {
        final path = attachment.localPath;
        if (path == null || path.isEmpty) continue;
        final bytes = await File(path).readAsBytes();
        if (!current()) return stopped();
        final decoded = img.decodeImage(bytes);
        if (decoded != null) {
          images.add(Uint8List.fromList(img.encodeJpg(decoded, quality: 72)));
        }
      }
      if (!current()) return stopped();
      final summary = _buildAttachmentSummary(uploaded);
      final payload = [
        if (summary != null) summary,
        if (trimmed.isNotEmpty) trimmed,
      ].join('\n\n');

      AssistantLiveDispatch? admit(AssistantLiveSinkAdmission Function() send) {
        if (!current()) return stopped();
        final previousDispatch = dispatchPossible;
        dispatchPossible = true;
        final admission = send();
        if (admission == AssistantLiveSinkAdmission.unknown) {
          return AssistantLiveDispatch.unknown;
        }
        if (admission == AssistantLiveSinkAdmission.refused) {
          dispatchPossible = previousDispatch;
          return previousDispatch
              ? AssistantLiveDispatch.unknown
              : AssistantLiveDispatch.refused;
        }
        return null;
      }

      for (final image in images) {
        final failure = admit(() => _socket.sendVideoFrame(image));
        if (failure != null) return failure;
      }
      final failure = admit(() => _socket.sendText(payload));
      if (failure != null) return failure;
      if (!current()) return stopped();
      _currentTurnId = _newTurnId();
      _currentTypedInput = trimmed;
      _currentUserTranscript = '';
      _currentAssistantText = '';
      _currentAssistantTranscript = '';
      _currentTurnAttachments = uploaded;
      _turnParts = AssistantLiveTurnParts();
      publish(
        state.copyWith(
          userDraft: trimmed,
          userTranscript: '',
          assistantDraft: '',
          assistantTranscript: '',
          assistantParts: const [],
          isInterrupted: false,
        ),
      );

      return AssistantLiveDispatch.dispatched;
    } on Object {
      if (dispatchPossible) return AssistantLiveDispatch.unknown;
      return current()
          ? AssistantLiveDispatch.refused
          : AssistantLiveDispatch.stale;
    }
  }
}
