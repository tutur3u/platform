import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_settings_selection.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Repository extends Mock implements AssistantRepository {}

const _ws = '22222222-2222-4222-8222-222222222222';
const _actorA = '33333333-3333-4333-8333-333333333333';
const _actorB = '44444444-4444-4444-8444-444444444444';
const _workspace = Workspace(id: _ws, tier: 'PRO');

const _thinkingChat = AssistantConversationSettings(
  modelId: 'google/gemini-3-flash',
  creditSource: AssistantCreditSource.workspace,
  creditWsId: _ws,
  thinkingMode: AssistantThinkingMode.thinking,
);

/// A native send checks the shell's settings against the conversation's
/// stored ones and throws on any mismatch.
void _expectSendable(
  AssistantShellState state,
  AssistantConversationSettings stored,
) => requireAssistantSendSettings(
  {
    'settings': {'conversationId': 'chat', ...stored.toJson()},
  },
  chatId: 'chat',
  modelId: state.selectedModel.value,
  creditSource: state.creditSource.name,
  creditWsId: stored.creditWsId,
  thinkingMode: state.thinkingMode.name,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Repository repository;
  late String actor;
  late List<AssistantSettingsSelection> selections;
  Completer<void>? selectionGate;
  Completer<void>? creditsGate;
  late String creditsTier;

  AssistantShellCubit shell({
    Duration settleWait = const Duration(seconds: 3),
  }) {
    final cubit = AssistantShellCubit(
      repository: repository,
      preferences: AssistantPreferences(currentUserId: () => actor),
      selectionSettleWait: settleWait,
      selectSettings: (selection, _) async {
        selections.add(selection);
        await selectionGate?.future;
        return AssistantSettingsDisposition.acknowledged;
      },
    );
    addTearDown(cubit.close);
    return cubit;
  }

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    actor = _actorA;
    selections = [];
    selectionGate = null;
    creditsGate = null;
    creditsTier = 'PRO';
    repository = _Repository();
    when(() => repository.currentActorId).thenAnswer((_) => actor);
    when(
      repository.resolvePersonalWorkspaceId,
    ).thenAnswer((_) async => 'personal');
    when(repository.fetchSoul).thenAnswer((_) async => const AssistantSoul());
    when(
      () => repository.fetchTasksInsight(
        wsId: any(named: 'wsId'),
        isPersonal: any(named: 'isPersonal'),
      ),
    ).thenAnswer((_) async => const AssistantTasksInsight());
    when(
      () => repository.fetchCalendarInsight(any()),
    ).thenAnswer((_) async => const AssistantCalendarInsight());
    when(
      () => repository.fetchCredits(
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async {
      await creditsGate?.future;
      return AssistantCredits(tier: creditsTier, remaining: 5000);
    });
    when(repository.fetchGatewayModels).thenAnswer((_) async => []);
  });

  test('another account in the same workspace never inherits them', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    cubit.restoreConversationSettings(_thinkingChat);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);

    // The account switches in place and the new user's restore fails, so
    // nothing is restored for them before the workspace reloads.
    actor = _actorB;
    await cubit.loadWorkspace(_workspace, forceRefresh: true);
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
    expect(cubit.state.conversationSettings, isNull);
    expect(cubit.state.selectedModel.value, isNot(_thinkingChat.modelId));
  });

  test('an accepted mode change survives a forced refresh', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    cubit.restoreConversationSettings(_thinkingChat);
    expect(await cubit.setThinkingMode(AssistantThinkingMode.fast), isTrue);
    expect(selections.single.thinkingMode, AssistantThinkingMode.fast);

    await cubit.loadWorkspace(_workspace, forceRefresh: true);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
    const stored = AssistantConversationSettings(
      modelId: 'google/gemini-3-flash',
      creditSource: AssistantCreditSource.workspace,
      creditWsId: _ws,
      thinkingMode: AssistantThinkingMode.fast,
    );
    expect(cubit.state.conversationSettings, stored);
    _expectSendable(cubit.state, stored);
  });

  test('a new chat stays on the session mode through a refresh', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    cubit
      ..restoreConversationSettings(_thinkingChat)
      ..restoreConversationSettings(null);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);

    await cubit.loadWorkspace(_workspace, forceRefresh: true);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
    expect(cubit.state.conversationSettings, isNull);
  });

  test('a mode change in flight wins over a forced refresh', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    cubit.restoreConversationSettings(_thinkingChat);
    selectionGate = Completer<void>();
    final changing = cubit.setThinkingMode(AssistantThinkingMode.fast);
    final refreshing = cubit.loadWorkspace(_workspace, forceRefresh: true);
    await Future<void>.delayed(Duration.zero);
    expect(selections, hasLength(1));

    selectionGate!.complete();
    expect(await changing, isTrue);
    await refreshing;
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);

    // The kept settings follow the accepted change for later refreshes.
    await cubit.loadWorkspace(_workspace, forceRefresh: true);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
  });

  test('a model change in flight wins over a forced refresh', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    cubit.restoreConversationSettings(_thinkingChat);
    const next = AssistantGatewayModel(
      value: 'google/gemini-3-pro',
      label: 'Gemini 3 Pro',
      provider: 'google',
    );
    selectionGate = Completer<void>();
    final changing = cubit.setSelectedModel(next);
    final refreshing = cubit.loadWorkspace(_workspace, forceRefresh: true);
    await Future<void>.delayed(Duration.zero);

    selectionGate!.complete();
    expect(await changing, isTrue);
    await refreshing;
    expect(cubit.state.selectedModel.value, next.value);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);

    await cubit.loadWorkspace(_workspace, forceRefresh: true);
    expect(cubit.state.selectedModel.value, next.value);
    _expectSendable(
      cubit.state,
      const AssistantConversationSettings(
        modelId: 'google/gemini-3-pro',
        creditSource: AssistantCreditSource.workspace,
        creditWsId: _ws,
        thinkingMode: AssistantThinkingMode.thinking,
      ),
    );
  });

  test('a change started in another session never lands', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    selectionGate = Completer<void>();
    final changing = cubit.setThinkingMode(AssistantThinkingMode.thinking);
    // A switch away and back starts a new session before it is accepted.
    await cubit.loadWorkspace(
      const Workspace(id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', tier: 'PRO'),
    );
    final back = cubit.loadWorkspace(_workspace);
    selectionGate!.complete();
    expect(await changing, isFalse);
    await back;
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
  });

  test('a change tapped while a new session loads never lands', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    expect(cubit.state.creditSource, AssistantCreditSource.workspace);

    // Another account takes over the shared workspace; its workspace credits
    // are locked, so the new session settles on personal credits.
    actor = _actorB;
    creditsTier = 'FREE';
    creditsGate = Completer<void>();
    final loading = cubit.loadWorkspace(_workspace, forceRefresh: true);
    await Future<void>.delayed(Duration.zero);
    expect(
      await cubit.setThinkingMode(AssistantThinkingMode.thinking),
      isFalse,
    );
    expect(
      await cubit.setSelectedModel(
        const AssistantGatewayModel(
          value: 'google/gemini-3-pro',
          label: 'Gemini 3 Pro',
          provider: 'google',
        ),
      ),
      isFalse,
    );
    expect(
      await cubit.setCreditSource(AssistantCreditSource.workspace),
      isFalse,
    );
    expect(
      cubit.selectThinkingModeForRequests(AssistantThinkingMode.thinking),
      isFalse,
    );
    creditsGate!.complete();
    await loading;

    expect(selections, isEmpty);
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.workspaceCreditLocked, isTrue);
    expect(cubit.state.creditSource, AssistantCreditSource.personal);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
    // The new session accepts changes once it has loaded.
    expect(await cubit.setThinkingMode(AssistantThinkingMode.thinking), isTrue);
    expect(selections.single.creditSource, AssistantCreditSource.personal);
  });

  test('a refresh holds its settings until the change saves', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    cubit.restoreConversationSettings(_thinkingChat);
    selectionGate = Completer<void>();
    final changing = cubit.setThinkingMode(AssistantThinkingMode.fast);
    final refreshing = cubit.loadWorkspace(_workspace, forceRefresh: true);
    await Future<void>.delayed(const Duration(milliseconds: 50));

    // The refresh has its data but waits for the change in flight.
    expect(cubit.state.status, AssistantShellStatus.loading);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);

    selectionGate!.complete();
    await changing;
    await refreshing;
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.fast);
  });

  test('a change saved before the refresh settles keeps its model', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    const next = AssistantGatewayModel(
      value: 'google/gemini-3-pro',
      label: 'Gemini 3 Pro',
      provider: 'google',
    );
    // The refresh starts and reads its stored settings, then the change
    // lands while the refresh still waits on the network.
    creditsGate = Completer<void>();
    final refreshing = cubit.loadWorkspace(_workspace, forceRefresh: true);
    await Future<void>.delayed(Duration.zero);
    expect(await cubit.setSelectedModel(next), isTrue);
    creditsGate!.complete();
    await refreshing;
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.state.selectedModel.value, next.value);
  });

  test('a refresh waits for a slow change only up to its limit', () async {
    final cubit = shell(settleWait: const Duration(milliseconds: 50));
    await cubit.loadWorkspace(_workspace);
    selectionGate = Completer<void>();
    final changing = cubit.setThinkingMode(AssistantThinkingMode.thinking);
    await cubit.loadWorkspace(_workspace, forceRefresh: true);
    expect(cubit.state.status, AssistantShellStatus.loaded);

    // The change applies itself once it settles.
    selectionGate!.complete();
    expect(await changing, isTrue);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);
  });
}
