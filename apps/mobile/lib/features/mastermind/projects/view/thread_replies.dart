import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_thread_reply_cubit.dart';

/// Every reply sent from one thread screen, one `FleetThreadReplyCubit` each,
/// so a reply held for the machine keeps its bubble and its receipt after
/// the owner writes another. Same text as any reply that can still be
/// resent is that reply again, under its key; new text is a new reply.
class ThreadReplies extends ChangeNotifier {
  ThreadReplies({required this.create, required this.onPhase});

  final FleetThreadReplyCubit Function() create;

  /// A reply's phase changed; `current` says it is the composer's reply.
  final void Function(FleetReplyStatus status, {required bool current}) onPhase;

  final List<FleetThreadReplyCubit> replies = [];
  final _subscriptions = <StreamSubscription<FleetReplyStatus>>[];
  bool _writingAnother = false;

  FleetThreadReplyCubit? get _current =>
      _writingAnother ? null : replies.lastOrNull;

  /// Whether [cubit] is the reply the composer works on.
  bool isCurrent(FleetThreadReplyCubit cubit) => identical(cubit, _current);

  /// False while the composer's reply is being sent or held.
  bool get composerEnabled => switch (_current?.state.phase) {
    FleetReplyPhase.sending || FleetReplyPhase.sent => false,
    _ => true,
  };

  /// Decided from the replies' states as they are now, so a double tap
  /// cannot make two replies: while one is sending, a send is ignored. Text
  /// that matches any reply still waiting to be resent (needs MFA, or a
  /// retryable failure) is that reply again, under its key.
  void send(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty ||
        replies.any((r) => r.state.phase == FleetReplyPhase.sending)) {
      return;
    }
    for (final reply in replies.reversed) {
      final FleetReplyStatus(:phase, :retryable, text: sent) = reply.state;
      final waiting =
          phase == FleetReplyPhase.needsMfa ||
          (phase == FleetReplyPhase.failed && retryable);
      if (waiting && sent == trimmed) {
        unawaited(reply.submit(trimmed));
        return;
      }
    }
    if (!composerEnabled) return;
    final current = _current;
    if (current != null && current.state.phase == FleetReplyPhase.idle) {
      unawaited(current.submit(trimmed));
      return;
    }
    _writingAnother = false;
    final next = create();
    var last = next.state.phase;
    _subscriptions.add(
      next.stream.listen((status) {
        if (status.phase == last) return;
        last = status.phase;
        onPhase(status, current: isCurrent(next));
        notifyListeners();
      }),
    );
    replies.add(next);
    notifyListeners();
    unawaited(next.submit(trimmed));
  }

  /// Frees the composer while the current reply is held; that reply still
  /// delivers and keeps its bubble.
  void writeAnother() {
    _writingAnother = true;
    notifyListeners();
  }

  /// A receipt frame or threads notice: re-reads every held reply's
  /// receipt. `retry` in any other phase would send again.
  void checkHeld() {
    for (final reply in replies) {
      if (reply.state.phase == FleetReplyPhase.sent) unawaited(reply.retry());
    }
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    for (final reply in replies) {
      unawaited(reply.close());
    }
    super.dispose();
  }
}
