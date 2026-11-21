import 'package:flutter/foundation.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';

/// What the receipt line under a posted reply says.
enum ReplyPhase { sending, sent, steered, started, queued, delivered, failed }

/// A reply posted from this screen. It shows from its receipt: the transcript
/// lists it only once the machine took it.
@immutable
class PostedReply {
  const PostedReply({
    required this.localId,
    required this.text,
    required this.idempotencyKey,
    required this.at,
    this.receipt,
    this.failure,
    this.sending = true,
  });

  final String localId;
  final String text;
  final String idempotencyKey;
  final DateTime at;
  final ReplyReceipt? receipt;

  /// Why the POST itself failed; a retry resends the same key.
  final ProjectsFailureKind? failure;
  final bool sending;

  ReplyPhase get phase {
    if (sending) return ReplyPhase.sending;
    final receipt = this.receipt;
    if (receipt == null) return ReplyPhase.failed;
    return switch (receipt.state) {
      ReplyReceiptState.sent => ReplyPhase.sent,
      ReplyReceiptState.failed ||
      ReplyReceiptState.expired => ReplyPhase.failed,
      ReplyReceiptState.delivered => switch (receipt.delivery) {
        ReplyDelivery.steered => ReplyPhase.steered,
        ReplyDelivery.started => ReplyPhase.started,
        ReplyDelivery.queued => ReplyPhase.queued,
        null => ReplyPhase.delivered,
      },
    };
  }

  /// A POST that never got a receipt can go again with the same key.
  bool get retryable => !sending && receipt == null;

  PostedReply copyWith({
    ReplyReceipt? receipt,
    ProjectsFailureKind? Function()? failure,
    bool? sending,
  }) => PostedReply(
    localId: localId,
    text: text,
    idempotencyKey: idempotencyKey,
    at: at,
    receipt: receipt ?? this.receipt,
    failure: failure == null ? this.failure : failure(),
    sending: sending ?? this.sending,
  );
}

enum ThreadStatus { loading, ready, failed }

@immutable
class ThreadState {
  const ThreadState({
    this.status = ThreadStatus.loading,
    this.thread,
    this.messages = const [],
    this.earlierPosition,
    this.loadingEarlier = false,
    this.failure,
    this.replies = const [],
  });

  final ThreadStatus status;
  final ProjectThread? thread;
  final List<ThreadMessage> messages;
  final int? earlierPosition;
  final bool loadingEarlier;
  final ProjectsFailureKind? failure;
  final List<PostedReply> replies;

  bool get hasEarlier => earlierPosition != null;

  ThreadState copyWith({
    ThreadStatus? status,
    ProjectThread? thread,
    List<ThreadMessage>? messages,
    int? Function()? earlierPosition,
    bool? loadingEarlier,
    ProjectsFailureKind? Function()? failure,
    List<PostedReply>? replies,
  }) => ThreadState(
    status: status ?? this.status,
    thread: thread ?? this.thread,
    messages: messages ?? this.messages,
    earlierPosition: earlierPosition == null
        ? this.earlierPosition
        : earlierPosition(),
    loadingEarlier: loadingEarlier ?? this.loadingEarlier,
    failure: failure == null ? this.failure : failure(),
    replies: replies ?? this.replies,
  );
}
