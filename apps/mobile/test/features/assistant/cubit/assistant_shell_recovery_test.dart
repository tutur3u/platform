import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
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

  test('stored Fast is migrated and cannot change native Thinking', () async {
    final preferences = AssistantPreferences(
      currentUserId: () => '33333333-3333-4333-8333-333333333333',
    );
    await preferences.saveThinkingMode(
      '22222222-2222-4222-8222-222222222222',
      AssistantThinkingMode.fast,
    );
    await cubit.loadWorkspace(workspace);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);
    await cubit.setThinkingMode(AssistantThinkingMode.fast);
    expect(cubit.state.thinkingMode, AssistantThinkingMode.thinking);
    expect(
      await preferences.loadThinkingMode(
        '22222222-2222-4222-8222-222222222222',
      ),
      AssistantThinkingMode.thinking,
    );
  });

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
