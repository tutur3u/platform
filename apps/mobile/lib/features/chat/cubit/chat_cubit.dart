import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show AppLifecycleListener;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/chat/data/chat_link_preview_store.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/data/chat_typing_publisher.dart';
import 'package:mobile/features/chat/data/chat_typing_roster.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

part 'chat_state.dart';
part 'chat_cubit_actions.dart';
part 'chat_cubit_thread_actions.dart';
part 'chat_cubit_message_merge.dart';
part 'chat_cubit_sync.dart';
part 'chat_cubit_read_receipts.dart';
part 'chat_cubit_search.dart';
part 'chat_cubit_typing.dart';
part 'chat_cubit_safety.dart';

class ChatCubit extends Cubit<ChatState> {
  ChatCubit({
    ChatRepository? repository,
    ChatRealtimeClient? realtimeClient,
    String? Function()? currentUserId,
    CacheStore? cacheStore,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now,
       _currentUserId = currentUserId ?? currentCacheUserId,
       _ownerId = (currentUserId ?? currentCacheUserId)(),
       _store = cacheStore ?? CacheStore.instance,
       _repository = repository ?? ChatRepository(),
       _realtimeClient = realtimeClient ?? ChatRealtimeClient(),
       super(const ChatState()) {
    _ownerRevision = _store.resourceRevisionFor(_actorFence);
    OfflineMutationQueue.instance.pending.addListener(_onQueueChanged);
  }

  /// Ids of rows that are not on the server yet: queued sends, and replayed
  /// sends whose server copy has not replaced the local row.
  final Set<String> _unsyncedIds = {};

  /// Per conversation, the newest `createdAt` and the ids of rows that
  /// fetches returned. Rows appended by realtime or a live send are not
  /// included, so they cannot make a later page look contiguous.
  final Map<String, ({DateTime? end, Set<String> ids})> _fetched = {};

  /// Bumped per conversation whenever its fetched range is reset or
  /// replaced; an older-history page fetched across a bump is dropped.
  final Map<String, int> _rangeGeneration = {};

  /// When each conversation last loaded its newest page from the server.
  final Map<String, DateTime> _freshFetchedAt = {};

  /// The viewer's typing signal for the open thread, if one is announced.
  ({
    String conversationId,
    ChatTypingPublisher publisher,
    AppLifecycleListener? lifecycle,
  })?
  _typing;

  /// Other members typing in the open conversation.
  late final _typists = ChatTypingRoster(onChanged: _publishTypists);

  final DateTime Function() _now;
  final String? Function() _currentUserId;
  final String? _ownerId;
  final CacheStore _store;
  late final int _ownerRevision;
  bool _closing = false;
  CacheKey get _actorFence =>
      CacheKey(namespace: 'chat.actor', userId: _ownerId);
  bool get _scopeActive =>
      !isClosed &&
      !_closing &&
      _currentUserId() == _ownerId &&
      _store.resourceRevisionFor(_actorFence) == _ownerRevision;

  @override
  void emit(ChatState state) {
    if (_scopeActive) super.emit(state);
  }

  final ChatRepository _repository;
  final ChatRealtimeClient _realtimeClient;

  /// Server-resolved previews for links in messages.
  late final linkPreviews = ChatLinkPreviewStore(
    fetch: _repository.getLinkPreviews,
  );
  StreamSubscription<ChatRealtimeEvent>? _realtimeSubscription;
  StreamSubscription<ChatRealtimeEvent>? _roomSubscription;
  StreamSubscription<ChatMessageStreamEvent>? _sendSubscription;
  Timer? _inboxFallback;
  Timer? _roomFallback;
  String? _roomConversationId;
  static final RegExp _roomIdPattern = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  /// Whether [id] names a server conversation, not a local thread.
  static bool isServerConversationId(String id) => _roomIdPattern.hasMatch(id);
  bool _refreshingFallback = false;

  /// Messages per history page; a full page means older messages may exist.
  static const int messagePageSize = 60;

  /// A thread fetched from the server this recently is not revalidated.
  static const Duration revalidateAfter = Duration(seconds: 10);
  int _loadToken = 0;
  int _searchRequestVersion = 0;
  Timer? _searchDebounce;

  Future<String> attachmentReadUrl(ChatAttachment attachment) async {
    final wsId = state.wsId;
    if (wsId == null) {
      throw const ApiException(message: 'Workspace unavailable', statusCode: 0);
    }
    return await _repository.attachmentReadUrl(
      wsId,
      attachment.conversationId,
      attachment.id,
    );
  }

  void _emitState(ChatState nextState) {
    if (_scopeActive) emit(nextState);
  }

  bool _isPendingChatItem(String wsId, String entityId) =>
      OfflineMutationQueue.instance.pending.value.any(
        (record) =>
            record.feature == 'chat' &&
            record.workspaceId == wsId &&
            record.entityId == entityId,
      );

  /// Latest reaction operation per (message, emoji) and the state it asks
  /// for. An older operation's reply or rollback must not overwrite a newer
  /// tap, and a server copy for one emoji keeps the others' pending state.
  final Map<(String, String), ({String opId, bool present})>
  _latestReactionOps = {};

  Future<void> setWorkspace(
    String wsId, {
    bool canManageChat = false,
    String? initialConversationId,
  }) async {
    if (!_scopeActive) return;
    if (state.wsId == wsId &&
        state.status == ChatStatus.loaded &&
        initialConversationId == null) {
      return;
    }

    final token = ++_loadToken;
    _forgetFetchedRanges();
    _inboxFallback?.cancel();
    _inboxFallback = null;
    _roomFallback?.cancel();
    _roomFallback = null;
    await _realtimeSubscription?.cancel();
    _realtimeSubscription = null;
    await _roomSubscription?.cancel();
    _roomSubscription = null;
    _roomConversationId = null;
    if (!_scopeActive || token != _loadToken) return;
    emit(
      ChatState(
        wsId: wsId,
        canManageChat: canManageChat,
        selectedConversationId: initialConversationId,
        status: ChatStatus.loading,
      ),
    );
    unawaited(loadBlocks());

    try {
      final page = await _repository.listConversations(wsId);
      if (!_scopeActive || token != _loadToken) return;
      final selectedId = _resolveSelectedConversationId(
        page.conversations,
        preferredId: initialConversationId,
      );
      emit(
        state.copyWith(
          status: ChatStatus.loaded,
          conversations: _sortConversations(page.conversations),
          canModerate: page.canModerate,
          selectedConversationId: selectedId,
          nextOffset: page.nextOffset,
          clearError: true,
        ),
      );
      _startRealtime(wsId);
      if (selectedId != null) {
        await selectConversation(selectedId, forceRefresh: true);
      }
      unawaited(loadFriendRequests());
    } on ApiException catch (error) {
      if (!_scopeActive || token != _loadToken) return;
      emit(state.copyWith(status: ChatStatus.error, error: error.message));
    } on Object catch (error) {
      if (!_scopeActive || token != _loadToken) return;
      emit(
        state.copyWith(
          status: ChatStatus.error,
          error: _displayError(error, 'workspace load'),
        ),
      );
    }
  }

  /// Reloads the list and the open thread. A quiet refresh keeps the screen
  /// and merges history; with [reportFailure] a quiet failure still shows a
  /// toast, as pull to refresh needs.
  Future<void> refresh({
    bool quietly = false,
    bool fresh = false,
    bool reportFailure = false,
  }) async {
    final wsId = state.wsId;
    if (wsId == null) return;
    final token = quietly ? _loadToken : ++_loadToken;
    final archived = state.archivedFilter;
    if (!quietly) {
      emit(
        state.copyWith(
          status: ChatStatus.loading,
          isLoadingMore: false,
          clearError: true,
        ),
      );
    }

    try {
      final page = await _repository.listConversations(
        wsId,
        archived: archived,
        forceRefresh: fresh,
      );
      if (!_scopeActive ||
          token != _loadToken ||
          archived != state.archivedFilter) {
        return;
      }
      final selectedId = _resolveSelectedConversationId(
        page.conversations,
        preferredId: state.selectedConversationId,
      );
      emit(
        state.copyWith(
          status: ChatStatus.loaded,
          conversations: _sortConversations(page.conversations),
          canModerate: page.canModerate,
          selectedConversationId: selectedId,
          nextOffset: page.nextOffset,
          clearError: true,
        ),
      );
      if (selectedId != null) {
        await selectConversation(
          selectedId,
          forceRefresh: true,
          fresh: fresh,
          quietly: quietly,
          reportFailure: reportFailure,
        );
      } else {
        _syncConversationRoom();
      }
    } on Object catch (error) {
      if (!_scopeActive || token != _loadToken) return;
      if (!quietly) {
        emit(
          state.copyWith(
            status: ChatStatus.error,
            error: _displayError(error, 'refresh'),
          ),
        );
      } else if (reportFailure) {
        emit(state.copyWith(error: _failureNote(error, 'refresh')));
      } else {
        _failureNote(error, 'quiet refresh');
      }
    }
  }

  Future<void> loadMoreConversations() async {
    final wsId = state.wsId;
    final nextOffset = state.nextOffset;
    if (wsId == null || nextOffset == null || state.isLoadingMore) return;

    final token = _loadToken;
    final archived = state.archivedFilter;
    emit(state.copyWith(isLoadingMore: true));
    try {
      final page = await _repository.listConversations(
        wsId,
        archived: archived,
        offset: nextOffset,
      );
      if (!_scopeActive ||
          token != _loadToken ||
          state.wsId != wsId ||
          state.archivedFilter != archived) {
        return;
      }
      emit(
        state.copyWith(
          conversations: _sortConversations([
            ...state.conversations,
            ...page.conversations,
          ]),
          nextOffset: page.nextOffset,
          isLoadingMore: false,
        ),
      );
    } on ApiException catch (error) {
      if (_scopeActive &&
          token == _loadToken &&
          state.wsId == wsId &&
          state.archivedFilter == archived) {
        emit(state.copyWith(isLoadingMore: false, error: error.message));
      }
    }
  }

  Future<void> selectConversation(
    String conversationId, {
    bool forceRefresh = false,
    bool fresh = false,
    bool quietly = false,
    bool reportFailure = false,
  }) async {
    final wsId = state.wsId;
    if (wsId == null || conversationId.isEmpty) return;
    if (!forceRefresh && state.selectedConversationId == conversationId) {
      return;
    }

    try {
      await _selectConversation(
        conversationId,
        fresh: fresh,
        quietly: quietly,
        reportFailure: reportFailure,
      );
    } finally {
      _syncConversationRoom();
    }
  }

  Future<void> _selectConversation(
    String conversationId, {
    required bool fresh,
    required bool quietly,
    bool reportFailure = false,
  }) async {
    final wsId = state.wsId;
    if (wsId == null) return;
    final token = _loadToken;
    if (!quietly) {
      emit(
        state.copyWith(
          selectedConversationId: conversationId,
          messageStatus: ChatMessageStatus.loading,
          streamingAssistantText: '',
          sharedContent: null,
          aiSettings: null,
          aiObservability: null,
          replyToMessageId: state.selectedConversationId == conversationId
              ? state.replyToMessageId
              : null,
          clearError: true,
        ),
      );
    }

    final selected = state.selectedConversation;
    if (_isPendingChatItem(wsId, conversationId) &&
        state.messages[conversationId] == null) {
      emit(
        state.copyWith(
          messageStatus: ChatMessageStatus.loaded,
          messages: {...state.messages, conversationId: const <ChatMessage>[]},
        ),
      );
      return;
    }
    if (selected?.isReadOnlyAgent ?? false) {
      emit(
        state.copyWith(
          messageStatus: ChatMessageStatus.loaded,
          messages: {
            ...state.messages,
            conversationId: [
              if (selected!.latestMessage != null) selected.latestMessage!,
            ],
          },
        ),
      );
      return;
    }

    try {
      final page = await _repository.listMessagePage(
        wsId,
        conversationId,
        forceRefresh: fresh,
      );
      if (!_scopeActive ||
          wsId != state.wsId ||
          token != _loadToken ||
          state.selectedConversationId != conversationId) {
        return;
      }
      // A quiet refresh folds the newest page into the loaded thread so
      // older pages, the history cursor and the scroll position survive.
      _trackUnsynced(wsId, page.messages);
      final next = _mergeFetchedPage(conversationId, page, quietly: quietly);
      final replyId = state.replyToMessageId;
      emit(
        state.copyWith(
          messageStatus: ChatMessageStatus.loaded,
          messages: {...state.messages, conversationId: next.messages},
          hasOlderMessages: {
            ...state.hasOlderMessages,
            conversationId: next.hasOlder,
          },
          replyToMessageId:
              replyId != null &&
                  !next.messages.any((message) => message.id == replyId)
              ? null
              : replyId,
        ),
      );
      _pruneUnsynced();
      // Only a page that really came from the network starts the throttle;
      // a cached page, or a fresh read that fell back to the cache, does not.
      if (page.fromNetwork) _freshFetchedAt[conversationId] = _now();
      if (!quietly) {
        if (!page.fromNetwork) _revalidateThread(conversationId);
        _clearUnread(conversationId);
        unawaited(_repository.markRead(wsId, conversationId));
        unawaited(loadConversationPanels());
      }
    } on Object catch (error) {
      // Any failure (not only ApiException) ends this load, so one bad
      // state cannot break every later refresh.
      if (!quietly &&
          _scopeActive &&
          wsId == state.wsId &&
          token == _loadToken &&
          state.selectedConversationId == conversationId) {
        emit(
          state.copyWith(
            messageStatus: ChatMessageStatus.error,
            error: _displayError(error, 'thread load'),
          ),
        );
      } else if (quietly && reportFailure && _scopeActive) {
        // Pull to refresh reports a failed thread page as a toast.
        emit(state.copyWith(error: _failureNote(error, 'thread refresh')));
      } else {
        _failureNote(
          error,
          quietly ? 'quiet thread load' : 'superseded thread load',
        );
      }
    }
  }

  void _startRealtime(String wsId) {
    _realtimeSubscription = _realtimeClient.connect(wsId).listen((event) {
      if (!_scopeActive || state.wsId != wsId) return;
      _handleRealtimeEvent(event, room: false);
    });
  }

  void _handleRealtimeEvent(ChatRealtimeEvent event, {required bool room}) {
    switch (event) {
      case ChatRealtimeConversationEvent(:final conversation):
        _upsertConversation(conversation);
      case ChatRealtimeConversationDeletedEvent(:final conversationId):
        _removeConversation(conversationId);
      case ChatRealtimeMessageEvent(:final type, :final message):
        // Only a new message is new activity. Edits, deletions and reaction
        // echoes patch a loaded message in place, so an old message outside
        // the loaded pages is never appended and the list order holds.
        if (type == 'message.created') {
          if (_isFromBlockedSender(message)) return;
          _upsertMessage(message);
        } else {
          _patchMessage(message, replaceReactions: type == 'reaction.updated');
        }
      case ChatRealtimeTypingEvent():
        _applyRemoteTyping(event);
      case ChatRealtimeReadEvent():
        _applyReadCursor(event);
      case ChatRealtimeErrorEvent():
        final current = room ? _roomFallback : _inboxFallback;
        if (current != null) return;
        unawaited(_refetchWhenRealtimeUnavailable());
        final timer = Timer.periodic(const Duration(seconds: 30), (_) {
          unawaited(_refetchWhenRealtimeUnavailable());
        });
        if (room) {
          _roomFallback = timer;
        } else {
          _inboxFallback = timer;
        }
      case ChatRealtimeReadyEvent():
        if (room) {
          _roomFallback?.cancel();
          _roomFallback = null;
        } else {
          _inboxFallback?.cancel();
          _inboxFallback = null;
        }
      case ChatRealtimeResyncEvent():
        unawaited(_refetchWhenRealtimeUnavailable());
    }
  }

  /// Opens a conversation socket only for a real room id. Local threads such
  /// as `ai-chat-local` stay on the inbox socket.
  void _syncConversationRoom() {
    final wsId = state.wsId;
    final selected = state.selectedConversationId;
    final next = selected != null && _roomIdPattern.hasMatch(selected)
        ? selected
        : null;
    final sameRoom = next == _roomConversationId;
    final subscriptionMatches = (next == null) == (_roomSubscription == null);
    if (sameRoom && subscriptionMatches) return;
    _switchTypingRoom(next);
    _roomFallback?.cancel();
    _roomFallback = null;
    _roomConversationId = next;
    final previous = _roomSubscription;
    _roomSubscription = null;
    if (previous != null) unawaited(previous.cancel());
    if (wsId == null || next == null || !_scopeActive) return;
    _roomSubscription = _realtimeClient
        .connect(wsId, conversationId: next)
        .listen((event) {
          if (!_scopeActive ||
              state.wsId != wsId ||
              state.selectedConversationId != next) {
            return;
          }
          _handleRealtimeEvent(event, room: true);
        });
  }

  void _handleMessageStreamEvent(ChatMessageStreamEvent event) {
    switch (event) {
      case ChatStreamMessageEvent(:final message):
        _upsertMessage(message);
      case ChatStreamMessagesEvent(:final messages):
        messages.forEach(_upsertMessage);
      case ChatStreamAssistantDeltaEvent(:final delta):
        emit(
          state.copyWith(
            streamingAssistantText: state.streamingAssistantText + delta,
          ),
        );
      case ChatStreamAssistantPartEvent():
        break;
      case ChatStreamErrorEvent(:final message) when message == 'chat_blocked':
        final conversationId = state.selectedConversationId;
        if (conversationId != null) _markConversationBlocked(conversationId);
      case ChatStreamErrorEvent(:final message):
        emit(
          state.copyWith(
            error: message,
            isSending: false,
            streamingAssistantText: '',
          ),
        );
      case ChatStreamDoneEvent():
        emit(state.copyWith(isSending: false, streamingAssistantText: ''));
    }
  }

  void _upsertMessage(ChatMessage message) {
    final wsId = state.wsId;
    if (wsId != null) _trackUnsynced(wsId, [message]);
    final allMessages = Map<String, List<ChatMessage>>.from(state.messages);
    final messages = <ChatMessage>[
      ...(allMessages[message.conversationId] ?? const <ChatMessage>[]),
    ];
    // A replayed queued send arrives under its server id; it replaces the
    // local row that carries the same client request id.
    final index = messages.indexWhere(
      (item) =>
          item.id == message.id || _isReplayOf(local: item, server: message),
    );
    if (index >= 0 && messages[index].id != message.id) {
      _unsyncedIds.remove(messages[index].id);
    }
    if (index >= 0) {
      messages[index] = message;
    } else {
      messages.add(message);
    }
    messages.sort(
      (left, right) => (left.createdAt ?? DateTime(0)).compareTo(
        right.createdAt ?? DateTime(0),
      ),
    );
    allMessages[message.conversationId] = messages;

    final conversations = state.conversations
        .map((conversation) {
          if (conversation.id != message.conversationId) return conversation;
          return conversation.copyWith(
            latestMessage: message,
            updatedAt: message.createdAt ?? DateTime.now(),
          );
        })
        .toList(growable: false);

    emit(
      state.copyWith(
        messages: allMessages,
        conversations: _sortConversations(conversations),
      ),
    );
  }

  @override
  Future<void> close() async {
    _disposeTyping();
    _closing = true;
    OfflineMutationQueue.instance.pending.removeListener(_onQueueChanged);
    ++_loadToken;
    ++_searchRequestVersion;
    _searchDebounce?.cancel();
    await _sendSubscription?.cancel();
    _inboxFallback?.cancel();
    _inboxFallback = null;
    _roomFallback?.cancel();
    _roomFallback = null;
    await _realtimeSubscription?.cancel();
    final room = _roomSubscription;
    _roomSubscription = null;
    if (room != null) await room.cancel();
    _repository.dispose();
    _realtimeClient.dispose();
    return await super.close();
  }
}
