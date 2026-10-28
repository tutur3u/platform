import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/file_snapshot_store.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';
import 'package:mobile/features/mastermind/data/snapshot_store_factory.dart';

void main() {
  test('platforms without private storage keep the snapshot in memory', () {
    var asked = false;
    final store = createMastermindSnapshotStore(
      userId: () => 'user-a',
      privateStorage: false,
      baseDirectory: () async {
        asked = true;
        return Directory.systemTemp;
      },
    );
    expect(store, isA<MemorySnapshotStore>());
    expect(asked, isFalse);
  });

  test('platforms with private storage persist to the injected base', () {
    final store = createMastermindSnapshotStore(
      userId: () => 'user-a',
      privateStorage: true,
      baseDirectory: () async => Directory.systemTemp,
    );
    expect(store, isA<FileSnapshotStore>());
  });
}
