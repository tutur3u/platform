import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/bridge/assistant_client_actions.dart';
import 'package:mobile/features/assistant/bridge/assistant_live_client_markers.dart';

class _Bridge implements AssistantClientActionBridge {
  _Bridge(this.result);

  final AssistantClientActionResult result;
  final applied = <String>[];
  bool Function()? lastGuard;
  bool throwOnApply = false;

  @override
  Set<String> get capabilities => const {'theme', 'navigate'};

  @override
  Future<AssistantClientActionResult> apply(
    String toolName,
    Map<String, dynamic> output, {
    bool Function()? isCurrent,
  }) async {
    applied.add(toolName);
    lastGuard = isCurrent;
    if (throwOnApply) throw StateError('Synthetic retired client action');
    return result;
  }
}

void main() {
  const marker = {'success': true, 'action': 'open_app', 'destination': 'mail'};
  const args = {'toolName': 'open_app', 'argumentsJson': '{}'};

  test('contains apply failures and permits the next tool response', () async {
    final bridge = _Bridge(const AssistantClientActionResult.applied())
      ..throwOnApply = true;
    final failed = await applyAssistantLiveClientMarker(
      functionName: 'execute_workspace_tool',
      args: args,
      result: marker,
      bridge: bridge,
    );
    expect(failed['error'], 'client_action_not_applied');
    expect(failed['reason'], 'apply_failed');
    expect(failed.containsKey('success'), isFalse);
    expect(failed.containsKey('clientApplied'), isFalse);
    bridge.throwOnApply = false;
    expect(
      await applyAssistantLiveClientMarker(
        functionName: 'execute_workspace_tool',
        args: args,
        result: marker,
        bridge: bridge,
      ),
      {...marker, 'clientApplied': true},
    );
  });

  test('applies canonical UI markers and reports the device result', () async {
    final bridge = _Bridge(const AssistantClientActionResult.applied());
    var current = true;
    final result = await applyAssistantLiveClientMarker(
      functionName: 'execute_workspace_tool',
      args: args,
      result: marker,
      isCurrent: () => current,
      bridge: bridge,
    );
    expect(bridge.applied, ['open_app']);
    current = false;
    expect(bridge.lastGuard?.call(), isFalse);
    expect(result, {...marker, 'clientApplied': true});
  });

  test('turns an unapplied marker into an error', () async {
    final result = await applyAssistantLiveClientMarker(
      functionName: 'execute_workspace_tool',
      args: args,
      result: marker,
      bridge: _Bridge(
        const AssistantClientActionResult.rejected('workspace_mismatch'),
      ),
    );
    expect(result['error'], 'client_action_not_applied');
    expect(result['reason'], 'workspace_mismatch');
    expect(result.containsKey('success'), isFalse);
  });

  test('reports an error when no bridge is registered', () async {
    final result = await applyAssistantLiveClientMarker(
      functionName: 'execute_workspace_tool',
      args: args,
      result: marker,
    );
    expect(result['error'], 'client_action_unavailable');
  });

  test('passes data tools, discovery and failures through unchanged', () async {
    final bridge = _Bridge(const AssistantClientActionResult.applied());
    const data = {'success': true, 'tasks': <Object>[]};
    expect(
      await applyAssistantLiveClientMarker(
        functionName: 'execute_workspace_tool',
        args: const {'toolName': 'get_my_tasks'},
        result: data,
        bridge: bridge,
      ),
      data,
    );
    expect(
      await applyAssistantLiveClientMarker(
        functionName: 'search_workspace_tools',
        args: const {'query': 'theme'},
        result: data,
        bridge: bridge,
      ),
      data,
    );
    const failed = {'error': 'live_tool_unavailable'};
    expect(
      await applyAssistantLiveClientMarker(
        functionName: 'execute_workspace_tool',
        args: args,
        result: failed,
        bridge: bridge,
      ),
      failed,
    );
    expect(bridge.applied, isEmpty);
  });
}
