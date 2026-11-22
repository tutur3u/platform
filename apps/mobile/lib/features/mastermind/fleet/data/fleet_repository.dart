import 'dart:typed_data';

import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';

/// Why a fleet read failed, as a closed category; never a server message.
///
/// [closed] is an answer Web refused because the decision or login request
/// already ended (409); resending the same answer cannot succeed. [rejected]
/// is any other 4xx refusal of an answer, such as a 422 `invalid_answer`.
/// [challenged] is a 403 abuse step-up (Turnstile) this client cannot pass.
/// [unavailable] (network, 5xx, 429) is the only kind a resend can fix.
enum FleetFailure {
  forbidden,
  challenged,
  notPublished,
  closed,
  rejected,
  unavailable,
  unreadable,
}

class FleetException implements Exception {
  const FleetException(this.failure, {this.code});

  factory FleetException.from(Object error) => switch (error) {
    FleetException() => error,
    FormatException() => const FleetException(FleetFailure.unreadable),
    // An abuse step-up is not lost access: the session still holds, but this
    // client cannot answer the challenge.
    ApiException(isVerificationRequired: true) => const FleetException(
      FleetFailure.challenged,
      code: 'verification_required',
    ),
    ApiException(statusCode: 401 || 403) => const FleetException(
      FleetFailure.forbidden,
    ),
    ApiException(statusCode: 404) => const FleetException(
      FleetFailure.notPublished,
    ),
    ApiException(statusCode: 409, :final message) => FleetException(
      FleetFailure.closed,
      code: switch (message) {
        'decision_closed' || 'login_closed' => message,
        _ => null,
      },
    ),
    ApiException(:final statusCode, :final message)
        when statusCode >= 400 &&
            statusCode < 500 &&
            statusCode != 408 &&
            statusCode != 429 =>
      FleetException(FleetFailure.rejected, code: _code(message)),
    _ => const FleetException(FleetFailure.unavailable),
  };

  final FleetFailure failure;

  /// Web's closed-set error code (`decision_closed`, `invalid_answer`, ...);
  /// anything else is dropped so no server text reaches the screen.
  final String? code;

  static String? _code(String message) =>
      RegExp(r'^[a-z][a-z_]{0,40}$').hasMatch(message) ? message : null;
}

/// Reads the live fleet snapshot and posts owner answers.
abstract interface class FleetSource {
  Future<FleetSnapshot> fetch();

  Future<FleetAnswerReceipt> answer({
    required String decisionId,
    required FleetAnswerAction action,
    required String idempotencyKey,
    String? optionId,
    String? text,
  });
}

class FleetRepository implements FleetSource, FleetSecretAnswerSource {
  FleetRepository({
    ApiClient? api,
    Future<bool> Function()? secretSupported,
    bool secretCardsReady = fleetSecretCardsReady,
  }) : _api = api ?? ApiClient(),
       _secretSupported =
           secretSupported ?? FleetSecretCrypto.instance.supported,
       _secretCardsReady = secretCardsReady;

  static const statePath = '/api/v1/mastermind/fleet/state';
  static const String _snapshotFeatures = 'login,alerts,review,mobile-issues';

  /// Snapshot features this app renders. Without `login` or `review`, Web
  /// omits access requests or design reviews because older clients would
  /// offer answers it refuses; without `alerts`, it omits SLO burn alerts.
  static const Map<String, String> featuresHeader = {
    'x-mastermind-fleet-features': _snapshotFeatures,
  };

  /// [featuresHeader] plus `secret` where CryptoKit secret entry runs (iOS
  /// 17 or later with the plugin) and the Inbox renders secret cards
  /// ([fleetSecretCardsReady]); Web hides secret decisions otherwise.
  static const Map<String, String> secretFeaturesHeader = {
    'x-mastermind-fleet-features': '$_snapshotFeatures,secret',
  };

  /// Web's cap on an uploaded review preview.
  static const int reviewAssetMaxBytes = 200 * 1024;
  static final RegExp _assetId = RegExp(r'^[0-9a-f]{64}$');
  static String reviewAssetPath(String assetId) =>
      '/api/v1/mastermind/fleet/review-assets/$assetId';
  static String answerPath(String decisionId) =>
      '/api/v1/mastermind/fleet/decisions/${Uri.encodeComponent(decisionId)}/answer';

  final ApiClient _api;
  final Future<bool> Function() _secretSupported;
  final bool _secretCardsReady;

  Future<Map<String, String>> _features() async {
    if (!_secretCardsReady) return featuresHeader;
    try {
      return await _secretSupported() ? secretFeaturesHeader : featuresHeader;
    } on Object {
      return featuresHeader;
    }
  }

  @override
  Future<FleetSnapshot> fetch() async {
    try {
      return FleetSnapshot.parse(
        await _api.getJsonWithHeaders(statePath, await _features()),
      );
    } on Object catch (error) {
      throw FleetException.from(error);
    }
  }

  /// A review preview's bytes, read with the same owner session as the
  /// snapshot. Only a content-addressed asset id is ever requested.
  Future<Uint8List> reviewAsset(String assetId) async {
    if (!_assetId.hasMatch(assetId)) {
      throw const FleetException(FleetFailure.unreadable);
    }
    try {
      return await _api.getBytes(
        reviewAssetPath(assetId),
        maxBytes: reviewAssetMaxBytes,
      );
    } on Object catch (error) {
      throw FleetException.from(error);
    }
  }

  @override
  Future<FleetAnswerReceipt> answer({
    required String decisionId,
    required FleetAnswerAction action,
    required String idempotencyKey,
    String? optionId,
    String? text,
  }) async {
    try {
      // The key travels in the body: ApiClient owns the request headers.
      final json = await _api.postJson(answerPath(decisionId), {
        'action': action.wire,
        'optionId': ?optionId,
        'text': ?text,
        'idempotencyKey': idempotencyKey,
      });
      final receipt = FleetAnswerReceipt.parse(json);
      if (receipt == null) throw const FormatException('Invalid receipt');
      return receipt;
    } on Object catch (error) {
      throw FleetException.from(error);
    }
  }

  /// Posts a secret, decline or pair answer directly: never through the
  /// answer outbox, so a sealed value is never written to disk. The caller
  /// resends the same [answer] under the same key while its screen is open.
  @override
  Future<void> answerSecret({
    required String decisionId,
    required FleetSecretAnswer answer,
    required String idempotencyKey,
    Future<bool> Function()? stillTrusted,
  }) async {
    var refused = false;
    final path = answerPath(decisionId);
    final body = {...answer.toJson(), 'idempotencyKey': idempotencyKey};
    try {
      if (stillTrusted == null) {
        await _api.postJson(path, body);
      } else {
        await _api.postJsonGuarded(
          path,
          body,
          beforeDispatch: () async {
            if (!await stillTrusted()) {
              refused = true;
              throw const FleetSecretSendException(
                FleetSecretSendFailure.untrusted,
              );
            }
          },
        );
      }
    } on Object catch (error) {
      if (refused) {
        throw const FleetSecretSendException(FleetSecretSendFailure.untrusted);
      }
      throw FleetSecretSendException.from(error);
    }
  }
}
