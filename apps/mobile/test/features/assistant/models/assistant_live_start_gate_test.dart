import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_live_start_gate.dart';

void main() {
  test(
    'cancelled delayed attempt cannot clear a restarted pending call',
    () async {
      final gate = AssistantLiveStartGate();
      final old = gate.begin(1)!;
      final token = Completer<void>();
      final finishing = token.future.whenComplete(() => gate.finish(old));
      expect(gate.begin(1), isNull);
      gate.cancel(old);
      final current = gate.begin(1)!;
      token.complete();
      await finishing;
      expect(gate.pendingFor(1), isTrue);
      expect(gate.begin(1), isNull);
      gate.finish(current);
      expect(gate.pendingFor(1), isFalse);
    },
  );
  test('actor/workspace ABA epoch and stale cancel cannot own successor', () {
    final gate = AssistantLiveStartGate();
    final old = gate.begin(1)!;
    final next = gate.begin(3)!;
    gate.cancel(old);
    gate.finish(old);
    expect(gate.pendingFor(3), isTrue);
    expect(gate.pendingFor(1), isFalse);
    gate.finish(next);
    expect(gate.pendingFor(3), isFalse);
  });
  test('late cancellation in the same scope cannot clear a newer attempt', () {
    final gate = AssistantLiveStartGate();
    final old = gate.begin(1)!;
    final captured = gate.currentFor(1);
    expect(captured, same(old));
    gate.cancel(captured);
    final next = gate.begin(1)!;
    gate.cancel(captured);
    expect(gate.pendingFor(1), isTrue);
    gate.finish(next);
  });
}
