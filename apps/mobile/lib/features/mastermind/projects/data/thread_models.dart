import 'package:flutter/foundation.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';

enum ThreadMessageRole { user, assistant }

/// One transcript message. A user-role message can come from the owner or
/// from another agent, so the view never names its author.
@immutable
class ThreadMessage {
  const ThreadMessage({
    required this.position,
    required this.role,
    required this.text,
    required this.at,
    this.truncated = false,
  });

  factory ThreadMessage.fromJson(Map<String, dynamic> json) => ThreadMessage(
    position: (json['position'] as num).toInt(),
    role: json['role'] == 'user'
        ? ThreadMessageRole.user
        : ThreadMessageRole.assistant,
    text: json['text'] as String? ?? '',
    truncated: json['truncated'] == true,
    at:
        DateTime.tryParse(json['at'] as String? ?? '') ??
        DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
  );

  final int position;
  final ThreadMessageRole role;
  final String text;
  final bool truncated;
  final DateTime at;
}

/// GET /threads/messages: up to 30 messages, oldest first. [earlierPosition]
/// is the `before` of the next older page, null at the start.
@immutable
class ThreadTranscript {
  const ThreadTranscript({
    required this.thread,
    required this.messages,
    this.earlierPosition,
  });

  factory ThreadTranscript.fromJson(Map<String, dynamic> json) {
    final thread = json['thread'] as Map<String, dynamic>;
    return ThreadTranscript(
      thread: ProjectThread.fromJson(thread),
      messages: [
        for (final m in json['messages'] as List<dynamic>? ?? const [])
          ThreadMessage.fromJson(m as Map<String, dynamic>),
      ],
      earlierPosition: (json['earlierPosition'] as num?)?.toInt(),
    );
  }

  final ProjectThread thread;
  final List<ThreadMessage> messages;
  final int? earlierPosition;
}

enum ReplyReceiptState { sent, delivered, failed, expired }

enum ReplyDelivery { steered, started, queued }

/// The 202 body of POST /replies, and any later read of the same reply.
@immutable
class ReplyReceipt {
  const ReplyReceipt({
    required this.id,
    required this.threadId,
    required this.state,
    required this.createdAt,
    this.delivery,
    this.code,
    this.settledAt,
  });

  factory ReplyReceipt.fromJson(Map<String, dynamic> json) => ReplyReceipt(
    id: json['id'] as String,
    threadId: json['threadId'] as String? ?? '',
    state:
        ReplyReceiptState.values
            .where((s) => s.name == json['state'])
            .firstOrNull ??
        ReplyReceiptState.sent,
    delivery: ReplyDelivery.values
        .where((d) => d.name == json['delivery'])
        .firstOrNull,
    code: json['code'] as String?,
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ??
        DateTime.now().toUtc(),
    settledAt: DateTime.tryParse(json['settledAt'] as String? ?? ''),
  );

  final String id;
  final String threadId;
  final ReplyReceiptState state;
  final ReplyDelivery? delivery;
  final String? code;
  final DateTime createdAt;
  final DateTime? settledAt;

  bool get settled =>
      state == ReplyReceiptState.delivered ||
      state == ReplyReceiptState.failed ||
      state == ReplyReceiptState.expired;
}
