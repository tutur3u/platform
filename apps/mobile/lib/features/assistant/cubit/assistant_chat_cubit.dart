// Relative imports preserve the existing Assistant module layout.
// ignore_for_file: always_use_package_imports, lines_longer_than_80_chars, avoid_positional_boolean_parameters

import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/core/observability/mobile_observability.dart';
import 'package:mobile/core/observability/operational_error_reporter.dart';
import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import '../data/assistant_chat_persistence_contract.dart';
import '../data/assistant_preferences.dart';
import '../data/assistant_reaction_intent.dart';
import '../data/assistant_repository.dart';
import '../data/assistant_reset_preferences.dart';
import '../data/assistant_settings_selection.dart';
import '../data/assistant_stream_parser.dart';
import '../models/assistant_models.dart';
import 'assistant_tool_output.dart';

part 'assistant_chat_attachments.dart';
part 'assistant_chat_restore.dart';
part 'assistant_chat_reset.dart';
part 'assistant_chat_state.dart';
part 'assistant_chat_stream_reconcile.dart';
part 'assistant_chat_stream_events.dart';
part 'assistant_chat_submission.dart';
part 'assistant_chat_pending_submission.dart';
part 'assistant_chat_tool_effects.dart';
part 'assistant_chat_reactions.dart';

class AssistantChatCubit extends Cubit<AssistantChatState> {
  AssistantChatCubit({
    required AssistantRepository repository,
    required AssistantPreferences preferences,
    required Future<void> Function(String workspaceContextId)
    onWorkspaceContextChanged,
    required Future<void> Function() onSoulRefreshRequested,
    required void Function(bool isImmersive) onImmersiveModeChanged,
    required Future<void> Function(String? modelId) onChatRestored,
    this.onSettingsRestored,
    AssistantCreationSettingsPlan? Function(String, String, bool Function())?
    prepareCreationSettings,
    // Retained for existing constructors; an effectful callback cannot prepare.
    // ignore: avoid_unused_constructor_parameters
    Future<bool> Function(String contextId, bool Function() isCurrent)?
    onResetWorkspaceContext,
    AssistantPreparedResetContext? Function(String, bool Function())?
    prepareResetWorkspaceContext,
    void Function(SafeErrorDiagnostics diagnostics)? onSoulRefreshFailed,
    OperationalErrorReporter? operationalReporter,
    Future<void> Function(String theme, bool Function() isCurrent)?
    onThemeRequested,
  }) : _operationalReporter =
           operationalReporter ??
           MobileObservability.instance.operationalReporter,
       _prepareResetWorkspaceContext = prepareResetWorkspaceContext,
       _prepareCreationSettings = prepareCreationSettings,
       _onThemeRequested = onThemeRequested,
       _repository = repository,
       _preferences = preferences,
       _onWorkspaceContextChanged = onWorkspaceContextChanged,
       _onSoulRefreshRequested = onSoulRefreshRequested,
       _onSoulRefreshFailed = onSoulRefreshFailed,
       _onImmersiveModeChanged = onImmersiveModeChanged,
       _onChatRestored = onChatRestored,
       super(AssistantChatState(fallbackChatId: repository.generateUuid()));

  final AssistantPreparedResetContext? Function(String, bool Function())?
  _prepareResetWorkspaceContext;
  final _resetOperations = <Future<AssistantResetOutcome>>{};
  bool _closing = false;
  final Future<void> Function(String theme, bool Function() isCurrent)?
  _onThemeRequested;
  final OperationalErrorReporter _operationalReporter;
  final AssistantRepository _repository;
  final AssistantPreferences _preferences;
  final Future<void> Function(String workspaceContextId)
  _onWorkspaceContextChanged;
  final Future<void> Function() _onSoulRefreshRequested;
  final void Function(SafeErrorDiagnostics diagnostics)? _onSoulRefreshFailed;
  final void Function(bool isImmersive) _onImmersiveModeChanged;
  final Future<void> Function(String? modelId) _onChatRestored;
  final void Function(AssistantConversationSettings? settings)?
  onSettingsRestored;
  final AssistantCreationSettingsPlan? Function(
    String,
    String,
    bool Function(),
  )?
  _prepareCreationSettings;
  bool _hasChatCacheOrigin = false;
  final _chatCacheObservers = <Future<void>>{};
  String? _queuedSubmissionRequestId;
  AssistantQueuedSubmission? _queuedSubmissionEntry;
  String? _activeSubmissionRequestId;
  Timer? _queueDebounce;
  _AssistantReplySubscription? _streamSubscription;
  ApiMutationAdmission? _streamAdmission;
  final _streamCancellations = <Future<void>>{};
  final List<AssistantQueuedSubmission> _queue = [];
  int _workspaceVersion = 0;
  String? _messageActorId;
  final _reactionState = _AssistantReactionState();
  AssistantConversationSettings? _restoredSettings;
  void _publishRestoredSettings(AssistantConversationSettings? settings) {
    _restoredSettings = settings;
    onSettingsRestored?.call(settings);
  }

  int _historyVersion = 0;
  int _toolOperationVersion = 0;
  String? _activeAssistantMessageId;
  String? _activeTextBlockId;
  String? _activeReasoningBlockId;
  Future<String>? _pendingAttachmentChatId;
  String? _pendingAttachmentWorkspaceId;
  int? _pendingAttachmentWorkspaceVersion;

