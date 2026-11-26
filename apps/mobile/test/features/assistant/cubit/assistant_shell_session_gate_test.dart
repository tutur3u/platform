import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_settings_selection.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Repository extends Mock implements AssistantRepository {}

/// Records which credit sources the shell writes, and by whom.
class _Preferences extends AssistantPreferences {
  _Preferences(String Function() actor) : super(currentUserId: actor);

  final creditWrites = <AssistantCreditSource>[];

  @override
  Future<void> saveCreditSource(
    String wsId,
    AssistantCreditSource source, {
    bool Function()? shouldWrite,
  }) {
    if (shouldWrite?.call() ?? true) creditWrites.add(source);
    return super.saveCreditSource(wsId, source, shouldWrite: shouldWrite);
  }
}

const _ws = '22222222-2222-4222-8222-222222222222';
const _actorA = '33333333-3333-4333-8333-333333333333';
const _actorB = '44444444-4444-4444-8444-444444444444';
const _workspace = Workspace(id: _ws, tier: 'PRO');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Repository repository;
  late _Preferences preferences;
  late String actor;
  late List<AssistantSettingsSelection> selections;
  late List<AssistantSettingsDisposition> failures;
  Completer<void>? selectionGate;
  Completer<void>? creditsGate;
  late String creditsTier;
  Error? loadFailure;

  AssistantShellCubit shell({
    Duration settleWait = const Duration(seconds: 3),
  }) {
    final cubit = AssistantShellCubit(
      repository: repository,
      preferences: preferences,
      selectionSettleWait: settleWait,
      selectSettings: (selection, _) async {
        selections.add(selection);
        await selectionGate?.future;
        return AssistantSettingsDisposition.acknowledged;
      },
      onSettingsSelectionFailure: failures.add,
    );
    addTearDown(cubit.close);
    return cubit;
  }

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    actor = _actorA;
    preferences = _Preferences(() => actor);
    selections = [];
    failures = [];
    selectionGate = null;
    creditsGate = null;
    creditsTier = 'PRO';
    loadFailure = null;
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
      if (loadFailure case final failure?) throw failure;
      return AssistantCredits(tier: creditsTier, remaining: 5000);
    });
    when(repository.fetchGatewayModels).thenAnswer((_) async => []);
  });

  test('a new session drops the previous account while it loads', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    expect(await cubit.setCreditSource(AssistantCreditSource.personal), isTrue);
    expect(cubit.state.personalWorkspaceId, 'personal');

    actor = _actorB;
    creditsGate = Completer<void>();
    final loading = cubit.loadWorkspace(_workspace, forceRefresh: true);
    await Future<void>.delayed(Duration.zero);
    // Nothing sent now can carry the previous account's credit workspace,
    // and new chats wait for the session to resolve its own credits.
    expect(cubit.state.status, AssistantShellStatus.loading);
    expect(cubit.state.personalWorkspaceId, isNull);
    expect(cubit.state.sendCreditWorkspace(_ws), isNot('personal'));
    expect(cubit.state.activeCredits, const AssistantCredits());
    expect(cubit.state.conversationSettings, isNull);
    expect(cubit.state.selectedModel.value, 'google/gemini-3.1-flash-lite');
    expect(cubit.sessionReady, isFalse);
    expect(cubit.settingsReady, isFalse);
    creditsGate!.complete();
    await loading;
    expect(cubit.sessionReady, isTrue);
    expect(cubit.settingsReady, isTrue);
  });

  test('settings wait for the session to belong to the actor', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    expect(cubit.settingsReady, isTrue);
    // The account changes before its session reloads.
    actor = _actorB;
    expect(cubit.settingsReady, isFalse);
    expect(
      await cubit.setThinkingMode(AssistantThinkingMode.thinking),
      isFalse,
    );
    expect(selections, isEmpty);
  });

  test('a rejected model choice reports why it did not apply', () async {
    final cubit = shell();
    actor = _actorA;
    creditsGate = Completer<void>();
    final loading = cubit.loadWorkspace(_workspace);
    await Future<void>.delayed(Duration.zero);
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
    expect(failures, [AssistantSettingsDisposition.stale]);
    creditsGate!.complete();
    await loading;
  });

  test('a failed load holds changes until a retry succeeds', () async {
    final cubit = shell();
    loadFailure = StateError('Synthetic credits failure');
    await cubit.loadWorkspace(_workspace);
    expect(cubit.state.status, AssistantShellStatus.error);
    expect(cubit.settingsReady, isFalse);
    expect(
      await cubit.setThinkingMode(AssistantThinkingMode.thinking),
      isFalse,
    );
    expect(selections, isEmpty);

    loadFailure = null;
    await cubit.loadWorkspace(_workspace, forceRefresh: true);
    expect(cubit.state.status, AssistantShellStatus.loaded);
    expect(cubit.settingsReady, isTrue);
    expect(await cubit.setThinkingMode(AssistantThinkingMode.thinking), isTrue);
  });

  test('any load failure ends loading', () async {
    final cubit = shell();
    // A TypeError is not an Exception, and must still end the load.
    loadFailure = TypeError();
    await cubit.loadWorkspace(_workspace);
    expect(cubit.state.status, AssistantShellStatus.error);
  });

  test('a load that stops waiting leaves preferences to the change', () async {
    final cubit = shell(settleWait: const Duration(milliseconds: 50));
    await cubit.loadWorkspace(_workspace);
    preferences.creditWrites.clear();
    selectionGate = Completer<void>();
    final changing = cubit.setCreditSource(AssistantCreditSource.personal);
    await Future<void>.delayed(Duration.zero);
    await cubit.loadWorkspace(_workspace, forceRefresh: true);
    // The refresh gave up waiting but writes no credit source of its own.
    expect(preferences.creditWrites, isEmpty);

    selectionGate!.complete();
    expect(await changing, isTrue);
    expect(preferences.creditWrites, [AssistantCreditSource.personal]);
    expect(
      await preferences.loadCreditSource(_ws),
      AssistantCreditSource.personal,
    );
  });

  test('a winning change never shows locked workspace credits', () async {
    final cubit = shell();
    await cubit.loadWorkspace(_workspace);
    expect(cubit.state.creditSource, AssistantCreditSource.workspace);
    // The refresh learns the workspace credits are locked while a change to
    // workspace credits lands.
    await cubit.setCreditSource(AssistantCreditSource.personal);
    creditsTier = 'FREE';
    creditsGate = Completer<void>();
    final refreshing = cubit.loadWorkspace(_workspace, forceRefresh: true);
    await Future<void>.delayed(Duration.zero);
    creditsTier = 'PRO';
    final switching = cubit.setCreditSource(AssistantCreditSource.workspace);
    await Future<void>.delayed(Duration.zero);
    creditsTier = 'FREE';
    creditsGate!.complete();
    expect(await switching, isTrue);
    await refreshing;
    expect(cubit.state.workspaceCreditLocked, isTrue);
    expect(cubit.state.creditSource, AssistantCreditSource.personal);
    expect(cubit.state.activeCredits, cubit.state.personalCredits);
  });
}
