import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Whether the server lets the owner delete a workspace right now.
enum WorkspaceDeletionStatus {
  ready,

  /// The `PREVENT_WORKSPACE_DELETION` secret is set.
  protected,

  /// Paid or unverified billing must be resolved first.
  subscriptionActive,

  /// The actor is not the owner, or the workspace is personal or the root.
  forbidden,
  notFound,

  /// The server failed (5xx) or could not be reached.
  unavailable,
}

/// Why a deletion request did not delete the workspace.
class WorkspaceDeletionException implements Exception {
  const WorkspaceDeletionException(this.status, {this.confirmationMismatch});

  /// The blocking state; [WorkspaceDeletionStatus.unavailable] for server
  /// failures, which the caller shows as a retryable outage.
  final WorkspaceDeletionStatus status;

  /// The typed name did not match the workspace name.
  final bool? confirmationMismatch;

  @override
  String toString() => 'WorkspaceDeletionException($status)';
}

/// Owner-only workspace deletion through the web API, which checks
/// ownership, the typed confirmation, the deletion lock and billing before
/// calling `delete_owned_workspace`.
class WorkspaceDeletionRepository {
  WorkspaceDeletionRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<WorkspaceDeletionStatus> getStatus(String wsId) async {
    try {
      final response = await _api.getJson(
        '${WorkspaceEndpoints.workspace(wsId)}/deletion-status',
      );
      return switch (response['status']) {
        'ready' => WorkspaceDeletionStatus.ready,
        'protected' => WorkspaceDeletionStatus.protected,
        'subscription_active' => WorkspaceDeletionStatus.subscriptionActive,
        _ => WorkspaceDeletionStatus.unavailable,
      };
    } on ApiException catch (error) {
      return _statusFor(error);
    }
  }

  /// Deletes [wsId] when [confirmation] matches its name.
  ///
  /// Throws [WorkspaceDeletionException] when the server refuses or fails.
  Future<void> delete({
    required String wsId,
    required String confirmation,
  }) async {
    try {
      await _api.deleteJson(
        WorkspaceEndpoints.workspace(wsId),
        body: {'confirmation': confirmation.trim()},
      );
    } on ApiException catch (error) {
      if (error.code == 'confirmation_mismatch') {
        throw const WorkspaceDeletionException(
          WorkspaceDeletionStatus.ready,
          confirmationMismatch: true,
        );
      }
      throw WorkspaceDeletionException(_statusFor(error));
    }
  }

  WorkspaceDeletionStatus _statusFor(ApiException error) =>
      switch ((error.statusCode, error.code)) {
        (_, 'forbidden') || (403, _) => WorkspaceDeletionStatus.forbidden,
        (_, 'not_found') || (404, _) => WorkspaceDeletionStatus.notFound,
        (_, 'subscription_active') ||
        (409, _) => WorkspaceDeletionStatus.subscriptionActive,
        _ => WorkspaceDeletionStatus.unavailable,
      };
}
