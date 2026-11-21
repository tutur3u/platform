import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_state.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/replies/reply_idempotency_key.dart';

export 'package:mobile/features/mastermind/projects/cubit/thread_state.dart';

/// One thread's transcript and the replies posted from this screen.
class ThreadCubit extends Cubit<ThreadState> {
  ThreadCubit({
    required ProjectsRepository repository,
    required this.machine,
    required this.threadId,
    String Function()? newKey,
    DateTime Function()? clock,
  }) : _repository = repository,
       _newKey = newKey ?? newReplyIdempotencyKey,
       _clock = clock ?? DateTime.now,
       super(const ThreadState());

  static const maxReplyLength = 4000;

  final ProjectsRepository _repository;
  final ProjectsMachine machine;
  final String threadId;
  final String Function() _newKey;
  final DateTime Function() _clock;
  int _localIds = 0;
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

  /// Posts [text]; false when it is empty or over [maxReplyLength].
  bool send(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty || trimmed.length > maxReplyLength) return false;
    final reply = PostedReply(
      localId: 'local-${++_localIds}',
      text: trimmed,
      idempotencyKey: _newKey(),
      at: _clock().toUtc(),
    );
    emit(state.copyWith(replies: [...state.replies, reply]));
    unawaited(_post(reply));
    return true;
  }

  /// Resends a reply whose POST got no receipt, under the same key.
  Future<void> retry(String localId) async {
    final reply = _reply(localId);
    if (reply == null || !reply.retryable) return;
    final sending = reply.copyWith(sending: true, failure: () => null);
    _put(sending);
    await _post(sending);
  }

  /// A live receipt hint or a `threads` poke: re-read every unsettled
  /// receipt once. Never scheduled on a timer.
  Future<void> refreshReceipts() async {
    final open = state.replies.where(
      (r) => r.receipt != null && !r.receipt!.settled,
    );
    for (final reply in open.toList()) {
      try {
        final receipt = await _repository.receipt(machine, reply.receipt!.id);
        if (isClosed) return;
        if (receipt != null) {
          _put(_reply(reply.localId)!.copyWith(receipt: receipt));
        }
      } on ProjectsException {
        // The receipt stays as last read; the next hint reads it again.
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

  Future<void> _post(PostedReply reply) async {
    try {
      final receipt = await _repository.reply(
        machine,
        threadId: threadId,
        text: reply.text,
        idempotencyKey: reply.idempotencyKey,
      );
      if (isClosed) return;
      _put(reply.copyWith(receipt: receipt, sending: false));
    } on ProjectsException catch (error) {
      if (isClosed) return;
      _put(reply.copyWith(sending: false, failure: () => error.kind));
    }
  }

  PostedReply? _reply(String localId) =>
      state.replies.where((r) => r.localId == localId).firstOrNull;

  void _put(PostedReply reply) => emit(
    state.copyWith(
      replies: [
        for (final r in state.replies)
          if (r.localId == reply.localId) reply else r,
      ],
    ),
  );
}
