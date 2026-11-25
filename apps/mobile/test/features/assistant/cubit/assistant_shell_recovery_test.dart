import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_settings_selection.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

import '../data/assistant_reset_commit_test.dart' as reset;

class _Repository extends Mock implements AssistantRepository {}

class _ContextHost extends reset.ResetHost {
  bool rejectContext = false;
  bool throwContext = false;
  int contextWrites = 0;
  @override
  Future<bool> setValue(String type, String key, Object value) async {
    if (key == 'flutter.${reset.envelopeKey}') {
      contextWrites++;
      if (rejectContext) {
        if (throwContext) throw StateError('Synthetic context host failure');
        return false;
      }
    }
    return await super.setValue(type, key, value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Repository repository;
  late AssistantShellCubit cubit;
  const workspace = Workspace(
    id: '22222222-2222-4222-8222-222222222222',
    tier: 'PRO',
  );
  const credits = AssistantCredits(tier: 'PRO', remaining: 5000);

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    repository = _Repository();
    when(
      repository.resolvePersonalWorkspaceId,
    ).thenAnswer((_) async => 'personal');
    when(repository.fetchSoul).thenAnswer((_) async => const AssistantSoul());
    when(
      () => repository.fetchTasksInsight(
        wsId: '22222222-2222-4222-8222-222222222222',
        isPersonal: false,
      ),
    ).thenAnswer((_) async => const AssistantTasksInsight());
    when(
      () => repository.fetchCalendarInsight(
        '22222222-2222-4222-8222-222222222222',
      ),
    ).thenThrow(const ApiException(message: 'Not found', statusCode: 404));
    when(
      () => repository.fetchCredits(
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async => credits);
    when(repository.fetchGatewayModels).thenAnswer((_) async => []);
    cubit = AssistantShellCubit(
      repository: repository,
      preferences: AssistantPreferences(
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      ),
    );
    addTearDown(cubit.close);
  });

  // A missing Calendar resolves asynchronously, as it does on a device, so
  // the workspace still loads.
  void calendarMissing() =>
      when(
        () => repository.fetchCalendarInsight(
          '22222222-2222-4222-8222-222222222222',
        ),
      ).thenAnswer((_) async {
        throw const ApiException(message: 'Not found', statusCode: 404);
      });

  test('a new workspace defaults to Fast', () async {
    calendarMissing();
    await cubit.loadWorkspace(workspace);
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
  });

  test('a stale stored Thinking still starts the session at Fast', () async {
    calendarMissing();
    final preferences = AssistantPreferences(
      currentUserId: () => '33333333-3333-4333-8333-333333333333',
    );
    await preferences.saveThinkingMode(
      '22222222-2222-4222-8222-222222222222',
      AssistantThinkingMode.thinking,
    );
    await cubit.loadWorkspace(workspace);
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
  });

  test('a new chat takes the session mode, not the opened chat', () async {
    calendarMissing();
    await cubit.loadWorkspace(workspace);
    // Opening a conversation saved with Thinking shows and sends with it.
    cubit.restoreConversationSettings(
      const AssistantConversationSettings(
        modelId: 'google/gemini-3-flash',
        creditSource: AssistantCreditSource.workspace,
        creditWsId: '22222222-2222-4222-8222-222222222222',
        thinkingMode: AssistantThinkingMode.thinking,
      ),
    );
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);
    // New chat returns to the session's Fast.
    cubit.restoreConversationSettings(null);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
    // An explicit choice becomes the session mode for later new chats.
    expect(await cubit.setThinkingMode(AssistantThinkingMode.thinking), isTrue);
    cubit.restoreConversationSettings(null);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);
    // Refreshing the same workspace keeps it.
    await cubit.loadWorkspace(workspace, forceRefresh: true);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);
  });

  test('a mode selection travels in the settings selection', () async {
    calendarMissing();
    final selections = <AssistantSettingsSelection>[];
    final selecting = AssistantShellCubit(
      repository: repository,
      preferences: AssistantPreferences(
        currentUserId: () => '33333333-3333-4333-8333-333333333333',
      ),
      selectSettings: (selection, _) async {
        selections.add(selection);
        return AssistantSettingsDisposition.acknowledged;
      },
    );
    addTearDown(selecting.close);
    await selecting.loadWorkspace(workspace);
    expect(
      await selecting.setThinkingMode(AssistantThinkingMode.thinking),
      isTrue,
    );
    expect(selections.single.thinkingMode, AssistantThinkingMode.thinking);
    expect(selections.single.toJson()['thinkingMode'], 'thinking');
    expect(selecting.state.thinkingMode, AssistantThinkingMode.thinking);
  });

  test('subscription models keep their provider defaults', () async {
    calendarMissing();
    await cubit.loadWorkspace(workspace);
    cubit.restoreSelectedModel(
      const AssistantGatewayModel(
        value: 'chatgpt/gpt-5',
        label: 'ChatGPT',
        provider: 'chatgpt',
      ),
    );
    expect(
      await cubit.setThinkingMode(AssistantThinkingMode.thinking),
      isFalse,
    );
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
  });

  const thinkingChat = AssistantConversationSettings(
    modelId: 'google/gemini-3-flash',
    creditSource: AssistantCreditSource.workspace,
    creditWsId: '22222222-2222-4222-8222-222222222222',
    thinkingMode: AssistantThinkingMode.thinking,
  );

  /// The settings a native send checks against the conversation's stored
  /// ones; a mismatch throws.
  void expectSendable(AssistantShellState state) =>
      requireAssistantSendSettings(
        {
          'settings': {'conversationId': 'chat', ...thinkingChat.toJson()},
        },
        chatId: 'chat',
        modelId: state.selectedModel.value,
        creditSource: state.creditSource.name,
        creditWsId: state.conversationSettings?.creditWsId,
        thinkingMode: state.thinkingMode.name,
      );

  test('a conversation restored mid-load keeps its settings', () async {
    calendarMissing();
    final credits = Completer<void>();
    when(
      () => repository.fetchCredits(
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async {
      await credits.future;
      return const AssistantCredits(tier: 'PRO', remaining: 5000);
    });
    final loading = cubit.loadWorkspace(workspace);
    await Future<void>.delayed(Duration.zero);
    // The chat restore wins the race with the workspace load.
    cubit.restoreConversationSettings(thinkingChat);
    credits.complete();
    await loading;
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);
    expect(cubit.state.conversationSettings, thinkingChat);
    expect(cubit.state.selectedModel.value, thinkingChat.modelId);
    expectSendable(cubit.state);
  });

  test('a forced refresh keeps an open Thinking conversation', () async {
    calendarMissing();
    await cubit.loadWorkspace(workspace);
    cubit.restoreConversationSettings(thinkingChat);
    await cubit.loadWorkspace(workspace, forceRefresh: true);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);
    expect(cubit.state.conversationSettings, thinkingChat);
    expectSendable(cubit.state);
  });

  test('switching workspaces away and back starts at Fast again', () async {
    calendarMissing();
    when(
      () => repository.fetchTasksInsight(
        wsId: any(named: 'wsId'),
        isPersonal: any(named: 'isPersonal'),
      ),
    ).thenAnswer((_) async => const AssistantTasksInsight());
    when(() => repository.fetchCalendarInsight(any())).thenAnswer((_) async {
      throw const ApiException(message: 'Not found', statusCode: 404);
    });
    await cubit.loadWorkspace(workspace);
    expect(await cubit.setThinkingMode(AssistantThinkingMode.thinking), isTrue);
    await cubit.loadWorkspace(
      const Workspace(id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', tier: 'PRO'),
    );
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
    await cubit.loadWorkspace(workspace);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
  });

  test(
    'a per-request mode changes the session without a settings write',
    () async {
      calendarMissing();
      final selections = <AssistantSettingsSelection>[];
      final selecting = AssistantShellCubit(
        repository: repository,
        preferences: AssistantPreferences(
          currentUserId: () => '33333333-3333-4333-8333-333333333333',
        ),
        selectSettings: (selection, _) async {
          selections.add(selection);
          return AssistantSettingsDisposition.acknowledged;
        },
      );
      addTearDown(selecting.close);
      await selecting.loadWorkspace(workspace);
      expect(
        selecting.selectThinkingModeForRequests(AssistantThinkingMode.thinking),
        isTrue,
      );
      expect(selecting.state.thinkingMode, AssistantThinkingMode.thinking);
      expect(selections, isEmpty);
      selecting.restoreConversationSettings(null);
      expect(selecting.state.thinkingMode, AssistantThinkingMode.thinking);
    },
  );

  test('missing optional Calendar does not erase Pro balances', () async {
    // Async errors model a real network failure after all requests start.
    when(
      () => repository.fetchCalendarInsight(
        '22222222-2222-4222-8222-222222222222',
      ),
    ).thenAnswer((_) async {
      throw const ApiException(message: 'Not found', statusCode: 404);
    });
    await cubit.loadWorkspace(workspace);
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.workspaceCredits, credits);
    expect(cubit.state.workspaceCreditLocked, isFalse);
    expect(cubit.state.activeCredits.tier, 'PRO');
    expect(await cubit.setCreditSource(AssistantCreditSource.personal), isTrue);
    expect(cubit.state.creditSource, AssistantCreditSource.personal);
  });

  test(
    'credit selection failure is recoverable and preserves the source',
    () async {
      when(
        () => repository.fetchCalendarInsight(
          '22222222-2222-4222-8222-222222222222',
        ),
      ).thenAnswer((_) async => const AssistantCalendarInsight());
      await cubit.loadWorkspace(workspace);
      when(() => repository.fetchCredits('personal')).thenAnswer((_) async {
        throw const ApiException(message: 'Unavailable', statusCode: 503);
      });
      expect(
        await cubit.setCreditSource(AssistantCreditSource.personal),
        isFalse,
      );
      expect(cubit.state.creditSource, AssistantCreditSource.workspace);
      expect(cubit.state.status, AssistantShellStatus.error);
      expect(cubit.state.workspaceCredits, credits);
    },
  );
  for (final pending in [true, false]) {
    for (final throws in [false, true]) {
      test(
        'context load is read-only pending=$pending throw=$throws',
        () async {
          SharedPreferences.resetStatic();
          final host = _ContextHost();
          SharedPreferencesStorePlatform.instance = host;
          final store = AssistantResetPreferences(
            actorId: reset.actor,
            workspaceId: reset.ws,
            isCurrent: () => true,
          );
          if (pending) {
            final consentTarget = await store.inspectResetConsentTarget();
            host
              ..faultAt = 2
              ..throws = throws;
            expect(
              (await store.reset(
                reset.operation,
                informed: true,
                consentTarget: consentTarget,
              )).disposition,
              AssistantResetDisposition.uncertain,
            );
            host.faultAt = null;
          } else {
            host
              ..rejectContext = true
              ..throwContext = throws;
          }
          final before = (await host.getAll())['flutter.${reset.envelopeKey}'];
          final writesBefore = host.contextWrites;
          final heldBefore = await store.hasUnknownCreation();
          final preferences = AssistantPreferences(
            currentUserId: () => reset.actor,
          );
          when(
            () =>
                repository.fetchTasksInsight(wsId: reset.ws, isPersonal: false),
          ).thenAnswer((_) async => const AssistantTasksInsight());
          when(
            () => repository.fetchCalendarInsight(reset.ws),
          ).thenAnswer((_) async => const AssistantCalendarInsight());
          final shell = AssistantShellCubit(
            repository: repository,
            preferences: preferences,
          );
          final errors = <Object>[];
          final completed = Completer<void>();
          unawaited(
            runZonedGuarded<Future<void>>(
              () async {
                try {
                  await shell.loadWorkspace(
                    const Workspace(id: reset.ws, tier: 'PRO'),
                  );
                  await preferences.loadWorkspaceContextId(reset.ws);
                  await shell.close();
                  await preferences.loadWorkspaceContextId(reset.ws);
                } finally {
                  completed.complete();
                }
              },
              (error, stack) {
                errors.add(error);
              },
            ),
          );
          await completed.future;
          verifyNever(
            () => repository.createChat(
              id: any(named: 'id'),
              wsId: any(named: 'wsId'),
              modelId: any(named: 'modelId'),
              message: any(named: 'message'),
              timezone: any(named: 'timezone'),
            ),
          );
          expect(errors, isEmpty);
          expect(shell.state.status, AssistantShellStatus.loaded);
          expect(shell.state.workspaceContextId, 'prior');
          expect((await store.read())?.selectedChatId, reset.chat);
          expect(await store.hasUnknownCreation(), heldBefore);
          if (pending) expect(heldBefore, isTrue);
          expect((await host.getAll())['flutter.${reset.envelopeKey}'], before);
          expect(host.contextWrites, writesBefore);
        },
      );
    }
  }

  test(
    'load does not revoke known process consent or write after close',
    () async {
      SharedPreferences.resetStatic();
      final host = _ContextHost();
      SharedPreferencesStorePlatform.instance = host;
      final store = AssistantResetPreferences(
        actorId: reset.actor,
        workspaceId: reset.ws,
        isCurrent: () => true,
      );
      final consentTarget = await store.inspectResetConsentTarget();
      expect(
        (await store.reset(
          reset.operation,
          informed: true,
          consentTarget: consentTarget,
        )).committedCurrent,
        true,
      );
      final preferences = AssistantPreferences(
        currentUserId: () => reset.actor,
      );
      when(
        () => repository.fetchTasksInsight(wsId: reset.ws, isPersonal: false),
      ).thenAnswer((_) async => const AssistantTasksInsight());
      when(
        () => repository.fetchCalendarInsight(reset.ws),
      ).thenAnswer((_) async => const AssistantCalendarInsight());
      final shell = AssistantShellCubit(
        repository: repository,
        preferences: preferences,
      );
      await shell.loadWorkspace(const Workspace(id: reset.ws, tier: 'PRO'));
      await preferences.loadWorkspaceContextId(reset.ws);
      expect(await store.hasUnknownCreation(), false);
      final before = (await host.getAll())['flutter.${reset.envelopeKey}'];
      final writesBefore = host.contextWrites;
      final held = Completer<AssistantCredits>();
      final entered = Completer<void>();
      when(
        () => repository.fetchCredits(
          reset.ws,
          forceRefresh: any(named: 'forceRefresh'),
        ),
      ).thenAnswer((_) {
        entered.complete();
        return held.future;
      });
      final loading = shell.loadWorkspace(
        const Workspace(id: reset.ws, tier: 'PRO'),
      );
      await entered.future;
      await shell.close();
      held.complete(credits);
      await loading;
      expect((await host.getAll())['flutter.${reset.envelopeKey}'], before);
      expect(host.contextWrites, writesBefore);
      expect(await store.hasUnknownCreation(), false);
    },
  );
}
