import 'dart:async';

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
      _classify(const ApiException(message: 'x', statusCode: 403)),
      AssistantReplyFailure.access,
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

  for (final l10n in [AppLocalizationsEn(), AppLocalizationsVi()]) {
    test(
      'labels are distinct and never say "stopped" (${l10n.localeName})',
      () {
        final labels = {
          for (final failure in AssistantReplyFailure.values)
            assistantReplyFailureLabel(l10n, failure),
        };
        expect(labels, hasLength(AssistantReplyFailure.values.length));
        expect(labels.any((label) => label.contains('stopped')), isFalse);
      },
    );
  }
}
