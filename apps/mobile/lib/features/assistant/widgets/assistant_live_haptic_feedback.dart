import 'dart:async';

import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';

/// Presentation feedback observes active attempts, never restored snapshots.
class AssistantLiveHapticFeedback {
  AssistantLiveHapticFeedback({
    Future<void> Function()? onSuccess,
    Future<void> Function()? onWarning,
  }) : _onSuccess = onSuccess ?? AppHaptics.success,
       _onWarning = onWarning ?? AppHaptics.warning;

  final Future<void> Function() _onSuccess;
  final Future<void> Function() _onWarning;
  AssistantLiveConnectionStatus? _previousStatus;
  Object? _attemptScope;
  String? _attemptWorkspace;
  bool _disposed = false;

  void observe(
    AssistantLiveState state, {
    required Object scope,
    required bool isActive,
  }) {
    if (_disposed) return;
    final wasBusy = switch (_previousStatus) {
      AssistantLiveConnectionStatus.preparing ||
      AssistantLiveConnectionStatus.connecting ||
      AssistantLiveConnectionStatus.reconnecting => true,
      _ => false,
    };
    _previousStatus = state.status;
    if (!isActive ||
        (_attemptScope != null && _attemptScope != scope) ||
        (_attemptWorkspace != null && _attemptWorkspace != state.workspaceId)) {
      _clearAttempt();
    }
    if (!isActive) return;
    if (state.isBusy) {
      if (!wasBusy && state.workspaceId != null) {
        _attemptScope = scope;
        _attemptWorkspace = state.workspaceId;
      }
      return;
    }
    final currentAttempt =
        _attemptScope == scope && _attemptWorkspace == state.workspaceId;
    _clearAttempt();
    if (!currentAttempt) return;
    switch (state.status) {
      case AssistantLiveConnectionStatus.connected:
        unawaited(_onSuccess());
      case AssistantLiveConnectionStatus.error:
        unawaited(_onWarning());
      case AssistantLiveConnectionStatus.disconnected:
      case AssistantLiveConnectionStatus.preparing:
      case AssistantLiveConnectionStatus.connecting:
      case AssistantLiveConnectionStatus.reconnecting:
        break;
    }
  }

  void _clearAttempt() {
    _attemptScope = null;
    _attemptWorkspace = null;
  }

  void onLiveModeChanged({required bool isLiveMode}) {
    if (!isLiveMode) suspend();
  }

  void suspend() => _clearAttempt();

  void dispose() {
    _disposed = true;
    _clearAttempt();
  }
}
