// Relative imports preserve the existing Assistant module layout.
// ignore_for_file: always_use_package_imports, lines_longer_than_80_chars, avoid_positional_boolean_parameters, inference_failure_on_collection_literal, avoid_single_cascade_in_expression_statements, unnecessary_breaks

import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';

import '../data/assistant_preferences.dart';
import '../data/assistant_repository.dart';
import '../data/assistant_stream_parser.dart';
import '../models/assistant_models.dart';
import 'assistant_tool_output.dart';

part 'assistant_chat_attachments.dart';
part 'assistant_chat_restore.dart';
part 'assistant_chat_state.dart';
part 'assistant_chat_stream_reconcile.dart';

class AssistantChatCubit extends Cubit<AssistantChatState> {
  AssistantChatCubit({
    required AssistantRepository repository,
    required AssistantPreferences preferences,
    required Future<void> Function(String workspaceContextId)
    onWorkspaceContextChanged,
    required Future<void> Function() onSoulRefreshRequested,
    required void Function(bool isImmersive) onImmersiveModeChanged,
    required Future<void> Function(String? modelId) onChatRestored,
  }) : _repository = repository,
       _preferences = preferences,
       _onWorkspaceContextChanged = onWorkspaceContextChanged,
       _onSoulRefreshRequested = onSoulRefreshRequested,
       _onImmersiveModeChanged = onImmersiveModeChanged,
       _onChatRestored = onChatRestored,
       super(AssistantChatState(fallbackChatId: repository.generateUuid()));

  final AssistantRepository _repository;
  final AssistantPreferences _preferences;
  final Future<void> Function(String workspaceContextId)
  _onWorkspaceContextChanged;
  final Future<void> Function() _onSoulRefreshRequested;
  final void Function(bool isImmersive) _onImmersiveModeChanged;
  final Future<void> Function(String? modelId) _onChatRestored;

  Timer? _queueDebounce;
  StreamSubscription<AssistantStreamEvent>? _streamSubscription;
  final List<AssistantQueuedSubmission> _queue = [];
  int _workspaceVersion = 0;
  int _historyVersion = 0;
  String? _activeAssistantMessageId;
  String? _activeTextBlockId;
  String? _activeReasoningBlockId;
  Future<String>? _pendingAttachmentChatId;
  String? _pendingAttachmentWorkspaceId;
  int? _pendingAttachmentWorkspaceVersion;

  void _emitIfOpen(AssistantChatState nextState) {
    if (isClosed) {
      return;
    }
    emit(nextState);
  }

  Future<void> loadWorkspace(String wsId) => _loadWorkspace(wsId);

  Future<void> openChat(String wsId, AssistantChatRecord chat) =>
      _openChat(wsId, chat);

  Future<void> openChatById(String wsId, String chatId) =>
      _openChatById(wsId, chatId, forceRefresh: true);

  Future<void> refreshHistory() => _refreshHistory();

  List<AssistantAttachment> takeUploadedComposerAttachments() {
    final uploaded = state.composerAttachments
        .where((attachment) => attachment.isUploaded)
        .toList(growable: false);
    if (uploaded.isEmpty) {
      return const [];
    }

    emit(
      state.copyWith(
        composerAttachments: state.composerAttachments
            .where((attachment) => !attachment.isUploaded)
            .toList(growable: false),
      ),
    );
    return uploaded;
  }

