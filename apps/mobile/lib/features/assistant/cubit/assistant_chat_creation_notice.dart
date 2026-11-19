part of 'assistant_chat_cubit.dart';

extension _AssistantChatCreationNotice on AssistantChatCubit {
  /// Keeps [AssistantChatState.unresolvedCreationAttempt] in step with the
  /// creation hold: a new hold reads its recorded attempt and a released hold
  /// drops it.
  void _observeCreationNotice(AssistantChatState from, AssistantChatState to) {
    if (!to.creationOutcomeUnknown) {
      if (to.unresolvedCreationAttempt != null) {
        scheduleMicrotask(() {
          if (!state.creationOutcomeUnknown &&
              state.unresolvedCreationAttempt != null) {
            _emitIfOpen(state.copyWith(unresolvedCreationAttempt: null));
          }
        });
      }
      return;
    }
    final wsId = to.workspaceId;
    if (wsId == null ||
        (from.creationOutcomeUnknown && from.workspaceId == wsId)) {
      return;
    }
    unawaited(_refreshCreationNotice(wsId));
  }

  Future<void> _refreshCreationNotice(String wsId) async {
    final version = _workspaceVersion;
    String? attempt;
    try {
      attempt = await _repository.unresolvedChatCreationAttempt(wsId);
    } on Object {
      // An unreadable scope is no evidence that a send went unsaved.
      attempt = null;
    }
    if (version != _workspaceVersion ||
        state.workspaceId != wsId ||
        !state.creationOutcomeUnknown ||
        state.unresolvedCreationAttempt == attempt) {
      return;
    }
    _emitIfOpen(state.copyWith(unresolvedCreationAttempt: attempt));
  }
}
