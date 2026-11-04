import 'package:flutter/services.dart' show appFlavor;
import 'package:http/http.dart' as http;
import 'package:mobile/features/mastermind/data/hub_config.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/data/supabase_access_token_provider.dart';
import 'package:mobile/features/mastermind/iris/data/fixture_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/http_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/device/enrolled_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/device/iris_device_trust.dart';

/// Fixture builds read the bundled synthetic relay. Every other build talks
/// to `/v1/iris/*` on its hub origin, signed by the hardware device key
/// [trust], and only once that key is enrolled.
///
/// There is no fallback signer: without [trust] (a device with no Secure
/// Enclave or Keystore, or a desktop/test host) the relay fails closed as
/// `notEnrolled`, and without a hub origin as `notConfigured`.
IrisRelay createIrisRelay({
  AccessTokenProvider? tokens,
  IrisDeviceTrust? trust,
  http.Client? client,
  Uri? hubUrl,
  bool? fixtureBuild,
}) {
  if (fixtureBuild ?? FixtureIrisRelay.buildEnabled) return FixtureIrisRelay();
  if (trust == null) {
    return const UnconfiguredIrisRelay(reason: IrisFailureKind.notEnrolled);
  }
  // The native flavor is a compile-time value the analyzer cannot see.
  // ignore: avoid_redundant_argument_values
  final base = hubUrl ?? MastermindHubConfig.resolve(flavor: appFlavor);
  if (base == null) return const UnconfiguredIrisRelay();
  final relay = HttpIrisRelay(
    baseUrl: base,
    tokens: tokens ?? const SupabaseAccessTokenProvider(),
    signer: trust,
    client: client,
  );
  return relay.isConfigured
      ? EnrolledIrisRelay(
          inner: relay,
          canSign: trust.canSign,
          onRevoked: trust.relayForgot,
        )
      : const UnconfiguredIrisRelay();
}
