/// Nonprivate, fixed vocabulary from the API guard response headers.
/// Unknown server values are excluded rather than logged verbatim.
class ApiRateLimitDiagnostics {
  const ApiRateLimitDiagnostics({
    required this.reason,
    required this.policy,
    required this.callerClass,
    required this.window,
    this.hasStructuredMetadata = true,
    this.hasVercelId = false,
    this.hasCfRay = false,
    this.hasVercelChallenge = false,
  });

  factory ApiRateLimitDiagnostics.fromHeaders(Map<String, String> headers) {
    final hasMetadata = const [
      'x-proxy-block-reason',
      'x-ratelimit-policy',
      'x-ratelimit-caller-class',
      'x-ratelimit-window',
    ].any(headers.containsKey);
    return ApiRateLimitDiagnostics(
      reason: hasMetadata
          ? _safe(headers['x-proxy-block-reason'], _reasons)
          : 'upstream-or-edge',
      policy: _safe(headers['x-ratelimit-policy'], _policies),
      callerClass: _safe(headers['x-ratelimit-caller-class'], _callers),
      window: _safe(headers['x-ratelimit-window'], _windows),
      hasStructuredMetadata: hasMetadata,
      hasVercelId: headers.containsKey('x-vercel-id'),
      hasCfRay: headers.containsKey('cf-ray'),
      hasVercelChallenge: headers['x-vercel-mitigated'] == 'challenge',
    );
  }

  static const _reasons = {
    'route-rate-limit',
    'rate-limit-exceeded',
    'ip-already-blocked',
    'backend-auth-rate-limit',
    'upstream-or-edge',
  };
  static const _policies = {
    'default',
    'workspace-dashboard-read',
    'users-me',
    'offline-capable-read',
    'native-calendar-preferences',
    'calendar-native-preferences',
    'calendar-auth-provider',
    'calendar-route-ip-block',
    'calendar-session-ip-mutate',
    'calendar-session-user-mutate',
    'calendar-session-ip-read',
    'calendar-session-user-read',
    'calendar-route-quota',
    'proxy-ip-block',
    'calendar-upstream',
  };
  static const _callers = {'anonymous', 'authenticated'};
  static const _windows = {'minute', 'hour', 'day'};
  static String _safe(String? value, Set<String> allowed) =>
      allowed.contains(value) ? value! : 'unknown';

  final String reason;
  final String policy;
  final String callerClass;
  final String window;
  final bool hasStructuredMetadata;
  final bool hasVercelId;
  final bool hasCfRay;
  final bool hasVercelChallenge;

  /// No request URL, actor, IP, credentials, body or arbitrary header values.
  String get safeSummary {
    final safeReason = hasStructuredMetadata
        ? _safe(reason, _reasons)
        : 'upstream-or-edge';
    return 'reason=$safeReason; '
        'policy=${_safe(policy, _policies)}; '
        'caller=${_safe(callerClass, _callers)}; '
        'window=${_safe(window, _windows)}; '
        'metadata=${hasStructuredMetadata ? 'present' : 'absent'}; '
        'vercel=${hasVercelId ? 'present' : 'absent'}; '
        'cloudflare=${hasCfRay ? 'present' : 'absent'}; '
        'challenge=${hasVercelChallenge ? 'vercel' : 'unknown'}';
  }
}
