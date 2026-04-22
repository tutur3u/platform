import 'package:equatable/equatable.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

enum AssistantLiveUiKind {
  available,
  unavailable,
  preparing,
  connecting,
  live,
  reconnecting,
  permissionDenied,
  error,
}

enum AssistantLiveUiTone { neutral, positive, warning, error }

class AssistantLiveUiState extends Equatable {
  const AssistantLiveUiState({
    required this.kind,
    required this.tone,
    required this.workspaceTier,
    required this.activeTier,
    required this.creditSource,
    required this.isEligible,
    required this.isVisibleLiveSession,
    this.error,
    this.showBlockedReason = false,
  });

  final AssistantLiveUiKind kind;
  final AssistantLiveUiTone tone;
  final String workspaceTier;
  final String activeTier;
  final AssistantCreditSource creditSource;
  final bool isEligible;
  final bool isVisibleLiveSession;
  final String? error;
  final bool showBlockedReason;

  bool get showExpandedStageCard => switch (kind) {
    AssistantLiveUiKind.available || AssistantLiveUiKind.unavailable => false,
    _ => isVisibleLiveSession,
  };

  String statusLabel(AppLocalizations l10n) {
    return switch (kind) {
      AssistantLiveUiKind.available => l10n.assistantLiveStatusAvailable,
      AssistantLiveUiKind.unavailable => l10n.assistantLiveStatusUnavailable,
      AssistantLiveUiKind.preparing => l10n.assistantLiveStatusPreparing,
      AssistantLiveUiKind.connecting => l10n.assistantLiveStatusConnecting,
      AssistantLiveUiKind.live => l10n.assistantLiveStatusReady,
      AssistantLiveUiKind.reconnecting => l10n.assistantLiveStatusReconnecting,
      AssistantLiveUiKind.permissionDenied => l10n.assistantLiveStatusError,
      AssistantLiveUiKind.error => l10n.assistantLiveStatusError,
    };
  }

  String detailLabel(AppLocalizations l10n, AssistantLiveState liveState) {
    if ((kind == AssistantLiveUiKind.error ||
            kind == AssistantLiveUiKind.reconnecting) &&
        error?.isNotEmpty == true) {
      return error!;
    }
    if (kind == AssistantLiveUiKind.permissionDenied) {
      return l10n.assistantLivePermissionDenied;
    }
    if (kind == AssistantLiveUiKind.preparing) {
      return l10n.assistantLiveDescriptionPreparing;
    }
    if (kind == AssistantLiveUiKind.connecting) {
      return l10n.assistantLiveDescriptionConnecting;
    }
    if (kind == AssistantLiveUiKind.live) {
      return liveState.isMicrophoneActive
          ? l10n.assistantLiveDescriptionListening
          : l10n.assistantLiveDescriptionReady;
    }
    if (kind == AssistantLiveUiKind.reconnecting) {
      return l10n.assistantLiveDescriptionReconnecting;
    }

    final summary = l10n.assistantLiveAccessSummary(
      l10n.assistantLiveWorkspaceTierLabel(workspaceTier.toUpperCase()),
      creditSource == AssistantCreditSource.personal
          ? l10n.assistantLiveAccessUsingPersonal(activeTier.toUpperCase())
          : l10n.assistantLiveAccessUsingWorkspace(activeTier.toUpperCase()),
    );

    // Tier gate: explain requirement once here; plan rows in the sheet carry
    // workspace/source details (avoid duplicating the access summary string).
    if (kind == AssistantLiveUiKind.unavailable && showBlockedReason) {
      return l10n.assistantLiveTierRequired;
    }

    return summary;
  }

  @override
  List<Object?> get props => [
    kind,
    tone,
    workspaceTier,
    activeTier,
    creditSource,
    isEligible,
    isVisibleLiveSession,
    error,
    showBlockedReason,
  ];
}

AssistantLiveUiState deriveAssistantLiveUiState({
  required AssistantShellState shellState,
  required AssistantLiveState liveState,
  required bool isEligible,
  required bool isVisibleLiveSession,
  required bool showBlockedReason,
}) {
  final workspaceTier = shellState.workspaceCredits.tier;
  final activeTier = shellState.activeCredits.tier;

  if (liveState.microphonePermission == AssistantLivePermissionState.denied ||
      liveState.cameraPermission == AssistantLivePermissionState.denied) {
    return AssistantLiveUiState(
      kind: AssistantLiveUiKind.permissionDenied,
      tone: AssistantLiveUiTone.warning,
      workspaceTier: workspaceTier,
      activeTier: activeTier,
      creditSource: shellState.creditSource,
      isEligible: isEligible,
      isVisibleLiveSession: isVisibleLiveSession,
    );
  }

  if (liveState.status == AssistantLiveConnectionStatus.error) {
    return AssistantLiveUiState(
      kind: AssistantLiveUiKind.error,
      tone: AssistantLiveUiTone.error,
      workspaceTier: workspaceTier,
      activeTier: activeTier,
      creditSource: shellState.creditSource,
      isEligible: isEligible,
      isVisibleLiveSession: isVisibleLiveSession,
      error: liveState.error,
    );
  }

  final kind = switch (liveState.status) {
    AssistantLiveConnectionStatus.preparing => AssistantLiveUiKind.preparing,
    AssistantLiveConnectionStatus.connecting => AssistantLiveUiKind.connecting,
    AssistantLiveConnectionStatus.connected => AssistantLiveUiKind.live,
    AssistantLiveConnectionStatus.reconnecting =>
      AssistantLiveUiKind.reconnecting,
    AssistantLiveConnectionStatus.error => AssistantLiveUiKind.error,
    AssistantLiveConnectionStatus.disconnected =>
      isEligible
          ? AssistantLiveUiKind.available
          : AssistantLiveUiKind.unavailable,
  };

  final tone = switch (kind) {
    AssistantLiveUiKind.available ||
    AssistantLiveUiKind.live => AssistantLiveUiTone.positive,
    AssistantLiveUiKind.unavailable => AssistantLiveUiTone.neutral,
    AssistantLiveUiKind.preparing ||
    AssistantLiveUiKind.connecting ||
    AssistantLiveUiKind.reconnecting ||
    AssistantLiveUiKind.permissionDenied => AssistantLiveUiTone.warning,
    AssistantLiveUiKind.error => AssistantLiveUiTone.error,
  };

  return AssistantLiveUiState(
    kind: kind,
    tone: tone,
    workspaceTier: workspaceTier,
    activeTier: activeTier,
    creditSource: shellState.creditSource,
    isEligible: isEligible,
    isVisibleLiveSession: isVisibleLiveSession,
    error: liveState.error,
    showBlockedReason: showBlockedReason,
  );
}
