import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';

/// Reads and stores the signed-in user's Mira AI data consent.
///
/// Requests are pinned to the given user, so an account switch mid-request
/// fails instead of recording an answer for another account.
class MiraAiConsentRepository {
  MiraAiConsentRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  static const path = '/api/v1/users/me/ai-data-consent';

  final ApiClient _api;

  Future<MiraAiConsent> fetch(String userId) async => MiraAiConsent.fromJson(
    await ApiClient.runForUser(userId, () => _api.getJson(path)),
  );

  Future<MiraAiConsent> save(
    String userId, {
    required bool granted,
    required MiraAiConsentSource source,
  }) async => MiraAiConsent.fromJson(
    await ApiClient.runForUser(
      userId,
      () => _api.putJson(path, {
        'granted': granted,
        'source': source.code,
        'policyVersion': miraAiConsentPolicyVersion,
      }),
    ),
  );
}
