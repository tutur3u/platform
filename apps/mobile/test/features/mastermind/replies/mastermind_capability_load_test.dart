import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';

import '../../../helpers/hub_http_source_support.dart';
import '../../../helpers/mastermind_hub_harness.dart';
import '../../../helpers/mastermind_replies_fixture.dart';

final NeedsYou _item = parsedItem(inboxItem(1));

CapabilitiesFetch _answer({required bool replies}) => CapabilitiesFetchOk(
  MastermindCapabilities(
    schemaVersions: const ['1.4'],
    replies: replies,
    push: false,
  ),
);

/// A capability source whose answers wait for the test, one gate per call.
final class _GatedCapabilities {
  final gates = <Completer<CapabilitiesFetch>>[];

  int get calls => gates.length;

  Future<CapabilitiesFetch> call() {
    final gate = Completer<CapabilitiesFetch>();
    gates.add(gate);
    return gate.future;
  }
}

void main() {
  group('one capability request at a time', () {
    test('overlapping forced checks share a single request', () async {
      final source = _GatedCapabilities();
      final cubit = repliesCubit(fetchCapabilities: source.call);
      addTearDown(cubit.close);

      final first = cubit.loadCapabilities(force: true);
      final second = cubit.loadCapabilities(force: true);
      final third = cubit.loadCapabilities();
      await pumpEventQueue();
      expect(source.calls, 1);

      source.gates.single.complete(_answer(replies: true));
      await Future.wait([first, second, third]);
      expect(source.calls, 1);
      expect(cubit.state.capability, ReplyCapability.supported);
    });

    test('overlapping checks send one request on the wire', () async {
      final answer = Completer<void>();
      final hub = FakeHub((_) async {
        await answer.future;
        return hubReply(
          200,
          body: utf8.encode(
            jsonEncode({
              'schema_versions': ['1.4'],
              'replies': true,
              'push': false,
            }),
          ),
        );
      });
      final cubit = repliesCubit(
        fetchCapabilities: hubSource(hub, FakeTokens()).fetchCapabilities,
      );
      addTearDown(cubit.close);

      final calls = [
        cubit.loadCapabilities(force: true),
        cubit.loadCapabilities(force: true),
        cubit.loadCapabilities(),
      ];
      await pumpEventQueue();
      expect(hub.requests, hasLength(1));
      expect(hub.requests.single.url.path, '/v1/capabilities');

      answer.complete();
      await Future.wait(calls);
      expect(hub.requests, hasLength(1));
      expect(cubit.state.capability, ReplyCapability.supported);
    });

    test('a forced check after the shared one finishes asks again', () async {
      final source = _GatedCapabilities();
      final cubit = repliesCubit(fetchCapabilities: source.call);
      addTearDown(cubit.close);

      final first = cubit.loadCapabilities();
      source.gates[0].complete(_answer(replies: true));
      await first;

      final again = cubit.loadCapabilities(force: true);
      expect(source.calls, 2);
      source.gates[1].complete(_answer(replies: false));
      await again;
      expect(cubit.state.capability, ReplyCapability.unsupported);
    });

    test('a send during the first-ever check waits for its answer', () async {
      final source = _GatedCapabilities();
      final transport = FakeReplyTransport();
      final cubit = repliesCubit(
        transport: transport,
        fetchCapabilities: source.call,
      );
      addTearDown(cubit.close);

      final checking = cubit.loadCapabilities();
      expect(cubit.state.capability, ReplyCapability.checking);
      final submitted = cubit.submit(item: _item, text: 'Hello');
      await pumpEventQueue();
      expect(transport.sent, isEmpty);

      source.gates.single.complete(_answer(replies: true));
      await checking;
      expect(await submitted, isTrue);
      expect(transport.sent, hasLength(1));
      expect(source.calls, 1);
    });

    test(
      'a send during a check that turns replies off stays refused',
      () async {
        final source = _GatedCapabilities();
        final transport = FakeReplyTransport();
        final cubit = repliesCubit(
          transport: transport,
          fetchCapabilities: source.call,
        );
        addTearDown(cubit.close);

        unawaited(cubit.loadCapabilities());
        final submitted = cubit.submit(item: _item, text: 'Hello');
        source.gates.single.complete(_answer(replies: false));
        expect(await submitted, isFalse);
        expect(transport.sent, isEmpty);
      },
    );

    test('a check begun before a logout is not joined after it', () async {
      final source = _GatedCapabilities();
      final cubit = repliesCubit(fetchCapabilities: source.call);
      addTearDown(cubit.close);

      final before = cubit.loadCapabilities();
      await cubit.clear();
      final after = cubit.loadCapabilities();
      expect(source.calls, 2);

      source.gates[1].complete(_answer(replies: false));
      await after;
      // The old session's answer must not leak into the new one.
      source.gates[0].complete(_answer(replies: true));
      await before;
      expect(cubit.state.capability, ReplyCapability.unsupported);

      // The old request finishing did not clear the new one's bookkeeping.
      final forced = cubit.loadCapabilities(force: true);
      expect(source.calls, 3);
      source.gates[2].complete(_answer(replies: true));
      await forced;
    });

    test('a failed shared check settles every caller', () async {
      final source = _GatedCapabilities();
      final cubit = repliesCubit(fetchCapabilities: source.call);
      addTearDown(cubit.close);

      final first = cubit.loadCapabilities();
      final second = cubit.loadCapabilities(force: true);
      source.gates.single.completeError(StateError('offline'));
      await Future.wait([first, second]);
      expect(cubit.state.capability, ReplyCapability.unavailable);
      expect(source.calls, 1);

      // The request is over, so the next call is a new one.
      final retry = cubit.loadCapabilities();
      expect(source.calls, 2);
      source.gates[1].complete(_answer(replies: true));
      await retry;
      expect(cubit.state.capability, ReplyCapability.supported);
    });
  });
}
