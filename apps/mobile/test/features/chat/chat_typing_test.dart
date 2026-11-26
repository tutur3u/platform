import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/data/chat_typing_publisher.dart';
import 'package:mobile/features/chat/data/chat_typing_roster.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'chat_cubit_fixture.dart';

/// A timer the test clock fires when it passes [dueAt].
class _ManualTimer implements Timer {
  _ManualTimer(this.dueAt, this.callback);
  final DateTime dueAt;
  final void Function() callback;
  bool _active = true;

  void fire() {
    if (!_active) return;
    _active = false;
    callback();
  }

  @override
  void cancel() => _active = false;
  @override
  bool get isActive => _active;
  @override
  int get tick => 0;
}

/// Wall clock and timers under test control.
class _Clock {
  DateTime now = DateTime.utc(2026, 11, 26, 9);
  final _timers = <_ManualTimer>[];

  Timer timer(Duration duration, void Function() callback) {
    final timer = _ManualTimer(now.add(duration), callback);
    _timers.add(timer);
    return timer;
  }

  /// Moves time forward by [by], firing due timers in order.
  void advance(Duration by) {
    final end = now.add(by);
    while (true) {
      final due =
          _timers
              .where((timer) => timer.isActive && !timer.dueAt.isAfter(end))
              .toList()
            ..sort((a, b) => a.dueAt.compareTo(b.dueAt));
      if (due.isEmpty) break;
      now = due.first.dueAt;
      due.first.fire();
    }
    now = end;
  }
}

