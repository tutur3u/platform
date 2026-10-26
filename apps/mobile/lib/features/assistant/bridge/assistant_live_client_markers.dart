import 'package:mobile/features/assistant/bridge/assistant_client_actions.dart';

const _liveClientMarkerTools = {'set_theme', 'open_app'};

/// Canonical Live returns UI markers from `execute_workspace_tool`. Apply them
/// on this device and tell the model the truth: a marker nobody applied is an
/// error, never a success.
Future<Map<String, dynamic>> applyAssistantLiveClientMarker({
  required String functionName,
  required Map<String, dynamic> args,
  required Map<String, dynamic> result,
  bool Function()? isCurrent,
  AssistantClientActionBridge? bridge,
}) async {
  if (functionName != 'execute_workspace_tool') return result;
  final toolName = args['toolName'];
  if (toolName is! String || !_liveClientMarkerTools.contains(toolName)) {
    return result;
  }
  if (result['success'] != true || result.containsKey('error')) return result;
  final target = bridge ?? AssistantClientActions.current;
  if (target == null) {
    return const {
      'error': 'client_action_unavailable',
      'message':
          'This device could not apply the change. Do not claim it '
          'happened.',
    };
  }
  final AssistantClientActionResult applied;
  try {
    applied = await target.apply(toolName, result, isCurrent: isCurrent);
  } on Object {
    return const {
      'error': 'client_action_not_applied',
      'reason': 'apply_failed',
      'message':
          'This device did not apply the change. Do not claim it '
          'happened.',
    };
  }
  if (applied.applied) return {...result, 'clientApplied': true};
  return {
    'error': 'client_action_not_applied',
    'reason': applied.reason,
    'message':
        'This device did not apply the change. Do not claim it '
        'happened.',
  };
}
