import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

void main() {
  group('deriveAssistantLiveUiState', () {
    test('returns available when effective credits allow live', () {
      final state = deriveAssistantLiveUiState(
        shellState: const AssistantShellState(
          activeCredits: AssistantCredits(
            tier: 'PRO',
            allowedFeatures: ['live_assistant'],
          ),
          creditSource: AssistantCreditSource.personal,
        ),
        liveState: const AssistantLiveState(),
        isEligible: true,
        isVisibleLiveSession: false,
        showBlockedReason: false,
      );

      expect(state.kind, AssistantLiveUiKind.available);
      expect(state.tone, AssistantLiveUiTone.positive);
      expect(state.showExpandedStageCard, isFalse);
    });

    test('returns unavailable when effective credits block live', () {
      final state = deriveAssistantLiveUiState(
        shellState: const AssistantShellState(),
        liveState: const AssistantLiveState(),
        isEligible: false,
        isVisibleLiveSession: false,
        showBlockedReason: true,
      );

      expect(state.kind, AssistantLiveUiKind.unavailable);
      expect(state.tone, AssistantLiveUiTone.neutral);
      expect(state.showBlockedReason, isTrue);
    });

    test('returns preparing for visible pending live session', () {
      final state = deriveAssistantLiveUiState(
        shellState: const AssistantShellState(
          workspaceCredits: AssistantCredits(tier: 'PRO'),
          activeCredits: AssistantCredits(tier: 'PRO'),
        ),
        liveState: const AssistantLiveState(
          status: AssistantLiveConnectionStatus.preparing,
        ),
        isEligible: true,
        isVisibleLiveSession: true,
        showBlockedReason: false,
      );

      expect(state.kind, AssistantLiveUiKind.preparing);
      expect(state.showExpandedStageCard, isTrue);
    });

    test('returns permission denied when microphone access is blocked', () {
      final state = deriveAssistantLiveUiState(
        shellState: const AssistantShellState(
          workspaceCredits: AssistantCredits(tier: 'PRO'),
          activeCredits: AssistantCredits(tier: 'PRO'),
        ),
        liveState: const AssistantLiveState(
          microphonePermission: AssistantLivePermissionState.denied,
        ),
        isEligible: true,
        isVisibleLiveSession: true,
        showBlockedReason: false,
      );

      expect(state.kind, AssistantLiveUiKind.permissionDenied);
      expect(state.showExpandedStageCard, isTrue);
    });
  });
}
