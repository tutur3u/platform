import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_call_phase.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_parts.dart';
import 'package:mobile/features/assistant/models/assistant_live_turn_snapshot.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_captions.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_call_timer.dart';

AssistantLiveState _at(
  AssistantLiveConnectionStatus status, [
  DateTime? start,
]) => AssistantLiveState(status: status, callStartedAt: start);

void main() {
  final t0 = DateTime.utc(2026, 10, 25, 4);

  group('formatAssistantLiveCallDuration', () {
    test('uses mm:ss under an hour and h:mm:ss after', () {
      expect(formatAssistantLiveCallDuration(Duration.zero), '00:00');
      expect(
        formatAssistantLiveCallDuration(const Duration(seconds: 65)),
        '01:05',
      );
      expect(
        formatAssistantLiveCallDuration(
          const Duration(minutes: 59, seconds: 59),
        ),
        '59:59',
      );
      expect(
        formatAssistantLiveCallDuration(const Duration(hours: 1, seconds: 62)),
        '1:01:02',
      );
      expect(
        formatAssistantLiveCallDuration(const Duration(hours: 12, minutes: 3)),
        '12:03:00',
      );
    });

    test('clamps negative clock skew to zero', () {
      expect(
        formatAssistantLiveCallDuration(const Duration(seconds: -3)),
        '00:00',
      );
    });
  });

  group('applyAssistantLiveCallClock', () {
    test('starts on the first connected state', () {
      final next = applyAssistantLiveCallClock(
        _at(AssistantLiveConnectionStatus.connecting),
        _at(AssistantLiveConnectionStatus.connected),
        t0,
      );
      expect(next.callStartedAt, t0);
      expect(next.lastCallDuration, isNull);
    });

    test('keeps the start through reconnects, errors and later connects', () {
      for (final status in [
        AssistantLiveConnectionStatus.reconnecting,
        AssistantLiveConnectionStatus.error,
        AssistantLiveConnectionStatus.connected,
      ]) {
        final next = applyAssistantLiveCallClock(
          _at(AssistantLiveConnectionStatus.connected, t0),
          _at(status, t0),
          t0.add(const Duration(minutes: 5)),
        );
        expect(next.callStartedAt, t0, reason: '$status');
      }
    });

    test('records the duration when the call disconnects', () {
      final next = applyAssistantLiveCallClock(
        _at(AssistantLiveConnectionStatus.connected, t0),
        _at(AssistantLiveConnectionStatus.disconnected, t0),
        t0.add(const Duration(minutes: 3, seconds: 12)),
      );
      expect(next.callStartedAt, isNull);
      expect(next.lastCallDuration, const Duration(minutes: 3, seconds: 12));
    });

    test('a fresh attempt clears the previous call', () {
      const ended = AssistantLiveState(
        hasEnded: true,
        lastCallDuration: Duration(minutes: 1),
      );
      final next = applyAssistantLiveCallClock(
        ended,
        ended.copyWith(status: AssistantLiveConnectionStatus.preparing),
        t0,
      );
      expect(next.callStartedAt, isNull);
      expect(next.lastCallDuration, isNull);
    });

    test('a failed first attempt never starts the clock', () {
      final next = applyAssistantLiveCallClock(
        _at(AssistantLiveConnectionStatus.connecting),
        _at(AssistantLiveConnectionStatus.error),
        t0,
      );
      expect(next.callStartedAt, isNull);
      expect(next.lastCallDuration, isNull);
    });
  });

  test('maps connection status to call phases', () {
    AssistantLiveCallPhase phase(AssistantLiveState state) =>
        assistantLiveCallPhase(state);
    expect(
      phase(_at(AssistantLiveConnectionStatus.preparing)),
      AssistantLiveCallPhase.connecting,
    );
    expect(
      phase(_at(AssistantLiveConnectionStatus.connecting)),
      AssistantLiveCallPhase.connecting,
    );
    expect(
      phase(_at(AssistantLiveConnectionStatus.connected)),
      AssistantLiveCallPhase.connected,
    );
    expect(
      phase(_at(AssistantLiveConnectionStatus.reconnecting)),
      AssistantLiveCallPhase.reconnecting,
    );
    expect(
      phase(_at(AssistantLiveConnectionStatus.error)),
      AssistantLiveCallPhase.failed,
    );
    expect(
      phase(const AssistantLiveState(hasEnded: true)),
      AssistantLiveCallPhase.ended,
    );
    // A page-initiated disconnect (backgrounding, hidden page) has no
    // finishTurn, and nothing reconnects it: the call has ended.
    expect(
      phase(_at(AssistantLiveConnectionStatus.disconnected)),
      AssistantLiveCallPhase.ended,
    );
  });

  test('a surface awaiting its session start reads as connecting', () {
    AssistantLiveCallPhase awaiting(AssistantLiveState state) =>
        assistantLiveCallPhase(state, awaitingStart: true);
    for (final state in [
      _at(AssistantLiveConnectionStatus.disconnected),
      _at(AssistantLiveConnectionStatus.error),
      const AssistantLiveState(hasEnded: true),
    ]) {
      expect(awaiting(state), AssistantLiveCallPhase.connecting);
    }
    expect(
      awaiting(_at(AssistantLiveConnectionStatus.connected)),
      AssistantLiveCallPhase.connected,
    );
    expect(
      awaiting(_at(AssistantLiveConnectionStatus.reconnecting)),
      AssistantLiveCallPhase.reconnecting,
    );
    expect(
      assistantLiveCallStarted(AssistantLiveConnectionStatus.preparing),
      isTrue,
    );
    expect(
      assistantLiveCallStarted(AssistantLiveConnectionStatus.disconnected),
      isFalse,
    );
    expect(
      assistantLiveCallStarted(AssistantLiveConnectionStatus.error),
      isFalse,
    );
  });

  test('captions keep the newest turns and live drafts in order', () {
    AssistantLiveTurnSnapshot turn(int index) => AssistantLiveTurnSnapshot(
      id: '$index',
      userText: '',
      userTranscript: 'question $index',
      assistantText: index.isEven ? 'typed answer $index' : '',
      assistantTranscript: 'spoken answer $index',
      parts: AssistantLiveTurnParts(),
      createdAt: t0,
    );
    final captions = assistantLiveCaptions(
      AssistantLiveState(
        completedTurns: [for (var i = 0; i < 5; i++) turn(i)],
        userTranscript: '  next question ',
      ),
      maxTurns: 2,
    );
    expect(captions.map((caption) => caption.text), [
      'question 3',
      'spoken answer 3',
      'question 4',
      'typed answer 4',
      'next question',
    ]);
    expect(captions.last.fromAssistant, isFalse);
  });
}
