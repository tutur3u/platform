import 'dart:async';
import 'dart:math';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/replies/reply_idempotency_key.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

/// One composer send, shown optimistically under the feed until the relay's
/// copy of it arrives there.
final class IrisOutgoing {
  const IrisOutgoing({
    required this.clientId,
    required this.idempotencyKey,
    required this.text,
    required this.createdAt,
    this.state = IrisReceiptState.pending,
    this.delivery,
    this.id,
    this.attempts = 0,
  });

  /// Stable across retries, for the row's key.
  final String clientId;

  /// Reused by every retry, so the relay sees one message.
  final String idempotencyKey;
  final String text;
  final DateTime createdAt;
  final IrisReceiptState state;
  final IrisDelivery? delivery;

  /// The relay's send id once it accepted the message.
  final String? id;
  final int attempts;

  bool get failed => state == IrisReceiptState.failed;

  IrisOutgoing copyWith({
    IrisReceiptState? state,
    IrisDelivery? delivery,
    String? id,
    int? attempts,
  }) => IrisOutgoing(
    clientId: clientId,
    idempotencyKey: idempotencyKey,
    text: text,
    createdAt: createdAt,
    state: state ?? this.state,
    delivery: delivery ?? this.delivery,
    id: id ?? this.id,
    attempts: attempts ?? this.attempts,
  );
}

/// The composer's outbox. A send goes out at once; a transient failure retries
/// with backoff up to [maxAttempts], then the row offers Retry, which reuses
/// the same Idempotency-Key. An accepted send's receipt is polled with
/// backoff until it is acked or failed. Receipts only move forward.
class IrisSendCubit extends Cubit<List<IrisOutgoing>> {
  IrisSendCubit({
    required IrisRelay relay,
    void Function(IrisFailure failure)? onFailure,
    DateTime Function()? clock,
    Random? random,
    this.retryBase = const Duration(seconds: 2),
    this.receiptBase = const Duration(seconds: 2),
  }) : _relay = relay,
       _onFailure = onFailure,
       _clock = clock ?? DateTime.now,
       _random = random,
       super(const []);

  static const maxAttempts = 3;
  static const _receiptCap = Duration(seconds: 30);

  final IrisRelay _relay;
  final void Function(IrisFailure failure)? _onFailure;
  final DateTime Function() _clock;
  final Random? _random;
  final Duration retryBase;
  final Duration receiptBase;
  final Map<String, Timer> _timers = {};
  int _seq = 0;

  /// Queues [text] and sends it. Returns false for blank text.
  bool send(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty || isClosed) return false;
    final row = IrisOutgoing(
      clientId: 'out-${++_seq}',
      idempotencyKey: newReplyIdempotencyKey(_random),
      text: trimmed,
      createdAt: _clock().toUtc(),
    );
    emit([...state, row]);
    unawaited(_dispatch(row.clientId));
    return true;
  }

  /// A failed row goes out again with the same key.
  void retry(String clientId) {
    final row = _row(clientId);
    if (row == null || !row.failed) return;
    _put(row.copyWith(state: IrisReceiptState.pending, attempts: 0));
    unawaited(_dispatch(clientId));
  }

  /// Drops acked rows whose message the feed now shows. Provenance is
  /// display-only, so this only matches a phone-authored row's text.
  void reconcile(List<ThreadMessage> feed) {
    if (state.isEmpty) return;
    final shown = <String, int>{};
    for (final message in feed) {
      if (message.author == ThreadAuthor.ownerPhone) {
        shown.update(message.text, (n) => n + 1, ifAbsent: () => 1);
      }
    }
    final kept = <IrisOutgoing>[];
    for (final row in state) {
      final count = shown[row.text] ?? 0;
      if (row.id != null && !row.failed && count > 0) {
        shown[row.text] = count - 1;
        _timers.remove(row.clientId)?.cancel();
        continue;
      }
      kept.add(row);
    }
    if (kept.length != state.length) emit(kept);
  }

  IrisOutgoing? _row(String clientId) {
    for (final row in state) {
      if (row.clientId == clientId) return row;
    }
    return null;
  }

  void _put(IrisOutgoing next) {
    if (isClosed) return;
    emit([
      for (final row in state)
        if (row.clientId == next.clientId) next else row,
    ]);
  }

  Future<void> _dispatch(String clientId) async {
    final row = _row(clientId);
    if (row == null) return;
    final result = await _relay.send(
      row.text,
      idempotencyKey: row.idempotencyKey,
    );
    final current = _row(clientId);
    if (current == null || isClosed) return;
    switch (result) {
      case IrisOk(:final value):
        _put(_advance(current.copyWith(id: value.id), value));
        if (!value.isTerminal) _pollReceipt(clientId, 0);
      case IrisErr(:final failure):
        _onFailure?.call(failure);
        final attempts = current.attempts + 1;
        if (failure.transient && attempts < maxAttempts) {
          _put(current.copyWith(attempts: attempts));
          var wait = retryBase * (1 << (attempts - 1));
          final retryAfter = failure.retryAfter;
          if (retryAfter != null && retryAfter > wait) wait = retryAfter;
          _timers[clientId] = Timer(wait, () => unawaited(_dispatch(clientId)));
        } else {
          _put(
            current.copyWith(
              state: IrisReceiptState.failed,
              attempts: attempts,
            ),
          );
        }
    }
  }

  /// States only move forward: an older receipt never rolls a row back.
  IrisOutgoing _advance(IrisOutgoing row, IrisReceipt receipt) =>
      receipt.state.index < row.state.index
      ? row
      : row.copyWith(state: receipt.state, delivery: receipt.delivery);

  void _pollReceipt(String clientId, int round) {
    var wait = receiptBase * (1 << round.clamp(0, 4));
    if (wait > _receiptCap) wait = _receiptCap;
    _timers[clientId]?.cancel();
    _timers[clientId] = Timer(wait, () async {
      final row = _row(clientId);
      final id = row?.id;
      if (row == null || id == null || isClosed) return;
      final result = await _relay.receipt(id);
      final current = _row(clientId);
      if (current == null || isClosed) return;
      switch (result) {
        case IrisOk(:final value):
          final next = _advance(current, value);
          _put(next);
          if (next.state != IrisReceiptState.acked && !next.failed) {
            _pollReceipt(clientId, round + 1);
          }
        case IrisErr(:final failure):
          _onFailure?.call(failure);
          if (failure.kind == IrisFailureKind.killed) return;
          _pollReceipt(clientId, round + 1);
      }
    });
  }

  @override
  Future<void> close() {
    for (final timer in _timers.values) {
      timer.cancel();
    }
    _timers.clear();
    return super.close();
  }
}
