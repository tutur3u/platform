import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

void main() {
  const path = String.fromEnvironment('MASTERMIND_LOCAL_SAMPLE');
  test('local-only snapshot contract (values never reported)', () {
    final outcome = parseMastermindSnapshot(File(path).readAsBytesSync());
    expect(
      outcome is ParseAccepted,
      isTrue,
      reason: outcome is ParseRejected
          ? 'rejected: ${outcome.reason.name}; pointer: ${outcome.path}'
          : null,
    );
    if (outcome is ParseAccepted) {
      final s = outcome.snapshot;
      final lengths = [
        s.lanes.length,
        s.backlog.length,
        s.decisions.length,
        s.observability.usage.series.length,
        s.observability.models.series.length,
        s.observability.fleet.series.length,
        s.observability.coordination.messages.length,
        s.observability.delivery.ships.length,
        s.observability.security.series.length,
      ];
      stdout.writeln('accepted; lengths: ${lengths.join(',')}');
    }
  }, skip: path.isEmpty || Platform.environment.containsKey('CI'));
}
