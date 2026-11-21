import 'package:flutter/foundation.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';

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
  });

  final ThreadStatus status;
  final ProjectThread? thread;
  final List<ThreadMessage> messages;
  final int? earlierPosition;
  final bool loadingEarlier;
  final ProjectsFailureKind? failure;

  bool get hasEarlier => earlierPosition != null;

  ThreadState copyWith({
    ThreadStatus? status,
    ProjectThread? thread,
    List<ThreadMessage>? messages,
    int? Function()? earlierPosition,
    bool? loadingEarlier,
    ProjectsFailureKind? Function()? failure,
  }) => ThreadState(
    status: status ?? this.status,
    thread: thread ?? this.thread,
    messages: messages ?? this.messages,
    earlierPosition: earlierPosition == null
        ? this.earlierPosition
        : earlierPosition(),
    loadingEarlier: loadingEarlier ?? this.loadingEarlier,
    failure: failure == null ? this.failure : failure(),
  );
}
