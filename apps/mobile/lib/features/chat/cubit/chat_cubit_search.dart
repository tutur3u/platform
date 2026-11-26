part of 'chat_cubit.dart';

/// Search across the workspace: conversations by title or member name and
/// messages by text, both answered by the server once the query has two
/// characters, as on web.
extension ChatCubitSearch on ChatCubit {
  static const minQueryLength = 2;
  static const debounce = Duration(milliseconds: 300);

  /// Searches for [query] once typing pauses for [debounce]. A query under
  /// [minQueryLength] clears the results at once.
  void search(String query) {
    _searchDebounce?.cancel();
    if (query.trim().length < minQueryLength) {
      unawaited(searchMessages(query));
      return;
    }
    _searchDebounce = Timer(debounce, () => unawaited(searchMessages(query)));
  }

  /// Searches for [query] now. Only the latest search may publish results.
  Future<void> searchMessages(String query) async {
    if (!_scopeActive) return;
    final requestVersion = ++_searchRequestVersion;
    final wsId = state.wsId;
    final trimmed = query.trim();
    if (wsId == null || trimmed.length < minQueryLength) {
      _emitState(
        state.copyWith(
          searchResults: const [],
          conversationSearchResults: null,
        ),
      );
      return;
    }
    bool current() =>
        _scopeActive &&
        requestVersion == _searchRequestVersion &&
        state.wsId == wsId;
    final archived = state.archivedFilter;
    await Future.wait([
      _repository
          .searchConversations(wsId, trimmed, archived: archived)
          .then((page) {
            if (current()) {
              _emitState(
                state.copyWith(conversationSearchResults: page.conversations),
              );
            }
          })
          // The loaded list stays matched by name when the server cannot
          // answer, as offline.
          .catchError((Object error) {
            _failureNote(error, 'conversation search');
          }),
      _repository
          .searchMessages(wsId, trimmed)
          .then((messages) {
            if (current()) {
              _emitState(state.copyWith(searchResults: messages));
            }
          })
          .catchError((Object error) {
            if (!current()) return;
            if (error is ApiException) {
              _emitState(state.copyWith(error: error.message));
            } else {
              _failureNote(error, 'message search');
            }
          }),
    ]);
  }

  /// Opens a search result, adding it to the list when the server found a
  /// conversation that is not loaded yet.
  Future<void> openSearchResult(String conversationId) async {
    final found = state.conversationSearchResults?.where(
      (conversation) => conversation.id == conversationId,
    );
    if (found != null &&
        found.isNotEmpty &&
        !state.conversations.any((item) => item.id == conversationId)) {
      _upsertConversation(found.first);
    }
    await selectConversation(conversationId, forceRefresh: true);
  }
}
