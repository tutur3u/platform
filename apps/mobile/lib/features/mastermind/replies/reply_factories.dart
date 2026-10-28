import 'dart:io';

import 'package:flutter/services.dart' show appFlavor;
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/fixture_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/supabase_access_token_provider.dart';
import 'package:mobile/features/mastermind/replies/hub_reply_transport.dart';
import 'package:mobile/features/mastermind/replies/reply_outbox_store.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';
import 'package:path_provider/path_provider.dart';

/// The reply transport for this build: none for a fixture build or a build with
/// no hub URL, otherwise the same hub the snapshot source reads.
MastermindReplyTransport? createMastermindReplyTransport({
  AccessTokenProvider? tokens,
  http.Client? client,
  Uri? hubUrl,
}) {
  if (FixtureSnapshotSource().isConfigured) return null;
  // The native flavor is a compile-time value the analyzer cannot see.
  // ignore: avoid_redundant_argument_values
  final base = hubUrl ?? MastermindHubConfig.resolve(flavor: appFlavor);
  if (base == null) return null;
  final live = HubReplyTransport(
    baseUrl: base,
    tokens: tokens ?? const SupabaseAccessTokenProvider(),
    client: client,
  );
  return live.isConfigured ? live : null;
}

/// Queued replies persist only where the OS gives the app a private cache
/// directory (Android and iOS), exactly like the snapshot cache.
MastermindOutboxStore createMastermindOutboxStore({
  required String? Function() userId,
  bool? privateStorage,
  Future<Directory> Function()? baseDirectory,
}) {
  final persistent = privateStorage ?? (Platform.isAndroid || Platform.isIOS);
  if (!persistent) return MemoryOutboxStore();
  return FileOutboxStore(
    baseDirectory: baseDirectory ?? getApplicationCacheDirectory,
    userId: userId,
  );
}
