import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/replies/reply_idempotency_key.dart';

enum FleetReplyPhase {
  idle,
  sending,

  /// Web holds it for the machine; the receipt follows over the owner socket.
  sent,

  /// In the thread; [FleetThreadReply.delivery] says how.
  delivered,

  /// The session's second-factor proof is too old for a reply, whatever its
  /// age: verify again, then retry. The text and key are kept.
  needsMfa,
  failed,
}

class FleetReplyStatus {
  const FleetReplyStatus._(
    this.phase, {
    this.key,
    this.text,
    this.reply,
    this.failure,
    this.code,
    this.retryable = false,
  });

  const FleetReplyStatus.idle() : this._(FleetReplyPhase.idle);

  final FleetReplyPhase phase;

  /// The reply's idempotency key, which is also its id.
  final String? key;
  final String? text;
  final FleetThreadReply? reply;

  /// Why it failed; null when the machine refused it or it expired, in which
  /// case [reply] holds the receipt.
  final FleetThreadFailure? failure;

  /// A closed code from Web or from the machine.
  final String? code;

  /// [FleetThreadReplyCubit.retry] can still deliver this very reply.
  final bool retryable;

  /// It went into the running turn.
  bool get steered => reply?.steered ?? false;
}

/// One owner reply into a fleet thread, from typing to the machine's receipt.
/// A reply gets its idempotency key once and keeps it through every retry, a
/// second-factor step-up included, so it reaches the thread once however
/// often it is sent.
class FleetThreadReplyCubit extends Cubit<FleetReplyStatus> {
  FleetThreadReplyCubit({
    required FleetThreadSource source,
    required this.machineId,
    required this.threadId,
    this.environmentId,
    String Function()? newKey,
  }) : _source = source,
       _newKey = newKey ?? newReplyIdempotencyKey,
       super(const FleetReplyStatus.idle());

  final FleetThreadSource _source;
  final String Function() _newKey;
  final String machineId;
  final String threadId;
  final String? environmentId;

  FleetReplyStatus _settled(String key, String text, FleetThreadReply reply) =>
      switch (reply.state) {
        FleetReplyState.sent => FleetReplyStatus._(
          FleetReplyPhase.sent,
          key: key,
          text: text,
          reply: reply,
        ),
        FleetReplyState.delivered => FleetReplyStatus._(
          FleetReplyPhase.delivered,
          key: key,
          text: text,
          reply: reply,
        ),
        // The machine refused it, or it outlived its day in the outbox: this
        // key is spent, and sending the text again is a new reply.
        FleetReplyState.failed || FleetReplyState.expired => FleetReplyStatus._(
          FleetReplyPhase.failed,
          key: key,
          text: text,
          reply: reply,
          code: reply.code,
        ),
      };

  Future<void> _deliver(String key, String text) async {
    emit(FleetReplyStatus._(FleetReplyPhase.sending, key: key, text: text));
    FleetReplyStatus next;
    try {
      next = _settled(
        key,
        text,
        await _source.reply(
          machineId: machineId,
          environmentId: environmentId,
          threadId: threadId,
          text: text,
          idempotencyKey: key,
        ),
      );
    } on Object catch (error) {
      final refusal = FleetThreadException.from(error);
      next = refusal.failure == FleetThreadFailure.mfaRequired
          ? FleetReplyStatus._(FleetReplyPhase.needsMfa, key: key, text: text)
          : FleetReplyStatus._(
              FleetReplyPhase.failed,
              key: key,
              text: text,
              failure: refusal.failure,
              code: refusal.code,
              // An unreadable answer may hide a reply that was accepted;
              // sent again under the same key, Web answers with that reply's
              // receipt instead of sending it twice.
              retryable:
                  refusal.retryable ||
                  refusal.failure == FleetThreadFailure.unreadable,
            );
    }
    if (isClosed || state.key != key) return;
    emit(next);
  }

  bool get _resendable =>
      state.phase == FleetReplyPhase.needsMfa ||
      (state.phase == FleetReplyPhase.failed && state.retryable);

  /// Sends new text as a new reply. Ignored while one is being sent, or held
  /// for the machine: that reply is still on its way. The same text again,
  /// while its reply can still be resent, is that reply again, under its key.
  Future<void> submit(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty ||
        state.phase == FleetReplyPhase.sending ||
        state.phase == FleetReplyPhase.sent) {
      return Future.value();
    }
    if (_resendable && trimmed == state.text) return retry();
    return _deliver(_newKey(), trimmed);
  }

  /// Sends the same reply again, under the same key. While the reply is held
  /// for the machine, reads its receipt instead: the way forward when no
  /// receipt frame arrives.
  Future<void> retry() {
    if (state.phase == FleetReplyPhase.sent) return refresh();
    final FleetReplyStatus(:key, :text) = state;
    if (key == null || text == null || !_resendable) return Future.value();
    return _deliver(key, text);
  }

  /// Reads the receipt again. Call it when the owner socket delivers a
  /// `receipt` frame; [replyId] skips frames about other replies.
  Future<void> refresh([String? replyId]) async {
    final FleetReplyStatus(:phase, :key, :text) = state;
    if (phase != FleetReplyPhase.sent ||
        key == null ||
        text == null ||
        (replyId != null && replyId != key)) {
      return;
    }
    try {
      final reply = await _source.receipt(key);
      if (isClosed || state.phase != FleetReplyPhase.sent || state.key != key) {
        return;
      }
      emit(_settled(key, text, reply));
    } on Object {
      // The next receipt frame, or the next refresh, reads it again.
    }
  }

  /// Back to an empty composer. A reply still held for the machine stays in
  /// its outbox and is delivered when the machine takes it.
  void reset() {
    if (state.phase != FleetReplyPhase.sending) {
      emit(const FleetReplyStatus.idle());
    }
  }
}
