import 'package:mobile/features/assistant/data/assistant_memory_edit.dart';
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
  Future<bool> Function({required bool enabled})? consent;
  Future<void> Function()? remove;
  Future<Map<String, dynamic>> Function()? export;
  Future<EditableAssistantMemory> Function()? readEdit;
  Future<AssistantMemoryEditReceipt> Function(String, String)? updateEdit;
  int edits = 0;
  @override
  Future<EditableAssistantMemory> readMemoryForEdit(
    String workspaceId,
    String id,
  ) =>
      readEdit?.call() ??
      Future.value(
        EditableAssistantMemory(
          id: id,
          content: 'Synthetic canonical content',
          revision: 'v1:${'a' * 32}',
        ),
      );
  @override
  Future<AssistantMemoryEditReceipt> editMemory(
    String workspaceId,
    String id, {
    required String value,
    required String revision,
  }) {
    edits++;
    return updateEdit?.call(value, revision) ??
        Future.value(
          AssistantMemoryEditReceipt(
            memory: EditableAssistantMemory(
              id: id,
              content: value.trim(),
              revision: 'v1:${'b' * 32}',
            ),
            auditRecorded: true,
          ),
        );
  }

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
    return await consent?.call(enabled: enabled) ?? enabled;
  }

  @override
  Future<void> deleteMemory(String workspaceId, String id) =>
      remove?.call() ?? Future.value();
  @override
  Future<Map<String, dynamic>> exportMemories(String workspaceId) =>
      export?.call() ?? Future.value({'items': <dynamic>[]});
}
