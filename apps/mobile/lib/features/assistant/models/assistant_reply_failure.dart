import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

/// Why a Mira chat reply failed, derived only from safe diagnostics.
enum AssistantReplyFailure {
  offline,
  timeout,
  signedOut,
  access,
  busy,
  interrupted,
  server,
  reload,
  unknown,
}

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
  final status = diagnostics.status ?? 0;
  return switch (diagnostics.kind) {
    'transport' => AssistantReplyFailure.offline,
    'timeout' => AssistantReplyFailure.timeout,
    'stream' => AssistantReplyFailure.interrupted,
    _ when status == 401 => AssistantReplyFailure.signedOut,
    _ when status == 402 || status == 403 => AssistantReplyFailure.access,
    _ when status == 408 || status == 504 => AssistantReplyFailure.timeout,
    _ when status == 429 => AssistantReplyFailure.busy,
    _ when status >= 500 => AssistantReplyFailure.server,
    _ => AssistantReplyFailure.unknown,
  };
}

/// Whether retrying the same request can succeed without other action.
bool assistantReplyFailureRetryable(AssistantReplyFailure failure) =>
    failure != AssistantReplyFailure.reload &&
    failure != AssistantReplyFailure.signedOut;

String assistantReplyFailureLabel(
  AppLocalizations l10n,
  AssistantReplyFailure failure,
) => switch (failure) {
  AssistantReplyFailure.offline => l10n.assistantReplyFailedOffline,
  AssistantReplyFailure.timeout => l10n.assistantReplyFailedTimeout,
  AssistantReplyFailure.signedOut => l10n.assistantReplyFailedSignedOut,
  AssistantReplyFailure.access => l10n.assistantReplyFailedAccess,
  AssistantReplyFailure.busy => l10n.assistantReplyFailedBusy,
  AssistantReplyFailure.interrupted => l10n.assistantReplyFailedInterrupted,
  AssistantReplyFailure.server => l10n.assistantReplyFailedServer,
  AssistantReplyFailure.reload => l10n.assistantReplyFailedReload,
  AssistantReplyFailure.unknown => l10n.assistantReplyFailed,
};
