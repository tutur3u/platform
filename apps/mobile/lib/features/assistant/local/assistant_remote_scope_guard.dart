/// A remote drawer or picker must not outlive its captured local-mode scope.
/// Every asynchronous drawer phase rechecks the same account/workspace epoch
/// and mode version before exposing or operating on a remote conversation.
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
