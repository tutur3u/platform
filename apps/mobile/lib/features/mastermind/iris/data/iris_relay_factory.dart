import 'package:flutter/services.dart' show appFlavor;
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/supabase_access_token_provider.dart';
import 'package:mobile/features/mastermind/iris/data/fixture_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/http_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/request_signer.dart';

/// Fixture builds read the bundled synthetic relay; every other build talks to
/// `/v1/iris/*` on its hub origin, and stays unconfigured without one.
///
/// [signer] is the device key. Until the native key lane lands the fake signer
/// stands in, which a real relay refuses: Iris stays behind enrolment.
IrisRelay createIrisRelay({
  AccessTokenProvider? tokens,
  IrisRequestSigner? signer,
  http.Client? client,
  Uri? hubUrl,
}) {
  if (FixtureIrisRelay.buildEnabled) return FixtureIrisRelay();
  // The native flavor is a compile-time value the analyzer cannot see.
  // ignore: avoid_redundant_argument_values
  final base = hubUrl ?? MastermindHubConfig.resolve(flavor: appFlavor);
  if (base == null) return const UnconfiguredIrisRelay();
  final relay = HttpIrisRelay(
    baseUrl: base,
    tokens: tokens ?? const SupabaseAccessTokenProvider(),
    signer: signer ?? FakeIrisRequestSigner(),
    client: client,
  );
  return relay.isConfigured ? relay : const UnconfiguredIrisRelay();
}
