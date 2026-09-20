import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('AssistantPreferences', () {
    late AssistantPreferences preferences;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      preferences = AssistantPreferences(currentUserId: () => 'user-a');
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

    test(
      'does not adopt another account or legacy workspace preferences',
      () async {
        SharedPreferences.setMockInitialValues({
          '${assistantChatStorageKeyPrefix}shared': 'legacy-private-chat',
        });
        var userId = 'user-a';
        final scoped = AssistantPreferences(currentUserId: () => userId);
        expect(await scoped.loadChatId('shared'), isNull);
        await scoped.saveChatId('shared', 'a-chat');
        userId = 'user-b';
        expect(await scoped.loadChatId('shared'), isNull);
        await scoped.saveChatId('shared', 'b-chat');
        userId = 'user-a';
        expect(await scoped.loadChatId('shared'), 'a-chat');
      },
    );

    test(
      'anonymous callers neither persist nor restore chat selection',
      () async {
        final anonymous = AssistantPreferences(currentUserId: () => null);
        await anonymous.saveChatId('shared', 'private-chat');
        expect(await anonymous.loadChatId('shared'), isNull);
      },
    );

    test('restores serialized models', () async {
      const model = AssistantGatewayModel(
        value: 'google/gemini-3.1-flash-lite',
        label: 'gemini-3.1-flash-lite',
        provider: 'google',
      );

      await preferences.saveModel('ws-1', model);

      expect(await preferences.loadModel('ws-1'), model);
    });

    test('normalizes legacy Gemini Flash Lite preview models', () async {
      const legacyModel = AssistantGatewayModel(
        value: 'google/gemini-3.1-flash-lite-preview',
        label: 'gemini-3.1-flash-lite-preview',
        provider: 'google',
      );

      await preferences.saveModel('ws-1', legacyModel);

      expect(
        await preferences.loadModel('ws-1'),
        const AssistantGatewayModel(
          value: 'google/gemini-3.1-flash-lite',
          label: 'gemini-3.1-flash-lite',
          provider: 'google',
        ),
      );
    });
  });
  test('invalidated operations cannot mutate same-account preferences '
      'after awaiting storage', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = AssistantPreferences(currentUserId: () => 'user');
    await prefs.saveChatId('ws', 'current');
    await prefs.saveWorkspaceContextId('ws', 'current-context');
    var active = true;
    final save = prefs.saveChatId('ws', 'stale', shouldWrite: () => active);
    final clear = prefs.clearChatId('ws', shouldWrite: () => active);
    final context = prefs.saveWorkspaceContextId(
      'ws',
      'stale-context',
      shouldWrite: () => active,
    );
    active = false;
    await Future.wait([save, clear, context]);
    expect(await prefs.loadChatId('ws'), 'current');
    expect(await prefs.loadWorkspaceContextId('ws'), 'current-context');
  });
}
