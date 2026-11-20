import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/models/assistant_live_failure.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';

ApiException _api(int status, [String? code]) =>
    ApiException(message: 'server detail', statusCode: status, code: code);

void main() {
  group('classifyAssistantLiveFailure', () {
    test('maps the token route admission codes', () {
      expect(
        classifyAssistantLiveFailure(_api(503, 'LIVE_MINT_DISABLED')),
        AssistantLiveFailure.paused,
      );
      expect(
        classifyAssistantLiveFailure(_api(503, 'LIVE_MINT_STORE_UNAVAILABLE')),
        AssistantLiveFailure.paused,
      );
      expect(
        classifyAssistantLiveFailure(
          _api(429, 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED'),
        ),
        AssistantLiveFailure.dailyLimit,
      );
      expect(
        classifyAssistantLiveFailure(_api(429, 'LIVE_MINT_ACTOR_LIMIT')),
        AssistantLiveFailure.dailyLimit,
      );
      expect(
        classifyAssistantLiveFailure(_api(429, 'LIVE_MINT_CONCURRENCY_LIMIT')),
        AssistantLiveFailure.busy,
      );
      expect(
        classifyAssistantLiveFailure(_api(402, 'INSUFFICIENT_CREDITS')),
        AssistantLiveFailure.credits,
      );
      expect(
        classifyAssistantLiveFailure(_api(403)),
        AssistantLiveFailure.notAllowed,
      );
      expect(
        classifyAssistantLiveFailure(_api(401)),
        AssistantLiveFailure.signedOut,
      );
      expect(
        classifyAssistantLiveFailure(_api(502)),
        AssistantLiveFailure.server,
      );
    });

    test('maps transport, timeout and unknown failures', () {
      expect(
        classifyAssistantLiveFailure(
          const ApiException.transport(message: 'socket'),
        ),
        AssistantLiveFailure.offline,
      );
      expect(
        classifyAssistantLiveFailure(TimeoutException('slow')),
        AssistantLiveFailure.timeout,
      );
      expect(
        classifyAssistantLiveFailure(const FormatException('bad')),
        AssistantLiveFailure.unknown,
      );
    });

    test('only transient failures offer a plain retry', () {
      expect(
        AssistantLiveFailure.isRetryable(AssistantLiveFailure.offline),
        isTrue,
      );
      expect(
        AssistantLiveFailure.isRetryable(AssistantLiveFailure.paused),
        isFalse,
      );
      expect(
        AssistantLiveFailure.needsSettings(
          AssistantLiveFailure.microphonePermission,
        ),
        isTrue,
      );
    });
  });

  for (final l10n in [AppLocalizationsEn(), AppLocalizationsVi()]) {
    test('every failure token has its own ${l10n.localeName} label', () {
      const tokens = [
        AssistantLiveFailure.paused,
        AssistantLiveFailure.dailyLimit,
        AssistantLiveFailure.busy,
        AssistantLiveFailure.credits,
        AssistantLiveFailure.notAllowed,
        AssistantLiveFailure.signedOut,
        AssistantLiveFailure.offline,
        AssistantLiveFailure.timeout,
        AssistantLiveFailure.server,
        AssistantLiveFailure.dropped,
        AssistantLiveFailure.microphonePermission,
        AssistantLiveFailure.cameraPermission,
        AssistantLiveFailure.noWorkspace,
        AssistantLiveFailure.unknown,
      ];
      final labels = {
        for (final token in tokens) assistantLiveErrorLabel(l10n, token),
      };
      expect(labels, hasLength(tokens.length));
      expect(labels, isNot(contains(l10n.assistantLiveDescriptionError)));
    });
  }
}
