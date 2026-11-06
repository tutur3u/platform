import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_state.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/open_asks.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_state.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';

/// An open ask the hub closed with an answer that did not come from this
/// device while this device still listed it.
final class AnsweredElsewhere {
  const AnsweredElsewhere({
    required this.item,
    required this.order,
    this.via,
    this.option,
    this.cancelledReply = false,
  });

  /// The ask as it was last listed open, so its card keeps its content.
  final NeedsYou item;

  /// Its index among the open asks, so the card keeps its place.
  final int order;

  /// Where the hub says it was answered; null when it did not say.
  final AnsweredVia? via;

  /// The answer the hub recorded, when it says.
  final String? option;

  /// A one-tap reply from this device was still inside its undo window and
  /// was cancelled without being sent.
  final bool cancelledReply;
}

/// Keeps an ask that was answered elsewhere on screen for [linger], reading
/// "Answered on Mac · Yes" with its choices gone, before it is only listed as
/// resolved. Withdrawn asks never linger: they appear as resolved only.
///
/// Only a live snapshot is the hub's word; a cached one only records which asks
/// were open. An ask this device answered (a sent reply) is not "elsewhere".
final class MastermindAnsweredElsewhereCubit
    extends Cubit<Map<String, AnsweredElsewhere>> {
  MastermindAnsweredElsewhereCubit({this.linger = defaultLinger})
    : super(const {});

  static const defaultLinger = Duration(seconds: 3);

  final Duration linger;
  final _timers = <String, Timer>{};
  var _lastOpen = <String, (int, NeedsYou)>{};
  var _answered = <String, NeedsYou>{};

  /// Whether the latest live snapshot shows [itemId] answered.
  bool isAnswered(String itemId) => _answered.containsKey(itemId);

  /// Reads [replies] before the replies cubit syncs the same snapshot, which
  /// cancels (and deletes) any undo-window reply to an ask that left.
  void observe(MastermindSnapshotReady ready, MastermindRepliesState replies) {
    if (isClosed) return;
    final snapshot = ready.snapshot;
    final previous = _lastOpen;
    _lastOpen = {
      for (final (order, item) in openAsks(snapshot).indexed)
        item.id: (order, item),
    };
    if (ready.origin != SnapshotOrigin.live) return;
    // History rows carry the recorded answer, so they win over a bare
    // `answered` row in `needs_you`.
    _answered = {
      for (final item in snapshot.now.needsYou.whereType<NeedsYou>())
        if (item.state == ItemState.answered) item.id: item,
      for (final item in snapshot.resolvedItems)
        if (item.state == ItemState.answered) item.id: item,
    };
    final next = {...state};
    for (final MapEntry(key: id, value: (order, item)) in previous.entries) {
      final closed = _answered[id];
      if (closed == null ||
          _lastOpen.containsKey(id) ||
          next.containsKey(id) ||
          replies.outbox.any(
            (entry) => entry.itemId == id && entry.status == OutboxStatus.sent,
          )) {
        continue;
      }
      final pending = replies.pendingOptions[id];
      next[id] = AnsweredElsewhere(
        item: item,
        order: order,
        via: closed.answeredVia,
        option: closed.resolution,
        cancelledReply: pending != null && !pending.committed,
      );
      _timers.remove(id)?.cancel();
      _timers[id] = Timer(linger, () => _expire(id));
    }
    if (next.length != state.length) emit(Map.unmodifiable(next));
  }

  void _expire(String id) {
    _timers.remove(id);
    if (isClosed || !state.containsKey(id)) return;
    emit(Map.unmodifiable({...state}..remove(id)));
  }

  void _cancelTimers() {
    for (final timer in _timers.values) {
      timer.cancel();
    }
    _timers.clear();
  }

  /// Logout, account switch or lost access: nothing carries over.
  void clear() {
    _cancelTimers();
    _lastOpen = {};
    _answered = {};
    if (!isClosed && state.isNotEmpty) emit(const {});
  }

  @override
  Future<void> close() {
    _cancelTimers();
    return super.close();
  }
}