  Future<void> submit({
    required String wsId,
    required String message,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    String? retryMessageId,
  }) async {
    final trimmed = message.trim();
    final uploadedAttachments = retryMessageId == null
        ? state.composerAttachments
              .where((attachment) => attachment.isUploaded)
              .toList()
        : (state.attachmentsByMessageId[retryMessageId] ??
                  const <AssistantAttachment>[])
              .where((attachment) => attachment.isUploaded)
              .toList();
    if (trimmed.isEmpty && uploadedAttachments.isEmpty) {
      return;
    }

    // Preserve the selected conversation until its identity and messages load.
    if (state.status == AssistantChatStatus.restoring) return;
    final queueMessage = trimmed.isEmpty
        ? 'Please analyze the attached file(s).'
        : trimmed;
    final queued = AssistantQueuedSubmission(
      message: queueMessage,
      attachments: uploadedAttachments,
    );

    final isDuplicate = _queue.any((item) => item.message == queued.message);
    if (!isDuplicate || uploadedAttachments.isNotEmpty) {
      _queue.add(queued);
    }

    final shouldPrimeUi = _shouldPrimeConversationUi(uploadedAttachments);
    final queuedMessages = _queue
        .map((item) => item.message)
        .toList(growable: false);

    if (shouldPrimeUi) {
      final optimisticMessage = AssistantMessage(
        id: _repository.generateUuid(),
        role: 'user',
        parts: [AssistantMessagePart(type: 'text', text: queueMessage)],
        createdAt: DateTime.now(),
      );
      final nextAttachments = Map<String, List<AssistantAttachment>>.from(
        state.attachmentsByMessageId,
      );
      if (uploadedAttachments.isNotEmpty) {
        nextAttachments[optimisticMessage.id] = uploadedAttachments;
      }

      emit(
        state.copyWith(
          queuedMessages: queuedMessages,
          chat: AssistantChatRecord(
            id: state.fallbackChatId,
            model: modelId,
            createdAt: DateTime.now(),
          ),
          messages: [...state.messages, optimisticMessage],
          attachmentsByMessageId: nextAttachments,
          composerAttachments: const [],
          clearError: true,
        ),
      );
    } else {
      emit(state.copyWith(queuedMessages: queuedMessages, clearError: true));
    }

    if (state.isBusy) {
      await stopStreaming();
    }

    _queueDebounce?.cancel();
    _queueDebounce = Timer(const Duration(milliseconds: 220), () {
      unawaited(
        _flushQueue(
          wsId: wsId,
          modelId: modelId,
          thinkingMode: thinkingMode,
          creditSource: creditSource,
          workspaceContextId: workspaceContextId,
          timezone: timezone,
          creditWsId: creditWsId,
          retryMessageId: retryMessageId,
        ),
      );
    });
  }

  Future<void> stopStreaming() async {
    _queueDebounce?.cancel();
    await _streamSubscription?.cancel();
    _streamSubscription = null;
    emit(state.copyWith(status: AssistantChatStatus.idle));
  }

  Future<void> retryLast({
    required String wsId,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
  }) async {
    final lastUserMessage = state.messages.lastWhere(
      (message) => message.role == 'user',
      orElse: () => const AssistantMessage(id: '', role: 'user'),
    );
    if (lastUserMessage.id.isEmpty) return;
    final text = lastUserMessage.parts
        .where((part) => part.type == 'text')
        .map((part) => part.text ?? '')
        .join('\n');
    if (text.trim().isEmpty) return;

    final retryIndex = state.messages.lastIndexWhere(
      (message) => message.id == lastUserMessage.id,
    );
    if (retryIndex < 0) return;
    emit(
      state.copyWith(
        messages: state.messages.take(retryIndex + 1).toList(growable: false),
        clearError: true,
      ),
    );

    await submit(
      wsId: wsId,
      message: text,
      modelId: modelId,
      thinkingMode: thinkingMode,
      creditSource: creditSource,
      workspaceContextId: workspaceContextId,
      timezone: timezone,
      creditWsId: creditWsId,
      retryMessageId: lastUserMessage.id,
    );
  }

  Future<void> resetConversation(String wsId) async {
    final version = ++_workspaceVersion;
    await stopStreaming();
    if (isClosed || version != _workspaceVersion) return;
    _queue.clear();
    await _preferences.clearChatId(
      wsId,
      shouldWrite: () => !isClosed && version == _workspaceVersion,
    );
    await _preferences.saveWorkspaceContextId(
      wsId,
      'personal',
      shouldWrite: () => !isClosed && version == _workspaceVersion,
    );
    if (isClosed || version != _workspaceVersion) return;
    emit(
      state.copyWith(
        status: AssistantChatStatus.idle,
        chat: null,
        storedChatId: null,
        messages: const [],
        attachmentsByMessageId: const {},
        composerAttachments: const [],
        fallbackChatId: _repository.generateUuid(),
        queuedMessages: const [],
      ),
    );
    await _onWorkspaceContextChanged('personal');
    await _onChatRestored(null);
  }

  Map<String, dynamic> buildExportPayload({
    required String wsId,
    required AssistantGatewayModel model,
    required AssistantThinkingMode thinkingMode,
  }) {
    final chatId = state.chat?.id ?? state.fallbackChatId;
    return {
      'exportedAt': DateTime.now().toIso8601String(),
      'wsId': wsId,
      'chatId': chatId,
      'fallbackChatId': state.fallbackChatId,
      'status': state.status.name,
      'model': model.toJson(),
      'thinkingMode': thinkingMode.name,
      'chat': state.chat?.toJson(),
      'messages': state.messages.map((message) => message.toJson()).toList(),
      'messageAttachments': state.attachmentsByMessageId.map(
        (key, value) => MapEntry(
          key,
          value.map((attachment) => attachment.toJson()).toList(),
        ),
      ),
    };
  }

