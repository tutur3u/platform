/// Nonprivate, fixed vocabulary from the API guard response headers.
/// Unknown server values are excluded rather than logged verbatim.
class ApiRateLimitDiagnostics {
  const ApiRateLimitDiagnostics({
    required this.reason,
    required this.policy,
    required this.callerClass,
    required this.window,
  });

  factory ApiRateLimitDiagnostics.fromHeaders(Map<String, String> headers) {
    String read(String name, Set<String> allowed) {
      final value = headers[name];
      return allowed.contains(value) ? value! : 'unknown';
    }

    return ApiRateLimitDiagnostics(
      reason: read('x-proxy-block-reason', {
        'route-rate-limit',
        'ip-already-blocked',
        'backend-auth-rate-limit',
      }),
      policy: read('x-ratelimit-policy', {
        'default',
        'workspace-dashboard-read',
        'users-me',
        'offline-capable-read',
      }),
      callerClass: read('x-ratelimit-caller-class', {
        'anonymous',
        'authenticated',
      }),
      window: read('x-ratelimit-window', {'minute', 'hour', 'day'}),
    );
  }

  final String reason;
  final String policy;
  final String callerClass;
  final String window;

  /// No request URL, actor, IP, credentials, body or arbitrary header values.
  String get safeSummary =>
      'reason=$reason; policy=$policy; caller=$callerClass; window=$window';
}
