import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/data/sources/api_rate_limit_diagnostics.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/settings/view/timezone_rate_limit_message.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

void main() {
  for (final l10n in [AppLocalizationsEn(), AppLocalizationsVi()]) {
    test('${l10n.localeName} preserves known limiter and server delay', () {
      final diagnostics = SafeErrorDiagnostics.capture(
        ApiException(
          message: 'private upstream message',
          statusCode: 429,
          retryAfter: 45,
          rateLimitDiagnostics: ApiRateLimitDiagnostics.fromHeaders({
            'x-proxy-block-reason': 'backend-auth-rate-limit',
            'x-ratelimit-policy': 'private policy',
            'x-ratelimit-caller-class': 'authenticated',
          }),
        ),
        DiagnosticStage.timezoneWrite,
      );
      final message = timezoneRateLimitMessage(l10n, diagnostics);
      expect(message, contains(l10n.settingsTimezoneRateLimited));
      expect(message, contains(l10n.settingsTimezoneRateLimitedRetryAfter(45)));
      expect(message, contains('reason=backend-auth-rate-limit'));
      expect(message, contains('caller=authenticated'));
      expect(message, isNot(contains('unknown')));
      expect(message, isNot(contains('private')));
      final ready = timezoneRateLimitMessage(
        l10n,
        diagnostics,
        coolingDown: false,
      );
      expect(ready, contains(l10n.settingsTimezoneRetry));
      expect(ready, contains('reason=backend-auth-rate-limit'));
      expect(
        ready,
        isNot(contains(l10n.settingsTimezoneRateLimitedRetryAfter(45))),
      );
    });

    test('${l10n.localeName} does not invent a delay or limiter', () {
      final diagnostics = SafeErrorDiagnostics.capture(
        ApiException(
          message: 'private',
          statusCode: 429,
          rateLimitDiagnostics: ApiRateLimitDiagnostics.fromHeaders({
            'x-proxy-block-reason': 'private',
          }),
        ),
        DiagnosticStage.timezoneWrite,
      );
      final message = timezoneRateLimitMessage(l10n, diagnostics);
      expect(message, contains(l10n.settingsTimezoneRateLimited));
      expect(message, contains('metadata=present'));
      expect(message, isNot(contains('private')));
      expect(message, isNot(contains('unknown')));
      expect(
        message,
        isNot(contains(l10n.settingsTimezoneRateLimitedUpstream)),
      );
      expect(message, isNot(contains('seconds')));
      expect(message, isNot(contains('giây')));
    });

    test('${l10n.localeName} explains unidentified upstream or edge 429', () {
      final diagnostics = SafeErrorDiagnostics.capture(
        ApiException(
          message: 'private',
          statusCode: 429,
          rateLimitDiagnostics: ApiRateLimitDiagnostics.fromHeaders({
            'x-vercel-id': 'private-id',
            'x-vercel-mitigated': 'challenge',
          }),
        ),
        DiagnosticStage.timezoneRead,
      );
      final message = timezoneRateLimitMessage(l10n, diagnostics);
      expect(
        message,
        isNot(contains(l10n.settingsTimezoneRateLimitedUpstream)),
      );
      expect(message, contains(l10n.settingsTimezoneRateLimitedChallenge));
      expect(message, contains('challenge=vercel'));
      expect(message, contains('reason=upstream-or-edge'));
      expect(message, contains('metadata=absent'));
      expect(message, contains('vercel=present'));
      expect(message, contains('cloudflare=absent'));
      expect(message, isNot(contains('private')));
    });

    test(
      '${l10n.localeName} explains bare 429 without inventing a challenge',
      () {
        final diagnostics = SafeErrorDiagnostics.capture(
          ApiException(
            message: 'private',
            statusCode: 429,
            rateLimitDiagnostics: ApiRateLimitDiagnostics.fromHeaders({}),
          ),
          DiagnosticStage.timezoneRead,
        );
        final message = timezoneRateLimitMessage(l10n, diagnostics);
        expect(message, contains(l10n.settingsTimezoneRateLimitedUpstream));
        expect(
          message,
          isNot(contains(l10n.settingsTimezoneRateLimitedChallenge)),
        );
        expect(message, contains('reason=upstream-or-edge'));
        expect(message, isNot(contains('private')));
      },
    );
  }
}