  Future<void> _flushQueue({
    required String wsId,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    String? retryMessageId,
  }) async {
    if (_queue.isEmpty) return;

    try {
      final unique = <String>[];
      for (final item in _queue) {
        if (!unique.contains(item.message)) {
          unique.add(item.message);
        }
      }
      final attachments = _queue.expand((item) => item.attachments).toList();
      _queue..clear();

      final combined = unique.join('\n\n');
      var chat = state.chat;
      var chatId = chat?.id ?? state.fallbackChatId;

      emit(
        state.copyWith(
          status: AssistantChatStatus.submitting,
          queuedMessages: const [],
          clearError: true,
        ),
      );

      if (chat == null || state.storedChatId == null) {
        final created = await _repository.createChat(
          id: chatId,
          wsId: wsId,
          modelId: modelId,
          message: combined,
          timezone: timezone,
        );
        chat = created;
        chatId = created.id;
        await _preferences.saveChatId(wsId, chatId);
        emit(state.copyWith(chat: created, storedChatId: chatId));
        // History is secondary to the first response. Refresh it without
        // delaying the stream after a conversation is created.
        unawaited(refreshHistory());
      }

      final shouldAppendUserMessage =
          retryMessageId == null &&
          !_matchesLatestQueuedMessage(state, combined, attachments);

      var nextMessages = state.messages;
      final attachmentsByMessageId =
          Map<String, List<AssistantAttachment>>.from(
            state.attachmentsByMessageId,
          );

      if (shouldAppendUserMessage) {
        final userMessage = AssistantMessage(
          id: _repository.generateUuid(),
          role: 'user',
          parts: [AssistantMessagePart(type: 'text', text: combined)],
          createdAt: DateTime.now(),
        );

        if (attachments.isNotEmpty) {
          attachmentsByMessageId[userMessage.id] = attachments;
        }

        nextMessages = [...state.messages, userMessage];
        emit(
          state.copyWith(
            messages: nextMessages,
            attachmentsByMessageId: attachmentsByMessageId,
            composerAttachments: const [],
          ),
        );
      }

      _activeAssistantMessageId = null;
      _activeTextBlockId = null;
      _activeReasoningBlockId = null;

      _streamSubscription = _repository
          .streamChat(
            chatId: chatId,
            wsId: wsId,
            workspaceContextId: workspaceContextId,
            modelId: modelId,
            messages: nextMessages,
            thinkingMode: thinkingMode,
            creditSource: creditSource,
            timezone: timezone,
            attachments: attachments,
            creditWsId: creditWsId,
          )
          .listen(
            _handleStreamEvent,
            onError: (Object error, StackTrace stackTrace) {
              emit(
                state.copyWith(
                  messages: _withoutEmptyAssistantReply(
                    state.messages,
                    _activeAssistantMessageId,
                  ),
                  status: AssistantChatStatus.error,
                  error: error.toString(),
                ),
              );
            },
            onDone: () async {
              _streamSubscription = null;
              _finalizeToolParts();
              if (isClosed || state.status == AssistantChatStatus.error) return;
              emit(state.copyWith(status: AssistantChatStatus.idle));
              _persistAssistantChatCache();
            },
            cancelOnError: false,
          );
    } on Exception catch (error) {
      emit(
        state.copyWith(
          messages: _withoutEmptyAssistantReply(
            state.messages,
            _activeAssistantMessageId,
          ),
          status: AssistantChatStatus.error,
          error: error.toString(),
        ),
      );
    }
  }

  bool _shouldPrimeConversationUi(List<AssistantAttachment> attachments) {
    return state.chat == null &&
        state.storedChatId == null &&
        state.messages.isEmpty &&
        !state.isBusy &&
        (attachments.isNotEmpty || _queue.isNotEmpty);
  }

