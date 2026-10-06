/// Fences pending start ownership across cancellation and actor/workspace epochs.
class AssistantLiveStartGate {
  Object? _active;
  int? _scope;
  bool pendingFor(int scope) => _active != null && _scope == scope;
  Object? currentFor(int scope) => pendingFor(scope) ? _active : null;
  Object? begin(int scope) {
    if (pendingFor(scope)) return null;
    _scope = scope;
    return _active = Object();
  }

  void finish(Object attempt) {
    if (identical(_active, attempt)) _active = null;
  }

  void cancel(Object? attempt) {
    if (identical(_active, attempt)) _active = null;
  }
}