  void _emitIfOpen(AssistantChatState nextState) {
    if (!isClosed) {
      emit(nextState);
    }
  }

  Future<void> loadWorkspace(String wsId) => _loadWorkspace(wsId);

  Future<void> openChat(String wsId, AssistantChatRecord chat) =>
      _openChat(wsId, chat);

  Future<void> openChatById(String wsId, String chatId) =>
      _openChatById(wsId, chatId, forceRefresh: true);

  Future<void> refreshHistory() => _refreshHistory();

  List<AssistantAttachment> takeUploadedComposerAttachments({
    required List<AssistantAttachment> matching,
  }) {
    final uploaded = state.composerAttachments
        .where(
          (attachment) =>
              attachment.isUploaded && matching.contains(attachment),
        )
        .toList(growable: false);
    if (uploaded.isEmpty) {
      return const [];
    }
    emit(
      state.copyWith(
        composerAttachments: state.composerAttachments
            .where((attachment) => !uploaded.contains(attachment))
            .toList(growable: false),
      ),
    );
    return uploaded;
  }

  final _nativePending =
      <(String?, String, String?), _NativePendingSubmission>{};
  bool _nativeReconciliationActive = false;
  final _submissionObserverCleanups = <Future<void>>{};
  final _submissionAcks =
      <
        String,
        ({
          Completer<AssistantSubmissionOutcome> result,
          String text,
          List<AssistantAttachment> attachments,
        })
      >{};

  Future<AssistantSubmissionOutcome> submitAcknowledged({
    required String wsId,
    required String message,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    bool Function()? isCurrent,
  }) => _submitAcknowledged(
    wsId: wsId,
    message: message,
    modelId: modelId,
    thinkingMode: thinkingMode,
    creditSource: creditSource,
    workspaceContextId: workspaceContextId,
    timezone: timezone,
    creditWsId: creditWsId,
    isCurrent: isCurrent,
  );

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
    bool Function()? isCurrent,
  }) async {
    await _submit(
      wsId: wsId,
      message: message,
      modelId: modelId,
      thinkingMode: thinkingMode,
      creditSource: creditSource,
      workspaceContextId: workspaceContextId,
      timezone: timezone,
      creditWsId: creditWsId,
      retryMessageId: retryMessageId,
      isCurrent: isCurrent,
    );
  }

  Future<void> stopStreaming({bool discardQueued = false}) =>
      _stopStreaming(discardQueued: discardQueued);

  Future<void> retryLast({
    required String wsId,
    required String modelId,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String workspaceContextId,
    required String timezone,
    String? creditWsId,
    bool Function()? isCurrent,
  }) async {
    if (isCurrent != null && !isCurrent()) return;
    final lastUserMessage = state.messages.lastWhere(
      (message) => message.role == 'user',
      orElse: () => const AssistantMessage(id: '', role: 'user'),
    );
    if (lastUserMessage.id.isEmpty) return;
    if (state.creationOutcomeUnknown ||
        lastUserMessage.clientRequestId == null) {
      emit(
        state.copyWith(
          status: AssistantChatStatus.error,
          error: state.creationOutcomeUnknown
              ? 'Assistant creation outcome requires review.'
              : 'Original assistant request identity is unavailable. Reload history before retrying.',
        ),
      );
      return;
    }

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
      isCurrent: isCurrent,
    );
  }

  Future<bool> resetConversation(
    String wsId, {
    bool acknowledgeUnknownCreation = false,
  }) => _resetConversationBoolean(wsId, acknowledgeUnknownCreation);

  Map<String, dynamic> buildExportPayload({
    required String wsId,
    required AssistantGatewayModel model,
    required AssistantThinkingMode thinkingMode,
  }) =>
      _buildExportPayload(wsId: wsId, model: model, thinkingMode: thinkingMode);

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

  void _finalizeToolParts() {
    if ((_activeAssistantMessageId ?? '').isEmpty) return;

    final updated = state.messages.map<AssistantMessage>((message) {
      if (message.id != _activeAssistantMessageId) return message;

      final parts = message.parts.map((part) {
        if (part.type != 'dynamic-tool') return part;

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

  Future<void> _cancelReplyStream() async {
    final cancelSubscription = _streamSubscription?.cancel;
    final admission = _streamAdmission;
    _streamSubscription = null;
    _streamAdmission = null;
    final cancellations = _streamCancellations.toList();
    final Future<void>? operation;
    if (cancelSubscription == null) {
      operation = null;
    } else {
      Future<void> cancel() async {
        try {
          await cancelSubscription();
        } on ApiMutationNotDispatched catch (error) {
          if (admission == null ||
              !identical(error.admission, admission) ||
              !admission.definitelyNotDispatched) {
            rethrow;
          }
        }
      }

      operation = cancel();
      _streamCancellations.add(operation);
      cancellations.add(operation);
    }
    try {
      await Future.wait(cancellations);
    } finally {
      if (operation != null) _streamCancellations.remove(operation);
    }
  }

  @override
  Future<void> close() async {
    _closing = true;
    _workspaceVersion++;
    _repository.invalidateChatCreation();
    _queueDebounce?.cancel();
    await _cancelReplyStream();
    await super.close();
    await Future.wait(_resetOperations.toList());
    await Future.wait(_submissionObserverCleanups.toList());
    await Future.wait(_chatCacheObservers.toList());
    if (_hasChatCacheOrigin) await _repository.drainAssistantChatCache();
  }
}
