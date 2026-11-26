import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_typing_publisher.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'chat_cubit_fixture.dart';

/// A timer the test fires by hand.
class _ManualTimer implements Timer {
  _ManualTimer(this.callback);
  final void Function() callback;
  bool _active = true;
  void fire() {
    if (_active) {
      _active = false;
      callback();
    }
  }

  @override
  void cancel() => _active = false;
  @override
  bool get isActive => _active;
  @override
  int get tick => 0;
}

void main() {
  group('ChatTypingPublisher', () {
    late List<bool> sent;
    late DateTime now;
    late List<_ManualTimer> timers;
    late ChatTypingPublisher publisher;

    setUp(() {
      sent = [];
      now = DateTime.utc(2026, 11, 26, 9);
      timers = [];
      publisher = ChatTypingPublisher(
        send: sent.add,
        now: () => now,
        timer: (duration, callback) {
          final timer = _ManualTimer(callback);
          timers.add(timer);
          return timer;
        },
      );
    });

    test('announces once, refreshes on the throttle and stops when idle', () {
      publisher
        ..onTextChanged('h')
        ..onTextChanged('he');
      expect(sent, [true]);

      now = now.add(const Duration(seconds: 3));
      publisher.onTextChanged('hel');
      expect(sent, [true, true]);

      timers.last.fire();
      expect(sent, [true, true, false]);
      expect(publisher.isTyping, isFalse);
    });

    test('an emptied field, stop and dispose end typing once', () {
      publisher
        ..onTextChanged('hi')
        ..onTextChanged('');
      expect(sent, [true, false]);
      publisher.stop();
      expect(sent, [true, false]);

      publisher
        ..onTextChanged('again')
        ..dispose()
        ..onTextChanged('ignored');
      expect(sent, [true, false, true, false]);
    });

    test('a burst stays inside the room frame budget', () {
      // 20 frames per 10 seconds per socket: ten seconds of steady typing
      // must send far fewer.
      for (var ms = 0; ms <= 10000; ms += 100) {
        now = DateTime.utc(2026, 11, 26, 9).add(Duration(milliseconds: ms));
        publisher.onTextChanged('x' * (ms ~/ 100 + 1));
      }
      expect(sent.length, lessThanOrEqualTo(4));
      expect(sent.every((on) => on), isTrue);
    });
  });

  group('cubit typing', () {
    setUp(() => FlutterSecureStorage.setMockInitialValues({}));
    late CubitHarness harness;
    setUp(() {
      harness = CubitHarness();
      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId ? fixtureRange(1, 3) : const [];
    });
    tearDown(() => harness.dispose());

    test('publishes on the open room and ends on send', () async {
      await harness.open();
      harness.cubit.reportTyping('Hel');
      expect(harness.typingSent, [(conversationId: threadId, on: true)]);

      await harness.cubit.sendMessage('Hello');
      await harness.settle();
      expect(harness.typingSent.last, (conversationId: threadId, on: false));
    });

    test('ends typing on blur and before leaving the thread', () async {
      await harness.open();
      harness.cubit
        ..reportTyping('draft')
        ..stopTyping();
      expect(harness.typingSent.last.on, isFalse);

      harness.cubit.reportTyping('draft again');
      await harness.cubit.selectConversation(otherThreadId);
      expect(harness.typingSent.last, (conversationId: threadId, on: false));
    });

    test('an AI conversation publishes nothing', () async {
      harness.repository.conversations = [
        fixtureConversation(threadId).copyWith(type: ChatConversationType.ai),
      ];
      await harness.open();
      harness.cubit.reportTyping('hello Mira');
      expect(harness.typingSent, isEmpty);
    });
  });
}
