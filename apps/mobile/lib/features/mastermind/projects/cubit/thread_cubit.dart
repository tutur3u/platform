import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_state.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';

export 'package:mobile/features/mastermind/projects/cubit/thread_state.dart';

/// One thread's transcript. Replies go through `FleetThreadReplyCubit`.
class ThreadCubit extends Cubit<ThreadState> {
  ThreadCubit({
    required ProjectsRepository repository,
    required this.machine,
    required this.threadId,
  }) : _repository = repository,
       super(const ThreadState());

  final ProjectsRepository _repository;
  final ProjectsMachine machine;
  final String threadId;
  int? _markedCount;
  int _loads = 0;

  /// Reads the newest page. Older pages already loaded are replaced, so the
  /// view stays one contiguous window. Only the latest load applies.
  Future<void> load() async {
    final generation = ++_loads;
    try {
      final page = await _repository.messages(machine, threadId);
      if (isClosed || generation != _loads) return;
      unawaited(_markRead(page.thread.itemCount));
      emit(
        state.copyWith(
          status: ThreadStatus.ready,
          thread: page.thread,
          messages: page.messages,
          earlierPosition: () => page.earlierPosition,
          loadingEarlier: false,
          failure: () => null,
        ),
      );
    } on ProjectsException catch (error) {
      if (isClosed || generation != _loads) return;
      emit(
        state.copyWith(
          status: state.thread == null ? ThreadStatus.failed : null,
          failure: () => error.kind,
        ),
      );
    }
  }

  Future<void> loadEarlier() async {
    final before = state.earlierPosition;
    if (before == null || state.loadingEarlier) return;
    emit(state.copyWith(loadingEarlier: true));
    try {
      final page = await _repository.messages(
        machine,
        threadId,
        before: before,
      );
      // A load that replaced the window meanwhile makes this page belong to
      // another window unless it still starts where this one asked.
      if (isClosed || state.earlierPosition != before) return;
      final known = {for (final m in state.messages) m.position};
      emit(
        state.copyWith(
          loadingEarlier: false,
          messages: [
            ...page.messages.where((m) => !known.contains(m.position)),
            ...state.messages,
          ],
          earlierPosition: () => page.earlierPosition,
        ),
      );
    } on ProjectsException catch (error) {
      if (!isClosed && state.earlierPosition == before) {
        emit(state.copyWith(loadingEarlier: false, failure: () => error.kind));
      }
    }
  }

  /// Opening a thread reads it to its newest item.
  Future<void> _markRead(int itemCount) async {
    if (itemCount == _markedCount) return;
    _markedCount = itemCount;
    try {
      final saved = await _repository.markRead(
        machine,
        threadId: threadId,
        itemCount: itemCount,
      );
      // Unsaved, the row keeps its badge and the next open tries again.
      if (!saved) _markedCount = null;
    } on ProjectsException {
      // A read marker is a convenience; the badge clears on the next open.
      _markedCount = null;
    }
  }
}
