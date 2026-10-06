import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/data/sources/api_rate_limit_diagnostics.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';

void main() {
  for (final reason in ['ip-already-blocked', 'backend-auth-rate-limit']) {
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
