import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/supabase_access_token_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  group('isSessionGoneError', () {
    test('a missing session or a rejected refresh token is gone', () {
      expect(isSessionGoneError(AuthSessionMissingException()), isTrue);
      for (final status in ['400', '401', '403', '404', '422']) {
        expect(
          isSessionGoneError(
            AuthApiException(
              'Invalid Refresh Token',
              statusCode: status,
              code: 'refresh_token_not_found',
            ),
          ),
          isTrue,
          reason: status,
        );
      }
    });

    test('retryable and unknown failures are not proof of a lost session', () {
      expect(
        isSessionGoneError(AuthRetryableFetchException(statusCode: '503')),
        isFalse,
      );
      expect(
        isSessionGoneError(
          const AuthApiException('slow down', statusCode: '429'),
        ),
        isFalse,
      );
      expect(
        isSessionGoneError(const AuthApiException('boom', statusCode: '500')),
        isFalse,
      );
      expect(isSessionGoneError(const SocketException('offline')), isFalse);
      expect(isSessionGoneError(TimeoutException(null)), isFalse);
      expect(isSessionGoneError(StateError('not initialised')), isFalse);
    });
  });
}
