import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';

/// Why a fleet read failed, as a closed category; never a server message.
enum FleetFailure { forbidden, notPublished, unavailable, unreadable }

class FleetException implements Exception {
  const FleetException(this.failure);

  factory FleetException.from(Object error) => switch (error) {
    FleetException() => error,
    FormatException() => const FleetException(FleetFailure.unreadable),
    ApiException(statusCode: 401 || 403) => const FleetException(
      FleetFailure.forbidden,
    ),
    ApiException(statusCode: 404) => const FleetException(
      FleetFailure.notPublished,
    ),
    _ => const FleetException(FleetFailure.unavailable),
  };

  final FleetFailure failure;
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
  static String answerPath(String decisionId) =>
      '/api/v1/mastermind/fleet/decisions/${Uri.encodeComponent(decisionId)}/answer';

  final ApiClient _api;

  @override
  Future<FleetSnapshot> fetch() async {
    try {
      return FleetSnapshot.parse(await _api.getJson(statePath));
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
        'action': action.name,
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
