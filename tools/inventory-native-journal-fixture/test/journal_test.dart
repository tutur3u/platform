import 'package:flutter_test/flutter_test.dart';

import '../lib/main.dart' as fixture;
import '../lib/inventory_sale_journal.dart';

void main() {
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
