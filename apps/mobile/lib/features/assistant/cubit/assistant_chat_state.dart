// Assistant feature parity module: targeted lint suppressions keep the state
// definitions compact.
// ignore_for_file: lines_longer_than_80_chars, always_put_required_named_parameters_first

part of 'assistant_chat_cubit.dart';

const _assistantChatSentinel = Object();

enum AssistantHistoryStatus { loading, ready, offline, failed }

class AssistantChatState extends Equatable {
  const AssistantChatState({
    this.workspaceId,
    this.status = AssistantChatStatus.idle,
    this.hasLoadedOnce = false,
    this.creationOutcomeUnknown = false,
    this.unresolvedCreationAttempt,
    this.chat,
    this.storedChatId,
    required this.fallbackChatId,
    this.messages = const [],
    this.attachmentsByMessageId = const {},
    this.composerAttachments = const [],
    this.history = const [],
    this.historyStatus = AssistantHistoryStatus.loading,
    this.queuedMessages = const [],
    this.isComposerCollapsed = false,
    this.error,
    this.diagnostics,
    this.replyTarget,
    this.reactionResult,
  });

  final String? workspaceId;
  final AssistantChatStatus status;
  final bool hasLoadedOnce;
  final bool creationOutcomeUnknown;

  /// The first send whose chat creation was never confirmed. Only this, not
  /// every [creationOutcomeUnknown] hold, warrants the unsaved-chat notice.
  final String? unresolvedCreationAttempt;
  final AssistantChatRecord? chat;
  final String? storedChatId;
  final String fallbackChatId;
  final List<AssistantMessage> messages;
  final Map<String, List<AssistantAttachment>> attachmentsByMessageId;
  final List<AssistantAttachment> composerAttachments;
  final List<AssistantChatRecord> history;
  final AssistantHistoryStatus historyStatus;
  final List<String> queuedMessages;
  final bool isComposerCollapsed;
  final String? error;
  final SafeErrorDiagnostics? diagnostics;
  final AssistantMessage? replyTarget;
  final AssistantReactionResult? reactionResult;

  bool get isBusy =>
      status == AssistantChatStatus.submitting ||
      status == AssistantChatStatus.streaming;

  AssistantChatState copyWith({
    Object? workspaceId = _assistantChatSentinel,
    AssistantChatStatus? status,
    bool? hasLoadedOnce,
    bool? creationOutcomeUnknown,
    Object? unresolvedCreationAttempt = _assistantChatSentinel,
    Object? chat = _assistantChatSentinel,
    Object? storedChatId = _assistantChatSentinel,
    String? fallbackChatId,
    List<AssistantMessage>? messages,
    Map<String, List<AssistantAttachment>>? attachmentsByMessageId,
    List<AssistantAttachment>? composerAttachments,
    List<AssistantChatRecord>? history,
    AssistantHistoryStatus? historyStatus,
    List<String>? queuedMessages,
    bool? isComposerCollapsed,
    Object? error = _assistantChatSentinel,
    bool clearError = false,
    Object? diagnostics = _assistantChatSentinel,
    Object? replyTarget = _assistantChatSentinel,
    Object? reactionResult = _assistantChatSentinel,
  }) {
    return AssistantChatState(
      workspaceId: workspaceId == _assistantChatSentinel
          ? this.workspaceId
          : workspaceId as String?,
      status: status ?? this.status,
      hasLoadedOnce: hasLoadedOnce ?? this.hasLoadedOnce,
      creationOutcomeUnknown:
          creationOutcomeUnknown ?? this.creationOutcomeUnknown,
      unresolvedCreationAttempt:
          unresolvedCreationAttempt == _assistantChatSentinel
          ? this.unresolvedCreationAttempt
          : unresolvedCreationAttempt as String?,
      chat: chat == _assistantChatSentinel
          ? this.chat
          : chat as AssistantChatRecord?,
      storedChatId: storedChatId == _assistantChatSentinel
          ? this.storedChatId
          : storedChatId as String?,
      fallbackChatId: fallbackChatId ?? this.fallbackChatId,
      messages: messages ?? this.messages,
      attachmentsByMessageId:
          attachmentsByMessageId ?? this.attachmentsByMessageId,
      composerAttachments: composerAttachments ?? this.composerAttachments,
      history: history ?? this.history,
      historyStatus: historyStatus ?? this.historyStatus,
      queuedMessages: queuedMessages ?? this.queuedMessages,
      isComposerCollapsed: isComposerCollapsed ?? this.isComposerCollapsed,
      replyTarget: replyTarget == _assistantChatSentinel
          ? this.replyTarget
          : replyTarget as AssistantMessage?,
      reactionResult: reactionResult == _assistantChatSentinel
          ? this.reactionResult
          : reactionResult as AssistantReactionResult?,
      diagnostics: clearError
          ? null
          : diagnostics == _assistantChatSentinel
          ? error == _assistantChatSentinel
                ? this.diagnostics
                : null
          : diagnostics as SafeErrorDiagnostics?,
      error: clearError
          ? null
          : error == _assistantChatSentinel
          ? this.error
          : error as String?,
    );
  }

  @override
  List<Object?> get props => [
    workspaceId,
    status,
    hasLoadedOnce,
    creationOutcomeUnknown,
    unresolvedCreationAttempt,
    chat,
    storedChatId,
    fallbackChatId,
    messages,
    attachmentsByMessageId,
    composerAttachments,
    history,
    historyStatus,
    queuedMessages,
    isComposerCollapsed,
    error,
    diagnostics,
    replyTarget,
    reactionResult,
  ];
}
