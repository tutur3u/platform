import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';

enum LocalChatPhase { idle, loading, generating }

enum LocalChatFailure {
  unsupported,
  missingModel,
  invalidModelFormat,
  incompatibleModelVersion,
  runtimeUnavailable,
  engine,
  storage,
  input,
}

class AssistantLocalChatState {
  const AssistantLocalChatState({
    this.selectedModelId,
    this.ready = false,
    this.preparationRevision = 0,
    this.phase = LocalChatPhase.idle,
    this.failure,
    this.chat = const AssistantChatState(fallbackChatId: 'local'),
  });
  final String? selectedModelId;
  final bool ready;

  /// Preparation epoch, never a persisted claim of readiness after restart.
  final int preparationRevision;
  final LocalChatPhase phase;
  final LocalChatFailure? failure;
  final AssistantChatState chat;
  bool get local => selectedModelId != null;
  bool get transitioning => phase == LocalChatPhase.loading;
  bool get blocked => transitioning || (!local && failure != null);
}
