import 'dart:async';

import 'package:bloc/bloc.dart';
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

/// Records, as each loaded state is published, whether the session was
/// already marked loaded.
class _ObservedShell extends AssistantShellCubit {
  _ObservedShell({required super.repository, required super.preferences});

  final readyAtLoaded = <bool>[];

  @override
  void onChange(Change<AssistantShellState> change) {
    super.onChange(change);
    if (change.nextState.status == AssistantShellStatus.loaded &&
        change.currentState.status != AssistantShellStatus.loaded) {
      readyAtLoaded.add(sessionLoaded);
    }
  }
}

const _ws = '22222222-2222-4222-8222-222222222222';
const _personal = '55555555-5555-4555-8555-555555555555';
const _actorA = '33333333-3333-4333-8333-333333333333';
const _actorB = '44444444-4444-4444-8444-444444444444';
const _workspace = Workspace(id: _ws);

/// A conversation saved on workspace credits, for example before the
/// workspace's plan locked them.
const _workspaceChat = AssistantConversationSettings(
  modelId: 'google/gemini-3-flash',
  creditSource: AssistantCreditSource.workspace,
  creditWsId: _ws,
  thinkingMode: AssistantThinkingMode.fast,
);

/// A send pairs the shell's credit source with its credit workspace; both
/// must match what the conversation stores, or the server rejects the send.
void _expectSendMatches(
  AssistantShellState state,
  AssistantConversationSettings stored,
) {
  expect(state.creditSource, stored.creditSource);
  expect(state.sendCreditWorkspace(_ws), stored.creditWsId);
  requireAssistantSendSettings(
    {
      'settings': {'conversationId': 'chat', ...stored.toJson()},
    },
    chatId: 'chat',
    modelId: state.selectedModel.value,
    creditSource: state.creditSource.name,
    creditWsId: state.sendCreditWorkspace(_ws),
    thinkingMode: state.thinkingMode.name,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Repository repository;
  late String actor;
  late List<AssistantSettingsSelection> selections;
  Completer<void>? creditsGate;
  late String creditsTier;
  Error? loadFailure;

  AssistantShellCubit shell() {
    final cubit = AssistantShellCubit(
      repository: repository,
      preferences: AssistantPreferences(currentUserId: () => actor),
      selectSettings: (selection, _) async {
        selections.add(selection);
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
    creditsGate = null;
    creditsTier = 'FREE';
    loadFailure = null;
    repository = _Repository();
    when(() => repository.currentActorId).thenAnswer((_) => actor);
    when(
      repository.resolvePersonalWorkspaceId,
    ).thenAnswer((_) async => _personal);
    when(
      repository.fetchSoul,
    ).thenAnswer((_) async => AssistantSoul(name: 'Mira of $actor'));
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
    ).thenAnswer((invocation) async {
      await creditsGate?.future;
      if (loadFailure case final failure?) throw failure;
      final wsId = invocation.positionalArguments.first as String;
      // Personal credits stay on a paid plan.
      return AssistantCredits(
        tier: wsId == _personal ? 'PRO' : creditsTier,
        remaining: 5000,
      );
    });
    when(repository.fetchGatewayModels).thenAnswer((_) async => []);
  });

  test(
    'a conversation restored before a locked load keeps its credits',
    () async {
      final cubit = shell();
      creditsGate = Completer<void>();
      final loading = cubit.loadWorkspace(_workspace);
      await Future<void>.delayed(Duration.zero);
      cubit.restoreConversationSettings(_workspaceChat);
      creditsGate!.complete();
      await loading;
      expect(cubit.state.workspaceCreditLocked, isTrue);
      _expectSendMatches(cubit.state, _workspaceChat);
    },
  );

  test(
    'a conversation restored after a locked load keeps its credits',
    () async {
      final cubit = shell();
      await cubit.loadWorkspace(_workspace);
      expect(cubit.state.creditSource, AssistantCreditSource.personal);
      cubit.restoreConversationSettings(_workspaceChat);
      _expectSendMatches(cubit.state, _workspaceChat);
      // A refresh keeps the conversation's credits too.
      await cubit.loadWorkspace(_workspace, forceRefresh: true);
      _expectSendMatches(cubit.state, _workspaceChat);
    },
  );

  test(
    'a new chat in a locked workspace returns to personal credits',
    () async {
      final cubit = shell();
      await cubit.loadWorkspace(_workspace);
      cubit
        ..restoreConversationSettings(_workspaceChat)
        ..restoreConversationSettings(null);
      expect(cubit.state.creditSource, AssistantCreditSource.personal);
      expect(cubit.state.sendCreditWorkspace(_ws), _personal);
    },
  );

  test('an accepted change in a conversation matches what it saved', () async {
    creditsTier = 'PRO';
    final cubit = shell();
    await cubit.loadWorkspace(const Workspace(id: _ws, tier: 'PRO'));
    const personalChat = AssistantConversationSettings(
      modelId: 'google/gemini-3-flash',
      creditSource: AssistantCreditSource.personal,
      creditWsId: _personal,
      thinkingMode: AssistantThinkingMode.fast,
    );
    cubit.restoreConversationSettings(personalChat);
    // The refresh learns the workspace credits are now locked while the
    // conversation switches to workspace credits.
    creditsTier = 'FREE';
    creditsGate = Completer<void>();
    final refreshing = cubit.loadWorkspace(_workspace, forceRefresh: true);
    await Future<void>.delayed(Duration.zero);
    // The change fetches credits through the same held request.
    final switching = cubit.setCreditSource(AssistantCreditSource.workspace);
    creditsGate!.complete();
    expect(await switching, isTrue);
    await refreshing;
    final acknowledged = selections.single;
    expect(acknowledged.creditSource, AssistantCreditSource.workspace);
    _expectSendMatches(
      cubit.state,
      AssistantConversationSettings(
        modelId: acknowledged.modelId,
        creditSource: acknowledged.creditSource,
        creditWsId: acknowledged.creditWsId,
        thinkingMode: acknowledged.thinkingMode,
      ),
    );
  });

  test('a new session drops the previous context and assistant', () async {
    final cubit = shell();
    await AssistantPreferences(
      currentUserId: () => _actorA,
    ).saveWorkspaceContextId(_ws, 'context-of-a');
    await cubit.loadWorkspace(_workspace);
    expect(cubit.state.workspaceContextId, 'context-of-a');
    expect(cubit.state.soul.name, 'Mira of $_actorA');

    actor = _actorB;
    creditsGate = Completer<void>();
    final loading = cubit.loadWorkspace(_workspace, forceRefresh: true);
    await Future<void>.delayed(Duration.zero);
    // A send while it loads carries no context of the previous account.
    expect(cubit.state.status, AssistantShellStatus.loading);
    expect(cubit.state.workspaceContextId, 'personal');
    expect(cubit.state.soul, const AssistantSoul());
    expect(cubit.state.soulSnapshot, isNull);
    creditsGate!.complete();
    await loading;
    expect(cubit.state.soul.name, 'Mira of $_actorB');
  });

  test('the session is ready when its loaded state is published', () async {
    final cubit = _ObservedShell(
      repository: repository,
      preferences: AssistantPreferences(currentUserId: () => actor),
    );
    addTearDown(cubit.close);
    await cubit.loadWorkspace(_workspace);
    expect(cubit.readyAtLoaded, [isTrue]);
    expect(cubit.settingsReady, isTrue);
  });

  test(
    "a failed new session holds changes after the last one's loaded",
    () async {
      final cubit = shell();
      await cubit.loadWorkspace(_workspace);
      expect(cubit.settingsReady, isTrue);

      // The next account's first load fails; the previous session having
      // loaded must not open the gate.
      actor = _actorB;
      loadFailure = StateError('Synthetic credits failure');
      await cubit.loadWorkspace(_workspace, forceRefresh: true);
      expect(cubit.state.status, AssistantShellStatus.error);
      expect(cubit.settingsReady, isFalse);
      expect(
        await cubit.setThinkingMode(AssistantThinkingMode.thinking),
        isFalse,
      );
      expect(selections, isEmpty);

      loadFailure = null;
      await cubit.loadWorkspace(_workspace, forceRefresh: true);
      expect(cubit.settingsReady, isTrue);
      expect(
        await cubit.setThinkingMode(AssistantThinkingMode.thinking),
        isTrue,
      );
    },
  );
}
