import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

const snapshot = AssistantPersonalSettingsSnapshot(
  soul: AssistantSoul(),
  memoryEnabled: false,
  memories: [AssistantMemoryItem(id: 'memory-a', text: 'Synthetic preference')],
  products: {'mira': false, 'ai_chat': true},
);

class SettingsRepository extends AssistantPersonalSettingsRepository {
  SettingsRepository() : super(ownerId: 'actor-a');
  Future<AssistantPersonalSettingsSnapshot> Function()? read;
  Future<AssistantSoul> Function(AssistantSoul)? write;
  Future<void> Function()? remove;
  Future<Map<String, dynamic>> Function()? export;
  int writes = 0;
  Map<String, bool>? productsSent;
  @override
  Future<AssistantPersonalSettingsSnapshot> load(String workspaceId) =>
      read?.call() ?? Future.value(snapshot);
  @override
  Future<AssistantSoul> saveSoul(AssistantSoul soul) {
    writes++;
    return write?.call(soul) ?? Future.value(soul);
  }

  @override
  Future<bool> setMemoryEnabled(
    String workspaceId, {
    required bool enabled,
    required Map<String, bool> products,
  }) async {
    writes++;
    productsSent = products;
    return enabled;
  }

  @override
  Future<void> deleteMemory(String workspaceId, String id) =>
      remove?.call() ?? Future.value();
  @override
  Future<Map<String, dynamic>> exportMemories(String workspaceId) =>
      export?.call() ?? Future.value({'items': <dynamic>[]});
}
