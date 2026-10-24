import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/data/sources/api_rate_limit_diagnostics.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';

void main() {
  test('gateway upstream classification retains its exact policy', () {
    final diagnostics = ApiRateLimitDiagnostics.fromHeaders({
      'x-proxy-block-reason': 'upstream-or-edge',
      'x-ratelimit-policy': 'calendar-upstream',
    });
    expect(diagnostics.reason, 'upstream-or-edge');
    expect(diagnostics.policy, 'calendar-upstream');
    expect(diagnostics.hasStructuredMetadata, isTrue);
    expect(diagnostics.safeSummary, contains('reason=upstream-or-edge'));
  });
  for (final policy in [
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
  ]) {
    test('retains recognized calendar policy $policy without private IDs', () {
      final diagnostics = SafeErrorDiagnostics.capture(
        ApiException(
          message: 'private body',
          statusCode: 429,
          rateLimitDiagnostics: ApiRateLimitDiagnostics.fromHeaders({
            'x-ratelimit-policy': policy,
            'x-vercel-id': 'private-id',
            'cf-ray': 'private-ray',
          }),
        ),
        DiagnosticStage.timezoneRead,
      ).summary;
      expect(diagnostics, contains('policy=$policy'));
      expect(diagnostics, contains('reason=unknown'));
      expect(diagnostics, contains('metadata=present'));
      expect(diagnostics, contains('vercel=present; cloudflare=present'));
      expect(diagnostics, isNot(contains('private')));
    });
  }
  for (final reason in [
    'ip-already-blocked',
    'backend-auth-rate-limit',
    'rate-limit-exceeded',
  ]) {
    test(
      'local auth $reason survives safe timezone copy without invented data',
      () {
        final diagnostics = SafeErrorDiagnostics.capture(
          ApiException(
            message: 'synthetic-private-error',
            statusCode: 429,
            retryAfter: 60,
            rateLimitDiagnostics: ApiRateLimitDiagnostics.fromHeaders({
              'x-proxy-block-reason': reason,
            }),
          ),
          DiagnosticStage.timezoneRead,
        );
        expect(
          diagnostics.summary,
          contains(
            'reason=$reason; policy=unknown; caller=unknown; window=unknown',
          ),
        );
        expect(diagnostics.summary, isNot(contains('synthetic-private')));
      },
    );
  }
  test('arbitrary local provider and block details remain excluded', () {
    expect(
      ApiRateLimitDiagnostics.fromHeaders({
        'x-proxy-block-reason': 'synthetic-private-provider-error',
      }).reason,
      'unknown',
    );
  });
}
