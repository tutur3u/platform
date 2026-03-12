// Assistant feature parity module: targeted lint suppressions keep the state
// definitions compact.
// ignore_for_file: lines_longer_than_80_chars, always_put_required_named_parameters_first

part of 'assistant_chat_cubit.dart';

const _assistantChatSentinel = Object();

class AssistantChatState extends Equatable {
  const AssistantChatState({
    this.workspaceId,
    this.status = AssistantChatStatus.idle,
    this.chat,
    this.storedChatId,
    required this.fallbackChatId,
    this.messages = const [],
    this.attachmentsByMessageId = const {},
    this.composerAttachments = const [],
    this.history = const [],
    this.queuedPreview,
    this.isComposerCollapsed = false,
    this.error,
  });

  final String? workspaceId;
  final AssistantChatStatus status;
  final AssistantChatRecord? chat;
  final String? storedChatId;
  final String fallbackChatId;
  final List<AssistantMessage> messages;
  final Map<String, List<AssistantAttachment>> attachmentsByMessageId;
  final List<AssistantAttachment> composerAttachments;
  final List<AssistantChatRecord> history;
  final String? queuedPreview;
  final bool isComposerCollapsed;
  final String? error;

  bool get isBusy =>
      status == AssistantChatStatus.submitting ||
      status == AssistantChatStatus.streaming;

  AssistantChatState copyWith({
    Object? workspaceId = _assistantChatSentinel,
    AssistantChatStatus? status,
    Object? chat = _assistantChatSentinel,
    Object? storedChatId = _assistantChatSentinel,
    String? fallbackChatId,
    List<AssistantMessage>? messages,
    Map<String, List<AssistantAttachment>>? attachmentsByMessageId,
    List<AssistantAttachment>? composerAttachments,
    List<AssistantChatRecord>? history,
    Object? queuedPreview = _assistantChatSentinel,
    bool? isComposerCollapsed,
    Object? error = _assistantChatSentinel,
    bool clearError = false,
  }) {
    return AssistantChatState(
      workspaceId: workspaceId == _assistantChatSentinel
          ? this.workspaceId
          : workspaceId as String?,
      status: status ?? this.status,
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
      queuedPreview: queuedPreview == _assistantChatSentinel
          ? this.queuedPreview
          : queuedPreview as String?,
      isComposerCollapsed: isComposerCollapsed ?? this.isComposerCollapsed,
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
    chat,
    storedChatId,
    fallbackChatId,
    messages,
    attachmentsByMessageId,
    composerAttachments,
    history,
    queuedPreview,
    isComposerCollapsed,
    error,
  ];
}
