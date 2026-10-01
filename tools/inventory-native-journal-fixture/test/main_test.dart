import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../lib/main.dart' as fixture;
import '../lib/inventory_sale_journal.dart';

void main() {
  test(
    'phase channel failure writes fixed failure without invoking storage',
    () async {
      Map<String, dynamic>? reported;
      var exercised = false;
      final result = await fixture.runFixture(
        phase: () async => throw PlatformException(code: 'RAW_SECRET'),
        report: (value) async => reported = value,
        exercisePhase: (_) async => exercised = true,
      );
      expect(exercised, false);
      expect(reported?['passed'], false);
      expect(result['error'], 'phase_channel_failed');
      expect(result.toString(), isNot(contains('RAW_SECRET')));
    },
  );
  test('report channel failure remains failed and does not escape', () async {
    final result = await fixture.runFixture(
      phase: () async => 'read',
      report: (_) async => throw PlatformException(code: 'RAW_SECRET'),
      exercisePhase: (_) async {},
    );
    expect(result['passed'], false);
    expect(result['error'], 'report_channel_failed');
    expect(result.toString(), isNot(contains('RAW_SECRET')));
  });
  test('absent phase emits failure and renders no storage pass', () async {
    final result = await fixture.runFixture(
      phase: () async => null,
      report: (_) async {},
      exercisePhase: (_) async => fail('Storage must not run'),
    );
    expect(result['passed'], false);
    expect(result['error'], 'phase_channel_failed');
  });
  test(
    'sentinel survives matching cleanup and final restart verification',
    () async {
      final storage = <String, String>{};
      final journal = InventorySaleJournal(
        read: (key) async => storage[key],
        write: (key, value) async => storage[key] = value,
        remove: (key) async => storage.remove(key),
      );
      for (final phase in ['write', 'read', 'cleanup']) {
        await fixture.exercise(phase, journal: journal);
      }
      expect(storage.length, 1);
      expect(
        (await journal.read(
          fixture.sentinel.actor,
          fixture.sentinel.workspace,
        ))?.encode(),
        fixture.sentinel.encode(),
      );
      await fixture.exercise('verify-clean', journal: journal);
      expect(storage, isEmpty);
    },
  );
  test(
    'broad deletion fails the cleanup proof rather than silently passing',
    () async {
      final storage = <String, String>{};
      final journal = InventorySaleJournal(
        read: (key) async => storage[key],
        write: (key, value) async => storage[key] = value,
        remove: (_) async => storage.clear(),
      );
      await fixture.exercise('write', journal: journal);
      await expectLater(
        fixture.exercise('cleanup', journal: journal),
        throwsStateError,
      );
    },
  );
}
