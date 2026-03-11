import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('AssistantPreferences', () {
    late AssistantPreferences preferences;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      preferences = AssistantPreferences();
    });

    test('stores values with workspace-scoped keys', () async {
      const workspaceA = 'ws-a';
      const workspaceB = 'ws-b';

      await preferences.saveChatId(workspaceA, 'chat-a');
      await preferences.saveChatId(workspaceB, 'chat-b');
      await preferences.saveThinkingMode(
        workspaceA,
        AssistantThinkingMode.thinking,
      );
      await preferences.saveCreditSource(
        workspaceB,
        AssistantCreditSource.personal,
      );

      expect(await preferences.loadChatId(workspaceA), 'chat-a');
      expect(await preferences.loadChatId(workspaceB), 'chat-b');
      expect(
        await preferences.loadThinkingMode(workspaceA),
        AssistantThinkingMode.thinking,
      );
      expect(
        await preferences.loadCreditSource(workspaceB),
        AssistantCreditSource.personal,
      );
    });

    test('restores serialized models', () async {
      const model = AssistantGatewayModel(
        value: 'google/gemini-3.1-flash-lite-preview',
        label: 'gemini-3.1-flash-lite-preview',
        provider: 'google',
      );

      await preferences.saveModel('ws-1', model);

      expect(await preferences.loadModel('ws-1'), model);
    });
  });
}
