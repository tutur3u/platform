import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/data/sources/api_rate_limit_diagnostics.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';

void main() {
  test('copy envelope excludes private error content', () {
    final diagnostics = SafeErrorDiagnostics.capture(
      const ApiException(
        message: 'synthetic-private-body',
        statusCode: 429,
        retryAfter: 60,
        code: 'synthetic-private-code',
        rateLimitDiagnostics: ApiRateLimitDiagnostics(
          reason: 'private',
          policy: 'private',
          callerClass: 'private',
          window: 'private',
        ),
      ),
      DiagnosticStage.timezoneRead,
    );
    expect(
      diagnostics.summary,
      'diagnostics=v1; stage=timezoneRead; kind=http; status=429; '
      'retryAfter=60; reason=unknown; policy=unknown; caller=unknown; '
      'window=unknown',
    );
    expect(diagnostics.summary, isNot(contains('private')));
  });
  test('generic exception text never enters copy envelope', () {
    for (final error in <Object>[
      TimeoutException('private'),
      const FormatException('private'),
      StateError('private'),
      Exception('private'),
    ]) {
      expect(
        SafeErrorDiagnostics.capture(
          error,
          DiagnosticStage.assistantReply,
        ).summary,
        isNot(contains('private')),
      );
    }
  });
  test('internal address matching rejects lookalikes and external domains', () {
    expect(canCopyInternalDiagnostics(' Agent@Tuturuuu.com '), isTrue);
    for (final email in [
      null,
      'agent@gmail.com',
      'agent@tuturuuu.com.evil',
      'agent@sub.tuturuuu.com',
      'agent+tuturuuu.com@evil.test',
    ]) {
      expect(canCopyInternalDiagnostics(email), isFalse);
    }
  });
  test('new or cleared assistant failures cannot retain old diagnostics', () {
    const old = SafeErrorDiagnostics.streamFailure();
    const state = AssistantChatState(
      fallbackChatId: 'synthetic',
      error: 'old',
      diagnostics: old,
    );
    expect(state.copyWith(clearError: true).diagnostics, isNull);
    expect(state.copyWith(error: 'different').diagnostics, isNull);
    expect(state.copyWith().diagnostics, same(old));
  });
}
