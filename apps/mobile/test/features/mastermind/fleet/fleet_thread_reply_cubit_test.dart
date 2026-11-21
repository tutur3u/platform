import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_thread_reply_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Source extends Mock implements FleetThreadSource {}

String _key(int n) => '00000000-0000-4000-8000-${'$n'.padLeft(12, '0')}';

final List<String> _keys = [_key(1), _key(2)];

FleetThreadReply _receipt(
  FleetReplyState state, {
  FleetReplyDelivery? delivery,
  String? code,
}) => FleetThreadReply(
  id: _keys.first,
  machineId: 'skr-m4',
  threadId: 'thread:a',
  state: state,
  delivery: delivery,
  code: code,
);

// Product rule: apps/docs/platform/features/mastermind-thread-replies.mdx
void main() {
  late _Source source;
  late FleetThreadReplyCubit cubit;
  late List<String> sentKeys;
  late List<String> sentTexts;

  void answer(List<Object> answers) {
    final queue = [...answers];
    when(
      () => source.reply(
        machineId: any(named: 'machineId'),
        environmentId: any(named: 'environmentId'),
        threadId: any(named: 'threadId'),
        text: any(named: 'text'),
        idempotencyKey: any(named: 'idempotencyKey'),
      ),
    ).thenAnswer((invocation) async {
      sentKeys.add(invocation.namedArguments[#idempotencyKey] as String);
      sentTexts.add(invocation.namedArguments[#text] as String);
      final next = queue.removeAt(0);
      if (next is FleetThreadReply) return next;
      throw next as Exception;
    });
  }

  setUp(() {
    source = _Source();
    sentKeys = [];
    sentTexts = [];
    var made = 0;
    cubit = FleetThreadReplyCubit(
      source: source,
      machineId: 'skr-m4',
      threadId: 'thread:a',
      newKey: () => _key(++made),
    );
  });

  tearDown(() => cubit.close());

  test('goes from sending to sent to delivered and steered', () async {
    answer([_receipt(FleetReplyState.sent)]);
    final phases = <FleetReplyPhase>[];
    final listening = cubit.stream.listen((s) => phases.add(s.phase));
    await cubit.submit('  Ship it.  ');
    expect(sentTexts, ['Ship it.']);
    expect(cubit.state.phase, FleetReplyPhase.sent);
    expect(cubit.state.key, _keys.first);

    // A receipt frame about another reply reads nothing.
    await cubit.refresh(_keys.last);
    verifyNever(() => source.receipt(any()));
    when(() => source.receipt(_keys.first)).thenAnswer(
      (_) async => _receipt(
        FleetReplyState.delivered,
        delivery: FleetReplyDelivery.steered,
      ),
    );
    await cubit.refresh(_keys.first);
    await Future<void>.delayed(Duration.zero);
    expect(cubit.state.phase, FleetReplyPhase.delivered);
    expect(cubit.state.steered, isTrue);
    expect(phases, [
      FleetReplyPhase.sending,
      FleetReplyPhase.sent,
      FleetReplyPhase.delivered,
    ]);
    await listening.cancel();
    cubit.reset();
    expect(cubit.state.phase, FleetReplyPhase.idle);
  });

  test('keeps its key and text through a second-factor step-up', () async {
    answer([
      const FleetThreadException(FleetThreadFailure.mfaRequired),
      _receipt(FleetReplyState.sent),
    ]);
    await cubit.submit('Ship it.');
    expect(cubit.state.phase, FleetReplyPhase.needsMfa);
    await cubit.retry();
    expect(sentKeys, [_keys.first, _keys.first]);
    expect(sentTexts, ['Ship it.', 'Ship it.']);
    expect(cubit.state.phase, FleetReplyPhase.sent);
  });

  test('retries a reply that may still arrive under the same key', () async {
    for (final failure in [
      FleetThreadFailure.machineOffline,
      FleetThreadFailure.timeout,
      FleetThreadFailure.rateLimited,
      FleetThreadFailure.unavailable,
      FleetThreadFailure.unreadable,
    ]) {
      sentKeys.clear();
      answer([FleetThreadException(failure), _receipt(FleetReplyState.sent)]);
      cubit.reset();
      await cubit.submit('Go');
      expect(cubit.state.phase, FleetReplyPhase.failed, reason: failure.name);
      expect(cubit.state.failure, failure);
      expect(cubit.state.retryable, isTrue, reason: failure.name);
      await cubit.retry();
      expect(sentKeys.toSet(), hasLength(1), reason: failure.name);
      expect(cubit.state.phase, FleetReplyPhase.sent);
      // Settle it so the next round starts a new reply.
      when(
        () => source.receipt(any()),
      ).thenAnswer((_) async => _receipt(FleetReplyState.delivered));
      await cubit.refresh();
    }
  });

  test('does not resend what was refused for good', () async {
    answer([
      const FleetThreadException(
        FleetThreadFailure.conflict,
        code: 'idempotency_conflict',
      ),
      _receipt(FleetReplyState.sent),
    ]);
    await cubit.submit('Go');
    expect(cubit.state.retryable, isFalse);
    expect(cubit.state.code, 'idempotency_conflict');
    await cubit.retry();
    expect(sentKeys, [_keys.first]);
    // New text is a new reply with a new key.
    await cubit.submit('Go again');
    expect(sentKeys, _keys);
    expect(sentTexts.last, 'Go again');
  });

  test('reports a reply the machine refused or that expired', () async {
    answer([_receipt(FleetReplyState.failed, code: 'unknown_thread')]);
    await cubit.submit('Go');
    expect(cubit.state.phase, FleetReplyPhase.failed);
    expect(cubit.state.failure, isNull);
    expect(cubit.state.code, 'unknown_thread');
    expect(cubit.state.retryable, isFalse);
    expect(cubit.state.reply?.state, FleetReplyState.failed);
  });

  test('sends one reply at a time and ignores empty text', () async {
    final gate = Completer<FleetThreadReply>();
    when(
      () => source.reply(
        machineId: any(named: 'machineId'),
        environmentId: any(named: 'environmentId'),
        threadId: any(named: 'threadId'),
        text: any(named: 'text'),
        idempotencyKey: any(named: 'idempotencyKey'),
      ),
    ).thenAnswer((_) => gate.future);
    await cubit.submit('   ');
    expect(cubit.state.phase, FleetReplyPhase.idle);
    final first = cubit.submit('One');
    await cubit.submit('Two');
    cubit.reset();
    expect(cubit.state.phase, FleetReplyPhase.sending);
    gate.complete(_receipt(FleetReplyState.sent));
    await first;
    await cubit.submit('Three');
    verify(
      () => source.reply(
        machineId: 'skr-m4',
        threadId: 'thread:a',
        text: 'One',
        idempotencyKey: _keys.first,
      ),
    ).called(1);
    // A receipt that cannot be read leaves it as it is.
    when(
      () => source.receipt(any()),
    ).thenThrow(const FleetThreadException(FleetThreadFailure.unavailable));
    await cubit.refresh();
    expect(cubit.state.phase, FleetReplyPhase.sent);
  });

  test(
    'treats the same text sent again as the same reply, under its key',
    () async {
      // The composer still holds the text after a step-up, and the owner
      // presses send instead of retry.
      answer([
        const FleetThreadException(FleetThreadFailure.mfaRequired),
        _receipt(FleetReplyState.sent),
      ]);
      await cubit.submit('Ship it.');
      await cubit.submit('  Ship it. ');
      expect(sentKeys, [_keys.first, _keys.first]);
      expect(cubit.state.phase, FleetReplyPhase.sent);
    },
  );

  test(
    'reads the receipt of a held reply on retry, when no frame arrives',
    () async {
      answer([_receipt(FleetReplyState.sent)]);
      await cubit.submit('Go');
      when(() => source.receipt(_keys.first)).thenAnswer(
        (_) async => _receipt(
          FleetReplyState.delivered,
          delivery: FleetReplyDelivery.queued,
        ),
      );
      await cubit.retry();
      expect(cubit.state.phase, FleetReplyPhase.delivered);
      // Asked for the receipt; the text was not sent again.
      expect(sentKeys, hasLength(1));
    },
  );

  test(
    'leaves a held reply in the outbox when the composer is reset',
    () async {
      answer([_receipt(FleetReplyState.sent), _receipt(FleetReplyState.sent)]);
      await cubit.submit('First');
      cubit.reset();
      expect(cubit.state.phase, FleetReplyPhase.idle);
      // Nothing withdraws it: no receipt is read for it either.
      await cubit.refresh(_keys.first);
      verifyNever(() => source.receipt(any()));
      // What the owner sends next is another reply.
      await cubit.submit('Second');
      expect(sentKeys, _keys);
      expect(sentTexts, ['First', 'Second']);
    },
  );
}
