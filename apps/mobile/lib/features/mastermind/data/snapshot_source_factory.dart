import 'package:flutter/services.dart' show appFlavor;
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/fixture_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/hub_http_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/supabase_access_token_provider.dart';
import 'package:mobile/features/mastermind/data/unconfigured_snapshot_source.dart';

/// Fixture builds (explicit development opt-in) read the bundled sample. Every
/// other build reads the hub Worker for its flavor or `MASTERMIND_HUB_URL`, and
/// stays disconnected when neither names an HTTPS host.
MastermindSnapshotSource createMastermindSnapshotSource({
  AccessTokenProvider? tokens,
  http.Client? client,
  Uri? hubUrl,
}) {
  final fixture = FixtureSnapshotSource();
  if (fixture.isConfigured) return fixture;
  // The native flavor is a compile-time value the analyzer cannot see.
  // ignore: avoid_redundant_argument_values
  final base = hubUrl ?? MastermindHubConfig.resolve(flavor: appFlavor);
  if (base == null) return const UnconfiguredSnapshotSource();
  final live = HubHttpSnapshotSource(
    baseUrl: base,
    tokens: tokens ?? const SupabaseAccessTokenProvider(),
    client: client,
  );
  return live.isConfigured ? live : const UnconfiguredSnapshotSource();
}
