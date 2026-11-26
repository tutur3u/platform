import 'package:flutter/foundation.dart';
import 'package:mobile/core/platform/apple_store_policy.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

/// Why a Mira chat reply failed, derived only from safe diagnostics.
enum AssistantReplyFailure {
  offline,
  timeout,
  signedOut,
  plan,
  credits,
  dailyLimit,
  access,
  busy,
  interrupted,
  server,
  reload,
  unknown,
}

const Set<String> _planCodes = {
  'FEATURE_NOT_ALLOWED',
  'MODEL_DISABLED',
  'MODEL_NOT_ALLOWED',
  'NO_ALLOCATION',
  'PLAN_REQUIRED',
};

const Set<String> _creditCodes = {
  'CREDITS_EXHAUSTED',
  'INSUFFICIENT_CREDITS',
  'NO_BALANCE',
};

const Set<String> _dailyLimitCodes = {'DAILY_LIMIT_REACHED'};

const Set<String> _accessCodes = {
  'ACCESS_DENIED',
  'CHATGPT_CONNECTION_REQUIRED',
  'INVALID_CREDIT_SOURCE',
  'PERSONAL_WORKSPACE_NOT_FOUND',
  'WORKSPACE_ACCESS_DENIED',
};

/// Error strings the chat cubit uses when a retry needs fresh history.
const Set<String> _reloadErrors = {
  'Assistant creation outcome requires review.',
  _identityUnavailable,
};
const _identityUnavailable =
    'Original assistant request identity is unavailable. Reload history before '
    'retrying.';

AssistantReplyFailure classifyAssistantReplyFailure({
  String? error,
  SafeErrorDiagnostics? diagnostics,
}) {
  if (_reloadErrors.contains(error)) return AssistantReplyFailure.reload;
  if (diagnostics == null) return AssistantReplyFailure.unknown;
  final code = diagnostics.code;
  if (code != null) {
    if (_planCodes.contains(code)) return AssistantReplyFailure.plan;
    if (_creditCodes.contains(code)) return AssistantReplyFailure.credits;
    if (_dailyLimitCodes.contains(code)) {
      return AssistantReplyFailure.dailyLimit;
    }
    if (_accessCodes.contains(code)) return AssistantReplyFailure.access;
  }
  final status = diagnostics.status ?? 0;
  if (status == 402) return AssistantReplyFailure.credits;
  if (status == 403) return AssistantReplyFailure.access;
  return switch (diagnostics.kind) {
    'transport' => AssistantReplyFailure.offline,
    'timeout' => AssistantReplyFailure.timeout,
    'stream' => AssistantReplyFailure.interrupted,
    _ when status == 401 => AssistantReplyFailure.signedOut,
    _ when status == 408 || status == 504 => AssistantReplyFailure.timeout,
    _ when status == 429 => AssistantReplyFailure.busy,
    _ when status >= 500 => AssistantReplyFailure.server,
    _ => AssistantReplyFailure.unknown,
  };
}

bool assistantReplyFailureIsDenial(AssistantReplyFailure failure) =>
    switch (failure) {
      AssistantReplyFailure.plan ||
      AssistantReplyFailure.credits ||
      AssistantReplyFailure.dailyLimit ||
      AssistantReplyFailure.access => true,
      _ => false,
    };

bool assistantReplyFailureHasBillingAction(AssistantReplyFailure failure) =>
    switch (failure) {
      AssistantReplyFailure.plan ||
      AssistantReplyFailure.credits ||
      AssistantReplyFailure.dailyLimit => true,
      _ => false,
    };

/// Whether retrying the same request can succeed without other action.
bool assistantReplyFailureRetryable(AssistantReplyFailure failure) =>
    failure != AssistantReplyFailure.reload &&
    failure != AssistantReplyFailure.signedOut;

String assistantReplyFailureLabel(
  AppLocalizations l10n,
  AssistantReplyFailure failure, {
  TargetPlatform? platform,
}) {
  final apple = isAppleStorePlatform(platform);
  return switch (failure) {
    AssistantReplyFailure.offline => l10n.assistantReplyFailedOffline,
    AssistantReplyFailure.timeout => l10n.assistantReplyFailedTimeout,
    AssistantReplyFailure.signedOut => l10n.assistantReplyFailedSignedOut,
    AssistantReplyFailure.plan =>
      apple
          ? l10n.assistantReplyFailedPlanApple
          : l10n.assistantReplyFailedPlan,
    AssistantReplyFailure.credits =>
      apple
          ? l10n.assistantReplyFailedCreditsApple
          : l10n.assistantReplyFailedCredits,
    AssistantReplyFailure.dailyLimit =>
      apple
          ? l10n.assistantReplyFailedDailyLimitApple
          : l10n.assistantReplyFailedDailyLimit,
    AssistantReplyFailure.access => l10n.assistantReplyFailedAccess,
    AssistantReplyFailure.busy => l10n.assistantReplyFailedBusy,
    AssistantReplyFailure.interrupted => l10n.assistantReplyFailedInterrupted,
    AssistantReplyFailure.server => l10n.assistantReplyFailedServer,
    AssistantReplyFailure.reload => l10n.assistantReplyFailedReload,
    AssistantReplyFailure.unknown => l10n.assistantReplyFailed,
  };
}