  void _handleStreamEvent(AssistantStreamEvent event) {
    if (isClosed || state.status == AssistantChatStatus.error) return;
    if (event is AssistantDoneStreamEvent) {
      emit(state.copyWith(status: AssistantChatStatus.idle));
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
        emit(state.copyWith(status: AssistantChatStatus.streaming));
        break;
      case 'saved-message':
        _reconcileSavedMessage(payload);
        break;
      case 'text-start':
        _activeTextBlockId = payload['id'] as String?;
        emit(state.copyWith(status: AssistantChatStatus.streaming));
        break;
      case 'text-delta':
        _appendTextPart(
          blockId: payload['id'] as String?,
          delta: payload['delta'] as String? ?? '',
        );
        break;
      case 'reasoning-start':
        _activeReasoningBlockId = payload['id'] as String?;
        emit(state.copyWith(status: AssistantChatStatus.streaming));
        break;
      case 'reasoning-delta':
        _appendReasoningPart(
          blockId: payload['id'] as String?,
          delta: payload['delta'] as String? ?? '',
        );
        break;
      case 'source-url':
        _appendPart(
          AssistantMessagePart(
            type: 'source-url',
            sourceId: payload['sourceId'] as String?,
            url: payload['url'] as String?,
            title: payload['title'] as String?,
          ),
        );
        break;
      case 'tool-input-start':
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: payload['toolName'] as String?,
          toolState: 'input-streaming',
          input: const {},
        );
        break;
      case 'tool-input-delta':
        _appendToolInputText(
          toolCallId: payload['toolCallId'] as String?,
          delta: payload['inputTextDelta'] as String? ?? '',
        );
        break;
      case 'tool-input-available':
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: payload['toolName'] as String?,
          toolState: 'input-available',
          input: payload['input'],
        );
        break;
      case 'tool-output-available':
        _upsertToolPart(
          toolCallId: payload['toolCallId'] as String?,
          toolName: payload['toolName'] as String?,
          toolState: 'output-available',
          output: payload['output'],
        );
        unawaited(_handleToolSideEffect(payload));
        break;
      case 'start-step':
        _appendPart(const AssistantMessagePart(type: 'step-start'));
        break;
      case 'error':
        emit(
          state.copyWith(
            messages: _withoutEmptyAssistantReply(
              state.messages,
              _activeAssistantMessageId,
            ),
            status: AssistantChatStatus.error,
            error:
                payload['errorText'] as String? ?? 'Assistant stream failed.',
          ),
        );
        break;
      case 'finish':
      case 'finish-step':
      case 'text-end':
      case 'reasoning-end':
      case 'abort':
        emit(state.copyWith(status: AssistantChatStatus.streaming));
        break;
      default:
        break;
    }
  }

  void _reconcileSavedMessage(Map<String, dynamic> payload) {
    final savedId = payload['messageId'] as String?;
    if (savedId == null || savedId.isEmpty) return;
    final result = _reconcileSavedAssistantMessage(
      state.messages,
      streamedId: _activeAssistantMessageId,
      savedId: savedId,
      savedText: payload['text'] as String? ?? '',
    );
    _activeAssistantMessageId = savedId;
    emit(state.copyWith(messages: result));
  }

  void _ensureAssistantMessage(String messageId) {
    if (state.messages.any((message) => message.id == messageId)) return;
    emit(
      state.copyWith(
        messages: [
          ...state.messages,
          AssistantMessage(
            id: messageId,
            role: 'assistant',
            createdAt: DateTime.now(),
          ),
        ],
      ),
    );
  }

  Future<void> _handleToolSideEffect(Map<String, dynamic> payload) async {
    final toolName = payload['toolName'] as String?;
    final output = payload['output'];

    if (toolName == 'set_workspace_context') {
      final contextId = readWorkspaceContextId(output);
      if (contextId != null && contextId.isNotEmpty) {
        await _onWorkspaceContextChanged(contextId);
      }
    }

    if (toolName == 'update_my_settings') {
      await _onSoulRefreshRequested();
    }

    if (toolName == 'set_immersive_mode') {
      final isImmersive = readImmersiveFlag(output);
      _onImmersiveModeChanged(isImmersive);
    }
  }

  void _appendTextPart({required String? blockId, required String delta}) {
    if ((_activeAssistantMessageId ?? '').isEmpty || delta.isEmpty) return;
    _ensureAssistantMessage(_activeAssistantMessageId!);

    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;

      final parts = List<AssistantMessagePart>.from(message.parts);
      final index = parts.lastIndexWhere(
        (part) =>
            part.type == 'text' &&
            part.blockId == (blockId ?? _activeTextBlockId),
      );

      if (index == -1) {
        parts.add(
          AssistantMessagePart(
            type: 'text',
            text: delta,
            blockId: blockId ?? _activeTextBlockId,
          ),
        );
      } else {
        final existing = parts[index];
        parts[index] = existing.copyWith(text: '${existing.text ?? ''}$delta');
      }
      return message.copyWith(parts: parts);
    }).toList();

    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _appendReasoningPart({required String? blockId, required String delta}) {
    if ((_activeAssistantMessageId ?? '').isEmpty || delta.isEmpty) return;
    _ensureAssistantMessage(_activeAssistantMessageId!);

    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;

      final parts = List<AssistantMessagePart>.from(message.parts);
      final index = parts.lastIndexWhere(
        (part) =>
            part.type == 'reasoning' &&
            part.blockId == (blockId ?? _activeReasoningBlockId),
      );

      if (index == -1) {
        parts.add(
          AssistantMessagePart(
            type: 'reasoning',
            text: delta,
            blockId: blockId ?? _activeReasoningBlockId,
          ),
        );
      } else {
        final existing = parts[index];
        parts[index] = existing.copyWith(text: '${existing.text ?? ''}$delta');
      }
      return message.copyWith(parts: parts);
    }).toList();

    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _appendPart(AssistantMessagePart part) {
    if ((_activeAssistantMessageId ?? '').isEmpty) return;
    _ensureAssistantMessage(_activeAssistantMessageId!);
    final updated = state.messages.map((message) {
      if (message.id != _activeAssistantMessageId) return message;
      return message.copyWith(parts: [...message.parts, part]);
    }).toList();
    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _upsertToolPart({
    required String? toolCallId,
    required String? toolName,
    String? toolState,
    dynamic input,
    dynamic output,
  }) {
    if ((_activeAssistantMessageId ?? '').isEmpty) return;
    _ensureAssistantMessage(_activeAssistantMessageId!);

    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;

      final parts = List<AssistantMessagePart>.from(message.parts);
      final index = parts.lastIndexWhere(
        (part) => part.type == 'dynamic-tool' && part.toolCallId == toolCallId,
      );

      final nextPart = AssistantMessagePart(
        type: 'dynamic-tool',
        toolCallId: toolCallId,
        toolName: toolName,
        state: toolState,
        input: input,
        output: output,
      );

      if (index == -1) {
        parts.add(nextPart);
      } else {
        parts[index] = parts[index].copyWith(
          toolName: toolName ?? parts[index].toolName,
          state: toolState ?? parts[index].state,
          input: input ?? parts[index].input,
          output: output ?? parts[index].output,
        );
      }

      return message.copyWith(parts: parts);
    }).toList();

    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _appendToolInputText({
    required String? toolCallId,
    required String delta,
  }) {
    if ((_activeAssistantMessageId ?? '').isEmpty || delta.isEmpty) return;
    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;
      final parts = List<AssistantMessagePart>.from(message.parts);
      final index = parts.lastIndexWhere(
        (part) => part.type == 'dynamic-tool' && part.toolCallId == toolCallId,
      );
      if (index == -1) {
        parts.add(
          AssistantMessagePart(
            type: 'dynamic-tool',
            toolCallId: toolCallId,
            state: 'input-streaming',
            input: {'inputText': delta},
          ),
        );
      } else {
        final existingInput = parts[index].input;
        final previousText = existingInput is Map<String, dynamic>
            ? existingInput['inputText'] as String? ?? ''
            : '';
        parts[index] = parts[index].copyWith(
          input: {'inputText': '$previousText$delta'},
          state: 'input-streaming',
        );
      }
      return message.copyWith(parts: parts);
    }).toList();

    emit(
      state.copyWith(messages: updated, status: AssistantChatStatus.streaming),
    );
  }

  void _persistAssistantChatCache() {
    final wsId = state.workspaceId;
    final chatId = state.chat?.id ?? state.storedChatId;
    if (wsId == null || chatId == null) {
      return;
    }
    if (state.messages.isEmpty && state.chat == null) {
      return;
    }
    unawaited(
      _repository.writeAssistantChatCache(
        wsId: wsId,
        chatId: chatId,
        restored: AssistantRestoredChat(
          chat: state.chat,
          messages: state.messages,
          attachmentsByMessageId: state.attachmentsByMessageId,
        ),
      ),
    );
  }

  void _finalizeToolParts() {
    if ((_activeAssistantMessageId ?? '').isEmpty) return;

    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;

      final parts = message.parts.map((part) {
        if (part.type != 'dynamic-tool') return part;

        // Mark any streaming tool as completed
        final isStreaming =
            part.state == 'input-streaming' ||
            part.state == 'input-start' ||
            part.state == 'output-streaming' ||
            part.state == 'output-start';

        if (isStreaming) {
          return part.copyWith(state: 'completed');
        }
        return part;
      }).toList();

      return message.copyWith(parts: parts);
    }).toList();

    emit(state.copyWith(messages: updated));
  }

  @override
  Future<void> close() async {
    _queueDebounce?.cancel();
    await _streamSubscription?.cancel();
    return await super.close();
  }
}
