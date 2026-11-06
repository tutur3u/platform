import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/config/env_security.dart';

const _secure = {
  'NEXT_PUBLIC_SUPABASE_URL': 'https://project.supabase.co',
  'API_BASE_URL': 'https://tuturuuu.com',
};

void main() {
  group('assertSecureBackendUrls', () {
    test('accepts https backends in release', () {
      expect(
        () => assertSecureBackendUrls(releaseMode: true, requiredUrls: _secure),
        returnsNormally,
      );
    });

    test('rejects the cleartext localhost defaults in release', () {
      expect(
        () => assertSecureBackendUrls(
          releaseMode: true,
          requiredUrls: const {
            'NEXT_PUBLIC_SUPABASE_URL': 'http://localhost:54321',
            'API_BASE_URL': 'http://localhost:7803',
          },
        ),
        throwsA(
          isA<InsecureEnvException>().having((e) => e.problems, 'problems', [
            'NEXT_PUBLIC_SUPABASE_URL is not https',
            'API_BASE_URL is not https',
          ]),
        ),
      );
    });

    test('rejects missing and malformed required urls in release', () {
      for (final bad in ['', 'https://', 'ftp://host', 'localhost:7803']) {
        expect(
          () => assertSecureBackendUrls(
            releaseMode: true,
            requiredUrls: {..._secure, 'API_BASE_URL': bad},
          ),
          throwsA(isA<InsecureEnvException>()),
          reason: 'API_BASE_URL="$bad"',
        );
      }
    });

    test('rejects cleartext optional overrides but allows unset ones', () {
      expect(
        () => assertSecureBackendUrls(
          releaseMode: true,
          requiredUrls: _secure,
          optionalUrls: const {'TASKS_API_BASE_URL': ''},
        ),
        returnsNormally,
      );
      expect(
        () => assertSecureBackendUrls(
          releaseMode: true,
          requiredUrls: _secure,
          optionalUrls: const {'TASKS_API_BASE_URL': 'http://10.0.2.2:7809'},
        ),
        throwsA(
          isA<InsecureEnvException>().having(
            (e) => e.toString(),
            'message',
            contains('TASKS_API_BASE_URL is not https'),
          ),
        ),
      );
    });

    test('debug and profile keep cleartext localhost', () {
      expect(
        () => assertSecureBackendUrls(
          releaseMode: false,
          requiredUrls: const {
            'NEXT_PUBLIC_SUPABASE_URL': 'http://localhost:54321',
            'API_BASE_URL': 'http://localhost:7803',
          },
        ),
        returnsNormally,
      );
    });
  });

  group('Env.assertSecureForRelease', () {
    // Tests run in debug mode, so the build defaults are the localhost ones.
    test('is a no-op outside release', () {
      expect(Env.assertSecureForRelease, returnsNormally);
    });

    test('would reject an unconfigured build in release', () {
      expect(
        () => Env.assertSecureForRelease(releaseMode: true),
        throwsA(isA<InsecureEnvException>()),
      );
    });

    test('covers every service base-url define', () {
      expect(Env.releaseRequiredUrls.keys, [
        'NEXT_PUBLIC_SUPABASE_URL',
        'API_BASE_URL',
      ]);
      expect(Env.releaseOptionalUrls.keys, everyElement(endsWith('_BASE_URL')));
      expect(Env.releaseOptionalUrls, hasLength(9));
    });
  });
}