void main() {
  group('ChatTypingPublisher', () {
    late _Clock clock;
    late List<({bool on, DateTime at})> sent;
    late ChatTypingPublisher publisher;

    setUp(() {
      clock = _Clock();
      sent = [];
      publisher = ChatTypingPublisher(
        send: (on) => sent.add((on: on, at: clock.now)),
        now: () => clock.now,
        timer: clock.timer,
      );
    });

    List<bool> states() => [for (final frame in sent) frame.on];

    /// No two frames closer than the gap, and the room's 20-per-10s budget
    /// left with room for presence.
    void expectWithinBudget() {
      for (var index = 1; index < sent.length; index++) {
        expect(
          sent[index].at.difference(sent[index - 1].at),
          greaterThanOrEqualTo(publisher.minGap),
        );
      }
      for (final frame in sent) {
        final window = sent.where(
          (other) =>
              !other.at.isBefore(frame.at) &&
              other.at.difference(frame.at) < const Duration(seconds: 10),
        );
        expect(window.length, lessThanOrEqualTo(10));
      }
    }

    test('announces once, refreshes on the throttle and stops when idle', () {
      publisher
        ..onTextChanged('h')
        ..onTextChanged('he');
      expect(states(), [true]);

      clock.advance(const Duration(seconds: 3));
      publisher.onTextChanged('hel');
      expect(states(), [true, true]);

      clock.advance(publisher.idleAfter);
      expect(states(), [true, true, false]);
      expect(publisher.isTyping, isFalse);
    });

    test('an emptied field ends typing once, after the frame gap', () {
      publisher
        ..onTextChanged('hi')
        ..onTextChanged('');
      expect(states(), [true]);
      clock.advance(publisher.minGap);
      expect(states(), [true, false]);

      publisher.stop();
      clock.advance(const Duration(seconds: 5));
      expect(states(), [true, false]);
    });

    test('typing and clearing in quick cycles coalesces', () {
      for (var step = 0; step < 100; step++) {
        publisher.onTextChanged(step.isEven ? 'x' : '');
        clock.advance(const Duration(milliseconds: 100));
      }
      clock.advance(const Duration(seconds: 5));
      expectWithinBudget();
      expect(states().last, isFalse);
    });

    test('rapid sends stay within the budget', () {
      for (var step = 0; step < 50; step++) {
        publisher.onTextChanged('message $step');
        clock.advance(const Duration(milliseconds: 100));
        publisher.stop(); // Sent.
        clock.advance(const Duration(milliseconds: 100));
      }
      clock.advance(const Duration(seconds: 5));
      expectWithinBudget();
      expect(states().last, isFalse);
    });

    test('steady typing refreshes without exceeding the budget', () {
      for (var step = 0; step <= 100; step++) {
        publisher.onTextChanged('x' * (step + 1));
        clock.advance(const Duration(milliseconds: 100));
      }
      expectWithinBudget();
      expect(sent.length, lessThanOrEqualTo(4));
      expect(states().every((on) => on), isTrue);
    });

    test('flush sends a held stop at once; dispose ignores edits', () {
      publisher
        ..onTextChanged('draft')
        ..stop()
        ..flush();
      expect(states(), [true, false]);

      clock.advance(const Duration(seconds: 2));
      publisher
        ..onTextChanged('again')
        ..dispose()
        ..onTextChanged('ignored');
      clock.advance(const Duration(seconds: 5));
      expect(states(), [true, false, true, false]);
    });
  });

  group('ChatTypingRoster', () {
    late _Clock clock;
    late List<Set<String>> changes;
    late ChatTypingRoster roster;

    setUp(() {
      clock = _Clock();
      changes = [];
      roster = ChatTypingRoster(onChanged: changes.add, timer: clock.timer)
        ..reset(threadId);
    });

    test('a typist expires without a stop frame', () {
      roster.apply(threadId, 'ada', typing: true);
      expect(roster.userIds, {'ada'});

      clock.advance(const Duration(seconds: 3));
      roster.apply(threadId, 'ada', typing: true); // Refresh.
      clock.advance(const Duration(seconds: 3));
      expect(roster.userIds, {'ada'});

      clock.advance(roster.ttl);
      expect(roster.userIds, isEmpty);
      expect(changes.last, isEmpty);
    });

    test('stop removes a typist; other conversations are ignored', () {
      roster
        ..apply(otherThreadId, 'linh', typing: true)
        ..apply(threadId, 'ada', typing: true)
        ..apply(threadId, 'ada', typing: false);
      expect(roster.userIds, isEmpty);
      expect(changes, [
        {'ada'},
        <String>{},
      ]);
    });

    test('changing conversation forgets every typist', () {
      roster
        ..apply(threadId, 'ada', typing: true)
        ..reset(otherThreadId);
      expect(roster.userIds, isEmpty);
      clock.advance(roster.ttl);
      expect(changes, [
        {'ada'},
        <String>{},
      ]);
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

      harness.now = harness.now.add(const Duration(seconds: 1));
      await harness.cubit.sendMessage('Hello');
      await harness.settle();
      expect(harness.typingSent.last, (conversationId: threadId, on: false));
    });

    test('ends typing on blur and before leaving the thread', () async {
      await harness.open();
      harness.cubit.reportTyping('draft');
      harness.now = harness.now.add(const Duration(seconds: 1));
      harness.cubit.stopTyping();
      expect(harness.typingSent.last.on, isFalse);

      harness.now = harness.now.add(const Duration(seconds: 1));
      harness.cubit.reportTyping('draft again');
      expect(harness.typingSent.last.on, isTrue);
      // Leaving sends at once, inside the gap, before the socket closes.
      await harness.cubit.selectConversation(otherThreadId);
      expect(harness.typingSent.last, (conversationId: threadId, on: false));
    });

    test('ends typing when the app leaves the foreground', () async {
      final binding = WidgetsFlutterBinding.ensureInitialized()
        ..handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await harness.open();
      harness.cubit.reportTyping('draft');
      expect(harness.typingSent.last.on, isTrue);

      binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      expect(harness.typingSent.last, (conversationId: threadId, on: false));
      binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    });

    test('an AI conversation publishes nothing', () async {
      harness.repository.conversations = [
        fixtureConversation(threadId).copyWith(type: ChatConversationType.ai),
      ];
      await harness.open();
      harness.cubit.reportTyping('hello Mira');
      expect(harness.typingSent, isEmpty);
    });

    test('shows typists of the open conversation only', () async {
      await harness.open();
      harness.inbox
        ..add(
          const ChatRealtimeTypingEvent(
            conversationId: threadId,
            actorUserId: 'ada',
            isTyping: true,
          ),
        )
        ..add(
          const ChatRealtimeTypingEvent(
            conversationId: otherThreadId,
            actorUserId: 'linh',
            isTyping: true,
          ),
        );
      await harness.settle();
      expect(harness.cubit.state.typingUserIds, {'ada'});

      // A typist from one thread never follows the viewer to another.
      await harness.cubit.selectConversation(otherThreadId);
      await harness.settle();
      expect(harness.cubit.state.typingUserIds, isEmpty);
    });

    test('a typist who goes offline stops typing', () async {
      await harness.open();
      harness.inbox.add(
        const ChatRealtimeTypingEvent(
          conversationId: threadId,
          actorUserId: 'ada',
          isTyping: true,
        ),
      );
      await harness.settle();
      expect(harness.cubit.state.typingUserIds, {'ada'});

      // The room socket reports offline presence as a typing stop.
      harness.inbox.add(
        const ChatRealtimeTypingEvent(
          conversationId: threadId,
          actorUserId: 'ada',
          isTyping: false,
        ),
      );
      await harness.settle();
      expect(harness.cubit.state.typingUserIds, isEmpty);
    });
  });
}
