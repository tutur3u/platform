import 'package:mobile/features/assistant/bridge/assistant_client_actions.dart';

String? readWorkspaceContextId(dynamic value) {
  if (value is Map<String, dynamic>) {
    for (final key in const [
      'workspaceContextId',
      'workspace_context_id',
      'wsId',
      'workspaceId',
    ]) {
      final candidate = value[key];
      if (candidate is String && candidate.isNotEmpty) {
        return candidate;
      }
    }
  }
  return null;
}

bool readImmersiveFlag(dynamic value) {
  if (value is Map<String, dynamic>) {
    for (final key in const [
      'immersiveMode',
      'immersive',
      'enabled',
      'value',
    ]) {
      final candidate = value[key];
      if (candidate is bool) {
        return candidate;
      }
    }
  }
  return false;
}

/// Applies a Mira UI marker that only the app-level bridge can perform.
/// Returns false when no bridge is registered or the marker is rejected.
Future<bool> applyAssistantClientMarker(
  String toolName,
  Map<dynamic, dynamic> output, {
  required bool Function() isCurrent,
}) async {
  final bridge = AssistantClientActions.current;
  if (bridge == null) return false;
  final result = await bridge.apply(
    toolName,
    Map<String, dynamic>.from(output),
    isCurrent: isCurrent,
  );
  return result.applied;
}
