import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';

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

class FleetRepository implements FleetSource {
  FleetRepository({ApiClient? api}) : _api = api ?? ApiClient();

  static const statePath = '/api/v1/mastermind/fleet/state';

  /// Snapshot features this app renders. Without `login`, Web omits access
  /// requests because older clients would offer answers it refuses; without
  /// `alerts`, it omits SLO burn alerts.
  static const featuresHeader = {'x-mastermind-fleet-features': 'login,alerts'};
  static String answerPath(String decisionId) =>
      '/api/v1/mastermind/fleet/decisions/${Uri.encodeComponent(decisionId)}/answer';

  final ApiClient _api;

  @override
  Future<FleetSnapshot> fetch() async {
    try {
      return FleetSnapshot.parse(
        await _api.getJsonWithHeaders(statePath, featuresHeader),
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
}
