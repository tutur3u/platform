import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/data/chat_stream_parser.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

part 'chat_state.dart';
part 'chat_cubit_actions.dart';

class ChatCubit extends Cubit<ChatState> {
  ChatCubit({
    ChatRepository? repository,
    ChatRealtimeClient? realtimeClient,
    String? Function()? currentUserId,
    CacheStore? cacheStore,
  }) : _currentUserId = currentUserId ?? currentCacheUserId,
       _ownerId = (currentUserId ?? currentCacheUserId)(),
       _store = cacheStore ?? CacheStore.instance,
       _repository = repository ?? ChatRepository(),
       _realtimeClient = realtimeClient ?? ChatRealtimeClient(),
       super(const ChatState()) {
    _ownerRevision = _store.resourceRevisionFor(_actorFence);
  }

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
  bool _refreshingFallback = false;
  int _loadToken = 0;
  int _searchRequestVersion = 0;

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
      emit(state.copyWith(status: ChatStatus.error, error: error.toString()));
    }
  }

  Future<void> refresh({bool quietly = false, bool fresh = false}) async {
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
        );
      } else {
        _syncConversationRoom();
      }
    } on ApiException catch (error) {
      if (!quietly && _scopeActive && token == _loadToken) {
        emit(state.copyWith(status: ChatStatus.error, error: error.message));
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
  }) async {
    final wsId = state.wsId;
    if (wsId == null || conversationId.isEmpty) return;
    if (!forceRefresh && state.selectedConversationId == conversationId) {
      return;
    }

    try {
      await _selectConversation(conversationId, fresh: fresh, quietly: quietly);
    } finally {
      _syncConversationRoom();
    }
  }

  Future<void> _selectConversation(
    String conversationId, {
    required bool fresh,
    required bool quietly,
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
      final messages = await _repository.listMessages(
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
      final allMessages = Map<String, List<ChatMessage>>.from(state.messages);
      allMessages[conversationId] = messages;
      emit(
        state.copyWith(
          messageStatus: ChatMessageStatus.loaded,
          messages: allMessages,
        ),
      );
      if (!quietly) {
        unawaited(_repository.markRead(wsId, conversationId));
        unawaited(loadConversationPanels());
      }
    } on ApiException catch (error) {
      if (!quietly &&
          _scopeActive &&
          wsId == state.wsId &&
          token == _loadToken &&
          state.selectedConversationId == conversationId) {
        emit(
          state.copyWith(
            messageStatus: ChatMessageStatus.error,
            error: error.message,
          ),
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

  Future<void> _refetchWhenRealtimeUnavailable() async {
    if (!_scopeActive || _refreshingFallback || state.isSending) return;
    _refreshingFallback = true;
    try {
      await refresh(fresh: true, quietly: true);
    } finally {
      _refreshingFallback = false;
    }
  }

  void _handleRealtimeEvent(ChatRealtimeEvent event, {required bool room}) {
    switch (event) {
      case ChatRealtimeConversationEvent(:final conversation):
        _upsertConversation(conversation);
      case ChatRealtimeConversationDeletedEvent(:final conversationId):
        _removeConversation(conversationId);
      case ChatRealtimeMessageEvent(:final message):
        _upsertMessage(message);
      case ChatRealtimeTypingEvent(
        :final conversationId,
        :final actorUserId,
        :final isTyping,
      ):
        if (conversationId != state.selectedConversationId ||
            actorUserId == null) {
          return;
        }
        final next = Set<String>.from(state.typingUserIds);
        isTyping ? next.add(actorUserId) : next.remove(actorUserId);
        emit(state.copyWith(typingUserIds: next));
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

  void _upsertConversation(
    ChatConversation conversation, {
    bool select = false,
  }) {
    final next = [...state.conversations];
    final index = next.indexWhere((item) => item.id == conversation.id);
    if (index >= 0) {
      next[index] = conversation;
    } else {
      next.add(conversation);
    }
    emit(
      state.copyWith(
        conversations: _sortConversations(next),
        selectedConversationId: select
            ? conversation.id
            : state.selectedConversationId,
      ),
    );
    if (select) _syncConversationRoom();
  }

  void _removeConversation(String conversationId) {
    final next = state.conversations
        .where((conversation) => conversation.id != conversationId)
        .toList(growable: false);
    final selectedId = state.selectedConversationId == conversationId
        ? _resolveSelectedConversationId(next)
        : state.selectedConversationId;
    final nextMessages = Map<String, List<ChatMessage>>.from(state.messages)
      ..remove(conversationId);
    emit(
      state.copyWith(
        conversations: next,
        messages: nextMessages,
        selectedConversationId: selectedId,
      ),
    );
    _syncConversationRoom();
  }

  void _upsertMessage(ChatMessage message) {
    final allMessages = Map<String, List<ChatMessage>>.from(state.messages);
    final messages = <ChatMessage>[
      ...(allMessages[message.conversationId] ?? const <ChatMessage>[]),
    ];
    final index = messages.indexWhere((item) => item.id == message.id);
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

  String? _resolveSelectedConversationId(
    List<ChatConversation> conversations, {
    String? preferredId,
  }) {
    if (preferredId != null &&
        conversations.any((conversation) => conversation.id == preferredId)) {
      return preferredId;
    }
    // Opening Chat starts at the conversation list. Only an explicit deep
    // link or a user selection opens a thread.
    return null;
  }

  List<ChatConversation> _sortConversations(
    List<ChatConversation> conversations,
  ) {
    return <String, ChatConversation>{
      for (final conversation in conversations) conversation.id: conversation,
    }.values.toList()..sort((left, right) {
      if (left.isPinned != right.isPinned) return left.isPinned ? -1 : 1;
      return right.updatedAt.compareTo(left.updatedAt);
    });
  }

  @override
  Future<void> close() async {
    _closing = true;
    ++_loadToken;
    ++_searchRequestVersion;
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
