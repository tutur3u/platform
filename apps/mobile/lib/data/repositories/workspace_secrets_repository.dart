import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/workspace_secret.dart';
import 'package:mobile/data/models/workspace_storage_rollout.dart';
import 'package:mobile/data/sources/api_client.dart';

class WorkspaceSecretsRepository {
  WorkspaceSecretsRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<List<WorkspaceSecret>> getSecrets(String wsId) async {
    final response = await _api.getJsonList(
      WorkspaceSettingsEndpoints.secrets(wsId),
    );
    return response
        .whereType<Map<String, dynamic>>()
        .map(WorkspaceSecret.fromJson)
        .toList(growable: false);
  }

  Future<WorkspaceStorageRolloutState> getRolloutState(String wsId) async {
    final response = await _api.getJson(
      WorkspaceSettingsEndpoints.storageRolloutState(wsId),
    );
    final payload = response['data'];

    if (payload is Map<String, dynamic>) {
      return WorkspaceStorageRolloutState.fromJson(payload);
    }

    return WorkspaceStorageRolloutState.fromJson(response);
  }

  Future<void> createSecret({
    required String wsId,
    required String name,
    required String value,
  }) async {
    await _api.postJson(WorkspaceSettingsEndpoints.secrets(wsId), {
      'name': name,
      'value': value,
    });
  }

  Future<void> updateSecret({
    required String wsId,
    required String secretId,
    required String name,
    required String value,
  }) async {
    await _api.putJson(WorkspaceSettingsEndpoints.secret(wsId, secretId), {
      'id': secretId,
      'name': name,
      'value': value,
    });
  }

  Future<void> deleteSecret({
    required String wsId,
    required String secretId,
  }) async {
    await _api.deleteJson(WorkspaceSettingsEndpoints.secret(wsId, secretId));
  }

  Future<WorkspaceStorageMigrationResult> migrateStorage({
    required String wsId,
    required String sourceProvider,
    required String targetProvider,
    bool overwrite = true,
  }) async {
    final response = await _api.postJson(
      WorkspaceSettingsEndpoints.migrateStorage(wsId),
      {
        'sourceProvider': sourceProvider,
        'targetProvider': targetProvider,
        'overwrite': overwrite,
      },
    );
    final payload = response['data'];

    if (payload is Map<String, dynamic>) {
      return WorkspaceStorageMigrationResult.fromJson(payload);
    }

    return WorkspaceStorageMigrationResult.fromJson(response);
  }
}
