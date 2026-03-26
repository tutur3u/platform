import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/mobile_version_policy.dart';
import 'package:mobile/data/sources/api_client.dart';

class MobileVersionPolicyRepository {
  MobileVersionPolicyRepository({ApiClient? apiClient})
    : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<MobileVersionPolicies> getPolicies() async {
    final response = await _apiClient.getJson(
      MobileEndpoints.infrastructureMobileVersions,
    );

    return MobileVersionPolicies.fromJson(response).normalized();
  }

  Future<MobileVersionPolicies> updatePolicies(
    MobileVersionPolicies policies,
  ) async {
    final response = await _apiClient.putJson(
      MobileEndpoints.infrastructureMobileVersions,
      policies.normalized().toJson(),
    );
    final payload = response['data'];

    if (payload is Map<String, dynamic>) {
      return MobileVersionPolicies.fromJson(payload).normalized();
    }

    return MobileVersionPolicies.fromJson(response).normalized();
  }
}
