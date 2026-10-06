/// A remote action must not outlive its captured account/workspace/mode scope.
/// Callers choose a transient interaction version or durable operation version;
/// every asynchronous phase rechecks the same captured lease.
class AssistantRemoteScopeGuard {
  AssistantRemoteScopeGuard({
    required Object? Function() scope,
    required int Function() version,
    required bool Function() remote,
  }) : _scope = scope,
       _version = version,
       _remote = remote,
       _capturedScope = scope(),
       _capturedVersion = version();
  final Object? Function() _scope;
  final int Function() _version;
  final bool Function() _remote;
  final Object? _capturedScope;
  final int _capturedVersion;
  bool get current =>
      _capturedScope != null &&
      _scope() == _capturedScope &&
      _version() == _capturedVersion &&
      _remote();

  Future<bool> run(Future<void> Function() phase) async {
    if (!current) return false;
    await phase();
    return current;
  }
}
