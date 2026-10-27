import 'dart:io';

import 'package:mobile/features/mastermind/data/file_snapshot_store.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_store.dart';
import 'package:path_provider/path_provider.dart';

/// The Mastermind cache for this platform.
///
/// Android and iOS give the app a private cache directory, so the last good
/// snapshot persists there ([getApplicationCacheDirectory], which the OS may
/// reclaim and which is excluded from backups). Desktop has no such guarantee
/// (macOS ships without the sandbox entitlement and Linux has none), so the
/// export stays in memory and is gone when the app exits.
MastermindSnapshotStore createMastermindSnapshotStore({
  required String? Function() userId,
  bool? privateStorage,
  Future<Directory> Function()? baseDirectory,
}) {
  final persistent = privateStorage ?? (Platform.isAndroid || Platform.isIOS);
  if (!persistent) return MemorySnapshotStore();
  return FileSnapshotStore(
    baseDirectory: baseDirectory ?? getApplicationCacheDirectory,
    userId: userId,
  );
}
