import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_settings_selection.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import '../view/assistant_settings_repair_harness.dart';

void main() {
  const selection = AssistantSettingsSelection(
    modelId: 'synthetic/model',
    creditSource: AssistantCreditSource.workspace,
    creditWsId: repairWorkspace,
    thinkingMode: AssistantThinkingMode.thinking,
  );
  for (final field in [
    'conversationId',
    'modelId',
    'creditSource',
    'creditWsId',
    'thinkingMode',
  ]) {
    test('mismatched $field is not an acknowledged settings choice', () async {
      final api = SettingsApi()
        ..overrideReceipt = {
          'conversationId': repairChat,
          ...selection.toJson(),
          field: 'foreign',
        };
      final repository = RepairRepository(api);
      expect(
        await repository.acknowledgeSettingsSelection(
          actorId: repairActor,
          wsId: repairWorkspace,
          chatId: repairChat,
          selection: selection,
          isCurrent: () => true,
        ),
        AssistantSettingsDisposition.unknown,
      );
      expect(api.patches, 1);
    });
  }
  test('stale origin and foreign actor do not admit PATCH', () async {
    final api = SettingsApi();
    final repository = RepairRepository(api);
    for (final current in [true, false]) {
      expect(
        await repository.acknowledgeSettingsSelection(
          actorId: current ? 'foreign-actor' : repairActor,
          wsId: repairWorkspace,
          chatId: repairChat,
          selection: selection,
          isCurrent: () => current,
        ),
        AssistantSettingsDisposition.stale,
      );
    }
    expect(api.patches, 0);
  });
  test(
    'legacy settings cannot fabricate a complete stored tuple ACK',
    () async {
      final api = SettingsApi();
      final repository = RepairRepository(api);
      expect(
        await repository.acknowledgeSettingsSelection(
          actorId: repairActor,
          wsId: repairWorkspace,
          chatId: 'ai-chat-$repairChat',
          selection: selection,
          isCurrent: () => true,
        ),
        AssistantSettingsDisposition.denied,
      );
      expect(api.patches, 0);
    },
  );
}
