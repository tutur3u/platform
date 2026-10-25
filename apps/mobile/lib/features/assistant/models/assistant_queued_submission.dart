part of 'assistant_models.dart';

class AssistantQueuedSubmission extends Equatable {
  const AssistantQueuedSubmission({
    required this.message,
    required this.attachments,
    this.replyToMessageId,
  });

  final String message;
  final List<AssistantAttachment> attachments;
  final String? replyToMessageId;

  @override
  List<Object?> get props => [message, attachments, replyToMessageId];
}
