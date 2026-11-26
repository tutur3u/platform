import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/assistant/models/assistant_reply_failure.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

AssistantReplyFailure _classify(Object error) => classifyAssistantReplyFailure(
  diagnostics: SafeErrorDiagnostics.capture(
    error,
    DiagnosticStage.assistantReply,
  ),
);

void main() {
  test('classifies reply failures from safe diagnostics', () {
    expect(
      _classify(const ApiException.transport(message: 'down')),
      AssistantReplyFailure.offline,
    );
    expect(_classify(TimeoutException('slow')), AssistantReplyFailure.timeout);
    expect(
      _classify(const ApiException(message: 'x', statusCode: 401)),
      AssistantReplyFailure.signedOut,
    );
    expect(
      _classify(
        const ApiException(
          message: 'x',
          statusCode: 403,
          code: 'MODEL_NOT_ALLOWED',
        ),
      ),
      AssistantReplyFailure.plan,
    );
    expect(
      _classify(
        const ApiException(
          message: 'x',
          statusCode: 403,
          code: 'CREDITS_EXHAUSTED',
        ),
      ),
      AssistantReplyFailure.credits,
    );
    expect(
      _classify(
        const ApiException(
          message: 'x',
          statusCode: 403,
          code: 'DAILY_LIMIT_REACHED',
        ),
      ),
      AssistantReplyFailure.dailyLimit,
    );
    expect(
      _classify(const ApiException(message: 'x', statusCode: 403)),
      AssistantReplyFailure.access,
    );
    expect(
      classifyAssistantReplyFailure(
        diagnostics: SafeErrorDiagnostics.streamError(
          status: 403,
          code: 'CREDITS_EXHAUSTED',
        ),
      ),
      AssistantReplyFailure.credits,
    );
    expect(
      _classify(const ApiException(message: 'x', statusCode: 429)),
      AssistantReplyFailure.busy,
    );
    expect(
      _classify(const ApiException(message: 'x', statusCode: 500)),
      AssistantReplyFailure.server,
    );
    expect(
      classifyAssistantReplyFailure(
        diagnostics: const SafeErrorDiagnostics.streamFailure(),
      ),
      AssistantReplyFailure.interrupted,
    );
    expect(
      classifyAssistantReplyFailure(
        error: 'Assistant creation outcome requires review.',
      ),
      AssistantReplyFailure.reload,
    );
    expect(classifyAssistantReplyFailure(), AssistantReplyFailure.unknown);
  });

  test('reload and sign-in failures hide the plain retry', () {
    expect(
      assistantReplyFailureRetryable(AssistantReplyFailure.reload),
      isFalse,
    );
    expect(
      assistantReplyFailureRetryable(AssistantReplyFailure.signedOut),
      isFalse,
    );
    expect(
      assistantReplyFailureRetryable(AssistantReplyFailure.interrupted),
      isTrue,
    );
  });

  test('sanitizes non-allowlisted diagnostic codes', () {
    expect(
      sanitizeSafeDiagnosticCode('CREDITS_EXHAUSTED'),
      'CREDITS_EXHAUSTED',
    );
    expect(sanitizeSafeDiagnosticCode('SECRET_X'), isNull);
    expect(sanitizeSafeDiagnosticCode(null), isNull);
    final diagnostics = SafeErrorDiagnostics.streamError(
      status: 403,
      code: 'SECRET_X',
    );
    expect(diagnostics.code, isNull);
    expect(diagnostics.summary, isNot(contains('SECRET_X')));
    expect(
      classifyAssistantReplyFailure(diagnostics: diagnostics),
      AssistantReplyFailure.access,
    );
  });

  for (final l10n in [AppLocalizationsEn(), AppLocalizationsVi()]) {
    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      test('labels are distinct and never say "stopped" '
          '(${l10n.localeName}, ${platform.name})', () {
        final labels = {
          for (final failure in AssistantReplyFailure.values)
            assistantReplyFailureLabel(l10n, failure, platform: platform),
        };
        expect(labels, hasLength(AssistantReplyFailure.values.length));
        expect(labels.any((label) => label.contains('stopped')), isFalse);
        if (platform == TargetPlatform.iOS) {
          for (final failure in [
            AssistantReplyFailure.plan,
            AssistantReplyFailure.credits,
            AssistantReplyFailure.dailyLimit,
          ]) {
            final label = assistantReplyFailureLabel(
              l10n,
              failure,
              platform: platform,
            ).toLowerCase();
            expect(label, isNot(contains('upgrade')));
            expect(label, isNot(contains('top up')));
            expect(label, isNot(contains('nâng cấp')));
            expect(label, isNot(contains('nạp thêm')));
          }
        }
      });
    }
  }
}
