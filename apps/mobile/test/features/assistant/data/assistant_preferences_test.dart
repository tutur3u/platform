import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('AssistantPreferences', () {
    late AssistantPreferences preferences;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      preferences = AssistantPreferences(
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      );
    });

    test('stores values with workspace-scoped keys', () async {
      const workspaceA = '11111111-1111-4111-8111-111111111111';
      const workspaceB = '22222222-2222-4222-8222-222222222222';

      await preferences.saveChatId(
        workspaceA,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      await preferences.saveChatId(
        workspaceB,
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      );
      await preferences.saveThinkingMode(
        workspaceA,
        AssistantThinkingMode.thinking,
      );
      await preferences.saveCreditSource(
        workspaceB,
        AssistantCreditSource.personal,
      );

      expect(
        await preferences.loadChatId(workspaceA),
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      expect(
        await preferences.loadChatId(workspaceB),
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      );
      expect(
        await preferences.loadThinkingMode(workspaceA),
        AssistantThinkingMode.thinking,
      );
      expect(
        await preferences.loadCreditSource(workspaceB),
        AssistantCreditSource.personal,
      );
    });

    test('scoped route invalidation rejects a Live preference write', () async {
      await preferences.saveKeepLiveWhileBrowsing(
        '11111111-1111-4111-8111-111111111111',
        value: true,
      );
      var current = true;
      final write = preferences.saveKeepLiveWhileBrowsing(
        '11111111-1111-4111-8111-111111111111',
        value: false,
        shouldWrite: () => current,
      );
      current = false;
      await write;
      expect(
        await preferences.loadKeepLiveWhileBrowsing(
          '11111111-1111-4111-8111-111111111111',
        ),
        isTrue,
      );
    });

    test('Live browsing is opt-in and scoped to the workspace', () async {
      expect(
        await preferences.loadKeepLiveWhileBrowsing(
          '11111111-1111-4111-8111-111111111111',
        ),
        isFalse,
      );
      await preferences.saveKeepLiveWhileBrowsing(
        '11111111-1111-4111-8111-111111111111',
        value: true,
      );
      expect(
        await preferences.loadKeepLiveWhileBrowsing(
          '11111111-1111-4111-8111-111111111111',
        ),
        isTrue,
      );
      expect(
        await preferences.loadKeepLiveWhileBrowsing(
          '22222222-2222-4222-8222-222222222222',
        ),
        isFalse,
      );
      await preferences.saveKeepLiveWhileBrowsing(
        '11111111-1111-4111-8111-111111111111',
        value: false,
      );
      expect(
        await preferences.loadKeepLiveWhileBrowsing(
          '11111111-1111-4111-8111-111111111111',
        ),
        isFalse,
      );
    });

    test(
      'does not adopt another account or legacy workspace preferences',
      () async {
        SharedPreferences.setMockInitialValues({
          '$assistantChatStorageKeyPrefix'
                  '66666666-6666-4666-8666-666666666666':
              'legacy-private-chat',
        });
        var userId = '33333333-3333-4333-8333-333333333333';
        final scoped = AssistantPreferences(currentUserId: () => userId);
        expect(
          await scoped.loadChatId('66666666-6666-4666-8666-666666666666'),
          isNull,
        );
        await scoped.saveChatId(
          '66666666-6666-4666-8666-666666666666',
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        );
        userId = '44444444-4444-4444-8444-444444444444';
        expect(
          await scoped.loadChatId('66666666-6666-4666-8666-666666666666'),
          isNull,
        );
        await scoped.saveChatId(
          '66666666-6666-4666-8666-666666666666',
          'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        );
        userId = '33333333-3333-4333-8333-333333333333';
        expect(
          await scoped.loadChatId('66666666-6666-4666-8666-666666666666'),
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        );
      },
    );

    test(
      'anonymous callers neither persist nor restore chat selection',
      () async {
        final anonymous = AssistantPreferences(currentUserId: () => null);
        await anonymous.saveChatId(
          '66666666-6666-4666-8666-666666666666',
          'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        );
        expect(
          await anonymous.loadChatId('66666666-6666-4666-8666-666666666666'),
          isNull,
        );
      },
    );

    test('restores serialized models', () async {
      const model = AssistantGatewayModel(
        value: 'google/gemini-3.1-flash-lite',
        label: 'gemini-3.1-flash-lite',
        provider: 'google',
      );

      await preferences.saveModel(
        '77777777-7777-4777-8777-777777777777',
        model,
      );

      expect(
        await preferences.loadModel('77777777-7777-4777-8777-777777777777'),
        model,
      );
    });

    test('normalizes legacy Gemini Flash Lite preview models', () async {
      const legacyModel = AssistantGatewayModel(
        value: 'google/gemini-3.1-flash-lite-preview',
        label: 'gemini-3.1-flash-lite-preview',
        provider: 'google',
      );

      await preferences.saveModel(
        '77777777-7777-4777-8777-777777777777',
        legacyModel,
      );

      expect(
        await preferences.loadModel('77777777-7777-4777-8777-777777777777'),
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
    final prefs = AssistantPreferences(
      currentUserId: () => '55555555-5555-4555-8555-555555555555',
    );
    await prefs.saveChatId(
      '88888888-8888-4888-8888-888888888888',
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
    );
    await prefs.saveWorkspaceContextId(
      '88888888-8888-4888-8888-888888888888',
      'current-context',
    );
    var active = true;
    final save = prefs.saveChatId(
      '88888888-8888-4888-8888-888888888888',
      '99999999-9999-4999-8999-999999999999',
      shouldWrite: () => active,
    );
    final clear = prefs.clearChatId(
      '88888888-8888-4888-8888-888888888888',
      shouldWrite: () => active,
    );
    final context = prefs.saveWorkspaceContextId(
      '88888888-8888-4888-8888-888888888888',
      'stale-context',
      shouldWrite: () => active,
    );
    active = false;
    await Future.wait([save, clear, context]);
    expect(
      await prefs.loadChatId('88888888-8888-4888-8888-888888888888'),
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
    );
    expect(
      await prefs.loadWorkspaceContextId(
        '88888888-8888-4888-8888-888888888888',
      ),
      'current-context',
    );
  });
}
