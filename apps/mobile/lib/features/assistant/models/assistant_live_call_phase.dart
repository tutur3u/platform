import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

/// The phone-call phase shown on the Live call surface.
enum AssistantLiveCallPhase {
  connecting,
  connected,
  reconnecting,
  ended,
  failed,
}

/// Maps connection state to the call surface phase. A first attempt reads as
/// "Connecting"; a dropped call that is retrying reads as "Reconnecting".
///
/// The surface opens before its session starts, so while [awaitingStart] an
/// idle or previously failed session still reads as "Connecting". After that,
/// any disconnect ends the call, whether the user hung up or the page stopped
/// the session (for example on backgrounding): nothing reconnects it.
AssistantLiveCallPhase assistantLiveCallPhase(
  AssistantLiveState state, {
  bool awaitingStart = false,
}) => switch (state.status) {
  AssistantLiveConnectionStatus.disconnected ||
  AssistantLiveConnectionStatus.error when awaitingStart =>
    AssistantLiveCallPhase.connecting,
  AssistantLiveConnectionStatus.connected => AssistantLiveCallPhase.connected,
  AssistantLiveConnectionStatus.reconnecting =>
    AssistantLiveCallPhase.reconnecting,
  AssistantLiveConnectionStatus.preparing ||
  AssistantLiveConnectionStatus.connecting => AssistantLiveCallPhase.connecting,
  AssistantLiveConnectionStatus.error => AssistantLiveCallPhase.failed,
  AssistantLiveConnectionStatus.disconnected => AssistantLiveCallPhase.ended,
};

/// Whether [status] belongs to a session that has started (or is starting).
bool assistantLiveCallStarted(AssistantLiveConnectionStatus status) =>
    status != AssistantLiveConnectionStatus.disconnected &&
    status != AssistantLiveConnectionStatus.error;

/// Advances the call clock between two states. A fresh attempt
/// (`preparing`) clears it, the first `connected` starts it, reconnects and
/// transient errors keep it, and `disconnected` records the final duration.
AssistantLiveState applyAssistantLiveCallClock(
  AssistantLiveState previous,
  AssistantLiveState next,
  DateTime now,
) {
  if (next.status == AssistantLiveConnectionStatus.preparing &&
      previous.status != AssistantLiveConnectionStatus.preparing) {
    return next.copyWith(callStartedAt: null, lastCallDuration: null);
  }
  if (next.status == AssistantLiveConnectionStatus.connected &&
      next.callStartedAt == null) {
    return next.copyWith(callStartedAt: now, lastCallDuration: null);
  }
  final startedAt = next.callStartedAt;
  if (next.status == AssistantLiveConnectionStatus.disconnected &&
      startedAt != null) {
    return next.copyWith(
      callStartedAt: null,
      lastCallDuration: now.difference(startedAt),
    );
  }
  return next;
}

extension AssistantLiveCallPhaseLabel on AssistantLiveCallPhase {
  /// Status line text. Connected shows the elapsed timer instead of a label.
  String label(AppLocalizations l10n) => switch (this) {
    AssistantLiveCallPhase.connecting => l10n.assistantLiveCallConnecting,
    AssistantLiveCallPhase.connected => l10n.assistantLiveCallConnected,
    AssistantLiveCallPhase.reconnecting => l10n.assistantLiveCallReconnecting,
    AssistantLiveCallPhase.ended => l10n.assistantLiveCallEnded,
    AssistantLiveCallPhase.failed => l10n.assistantLiveCallFailed,
  };

  bool get isActive =>
      this == AssistantLiveCallPhase.connecting ||
      this == AssistantLiveCallPhase.connected ||
      this == AssistantLiveCallPhase.reconnecting;
}
