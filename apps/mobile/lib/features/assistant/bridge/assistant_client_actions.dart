/// Outcome of applying a Mira UI tool marker on this device.
enum AssistantClientActionOutcome { applied, unsupported, rejected }

class AssistantClientActionResult {
  const AssistantClientActionResult._(this.outcome, [this.reason]);

  const AssistantClientActionResult.applied()
    : this._(AssistantClientActionOutcome.applied);

  const AssistantClientActionResult.unsupported()
    : this._(AssistantClientActionOutcome.unsupported, 'unsupported');

  const AssistantClientActionResult.rejected(String reason)
    : this._(AssistantClientActionOutcome.rejected, reason);

  final AssistantClientActionOutcome outcome;
  final String? reason;

  bool get applied => outcome == AssistantClientActionOutcome.applied;
}

/// Applies Mira UI tool markers (theme, app switching) outside the Assistant
/// page. The server only offers a UI tool when the request declares its
/// capability, so [capabilities] must list exactly what [apply] performs.
abstract interface class AssistantClientActionBridge {
  Set<String> get capabilities;

  /// [isCurrent] is the caller's turn or scope guard. The bridge stops before
  /// any effect, and cancels in-flight writes, once it returns false.
  Future<AssistantClientActionResult> apply(
    String toolName,
    Map<String, dynamic> output, {
    bool Function()? isCurrent,
  });
}

/// App-level registration so chat and Live reach the bridge without the
/// Assistant page owning navigation or theme state.
abstract final class AssistantClientActions {
  static AssistantClientActionBridge? _current;

  static AssistantClientActionBridge? get current => _current;

  /// Returns a callback that unregisters only this bridge.
  static void Function() register(AssistantClientActionBridge bridge) {
    _current = bridge;
    return () {
      if (identical(_current, bridge)) _current = null;
    };
  }

  /// Capabilities declared on Mira chat sends. Theme and immersive mode are
  /// applied by the chat cubit itself; the rest come from the bridge.
  static List<String> chatCapabilities() => {
    'theme',
    'immersive',
    ...?_current?.capabilities,
  }.toList(growable: false);

  /// Capabilities declared on canonical Live tool executions. Live applies
  /// markers only through the bridge.
  static List<String> liveCapabilities() =>
      (_current?.capabilities ?? const <String>{}).toList(growable: false);
}
