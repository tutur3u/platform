import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';

enum LocalChatPhase { idle, loading, generating }

enum LocalChatFailure { unsupported, missingModel, engine, storage, input }

class AssistantLocalChatState {
  const AssistantLocalChatState({
    this.selectedModelId,
    this.ready = false,
    this.phase = LocalChatPhase.idle,
    this.failure,
    this.chat = const AssistantChatState(fallbackChatId: 'local'),
  });
  final String? selectedModelId;
  final bool ready;
  final LocalChatPhase phase;
  final LocalChatFailure? failure;
  final AssistantChatState chat;
  bool get local => selectedModelId != null;
  bool get transitioning => phase == LocalChatPhase.loading;
  bool get blocked => transitioning || (!local && failure != null);
}
