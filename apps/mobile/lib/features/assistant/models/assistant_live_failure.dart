import 'dart:async';

import 'package:mobile/data/sources/api_exception.dart';

/// Stable failure tokens stored in `AssistantLiveState.error`.
///
/// Raw server or exception text never reaches the call surface; every Live
/// failure resolves to one of these tokens and a localized explanation.
abstract final class AssistantLiveFailure {
  static const paused = 'live_paused';
  static const dailyLimit = 'live_daily_limit';
  static const busy = 'live_busy';
  static const credits = 'live_credits';
  static const notAllowed = 'live_not_allowed';
  static const signedOut = 'live_signed_out';
  static const offline = 'live_offline';
  static const timeout = 'live_timeout';
  static const server = 'live_server';
  static const dropped = 'live_dropped';
  static const microphonePermission = 'live_microphone_permission';
  static const cameraPermission = 'live_camera_permission';
  static const noWorkspace = 'live_no_workspace';
  static const unknown = 'live_connect_failed';

  /// Failures that a plain retry cannot fix right now.
  static bool isRetryable(String? token) => switch (token) {
    paused ||
    dailyLimit ||
    credits ||
    notAllowed ||
    signedOut ||
    microphonePermission ||
    cameraPermission ||
    noWorkspace => false,
    _ => true,
  };

  /// Failures resolved in the system Settings app.
  static bool needsSettings(String? token) =>
      token == microphonePermission || token == cameraPermission;
}

/// Classifies a Live start failure from the token route, socket or timers.
String classifyAssistantLiveFailure(Object error) {
  if (error is TimeoutException) return AssistantLiveFailure.timeout;
  if (error is! ApiException) return AssistantLiveFailure.unknown;
  if (error.failureKind == ApiFailureKind.transport) {
    return AssistantLiveFailure.offline;
  }
  final code = error.code ?? '';
  if (code == 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED' ||
      code == 'LIVE_MINT_ACTOR_LIMIT') {
    return AssistantLiveFailure.dailyLimit;
  }
  if (code == 'LIVE_MINT_CONCURRENCY_LIMIT') return AssistantLiveFailure.busy;
  if (code == 'INSUFFICIENT_CREDITS' || code == 'CREDITS_EXHAUSTED') {
    return AssistantLiveFailure.credits;
  }
  if (code.startsWith('LIVE_MINT_')) return AssistantLiveFailure.paused;
  return switch (error.statusCode) {
    401 => AssistantLiveFailure.signedOut,
    402 => AssistantLiveFailure.credits,
    403 => AssistantLiveFailure.notAllowed,
    408 || 504 => AssistantLiveFailure.timeout,
    429 => AssistantLiveFailure.busy,
    503 => AssistantLiveFailure.paused,
    >= 500 => AssistantLiveFailure.server,
    _ => AssistantLiveFailure.unknown,
  };
}
