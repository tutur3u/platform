import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/data/workspace_visibility_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Workspaces extends Mock implements WorkspaceRepository {}

class _Visibility extends Mock implements WorkspaceVisibilityRepository {}

void main() {
  const personal = Workspace(id: 'personal', name: 'Personal', personal: true);
  const team = Workspace(id: 'team', name: 'Team');
  late _Workspaces repo;
  late _Visibility visibility;
  late WorkspaceCubit cubit;
  late String? actor;

  setUpAll(() => registerFallbackValue(personal));
  setUp(() {
    actor = 'A';
    repo = _Workspaces();
    visibility = _Visibility();
    when(() => repo.authenticatedUserId).thenAnswer((_) => actor);
    when(() => repo.getWorkspaces()).thenAnswer((_) async => [personal, team]);
    when(() => repo.getDefaultWorkspace()).thenAnswer((_) async => personal);
    when(() => repo.loadDefaultWorkspaceId()).thenAnswer((_) async => null);
    when(() => repo.loadSelectedWorkspace()).thenAnswer((_) async => personal);
    when(
      () => repo.getMobileHiddenModuleIds(any()),
    ).thenAnswer((_) async => []);
    when(() => repo.getWorkspaceLimits()).thenThrow(Exception('noncritical'));
    when(() => repo.saveSelectedWorkspace(any())).thenAnswer((_) async {});
    when(() => repo.clearSelectedWorkspace()).thenAnswer((_) async {});
    when(() => visibility.readCached(any())).thenAnswer(
      (_) async =>
          const CacheReadResult<List<String>>(state: CacheEntryState.missing),
    );
    when(() => visibility.refresh(any())).thenAnswer((_) async => []);
    when(() => visibility.saveCached(any(), any())).thenAnswer((_) async {});
    when(
      () => visibility.update(any(), any(), hidden: any(named: 'hidden')),
    ).thenAnswer((_) async {});
    cubit = WorkspaceCubit(
      workspaceRepository: repo,
      visibilityRepository: visibility,
    );
  });
  tearDown(() => cubit.close());
  Future<void> load() async {
    await cubit.loadWorkspaces(forceRefresh: true);
    await Future<void>.delayed(Duration.zero);
  }

  for (final status in [403, 404, 500]) {
    test(
      'preference $status keeps canonical membership and explicit selection',
      () async {
        when(() => visibility.refresh('A')).thenThrow(
          ApiException(message: 'Preference unavailable', statusCode: status),
        );
        await load();
        expect(cubit.state.status, WorkspaceStatus.loaded);
        expect(cubit.state.workspaces, [personal, team]);
        expect(cubit.state.visibleWorkspaces, [personal, team]);
        expect(cubit.state.visibilityStatus, WorkspaceStatus.error);
        expect(cubit.state.visibilityResolved, isFalse);
        await cubit.setWorkspaceHidden(team.id, hidden: true);
        expect(cubit.state.visibilityResolved, isFalse);
        await cubit.selectWorkspace(team);
        expect(cubit.state.currentWorkspace, team);
        verify(() => repo.saveSelectedWorkspace(team)).called(1);
        verifyNever(() => visibility.saveCached(any(), any()));
        verifyNever(
          () => visibility.update(any(), any(), hidden: any(named: 'hidden')),
        );
      },
    );
  }

  test(
    'hide active and last-visible keeps canonical membership and default',
    () async {
      await load();
      await cubit.setWorkspaceHidden(personal.id, hidden: true);
      expect(cubit.state.currentWorkspace, team);
      expect(cubit.state.visibleWorkspaces, [team]);
      await cubit.setWorkspaceHidden(team.id, hidden: true);
      expect(cubit.state.currentWorkspace, isNull);
      expect(cubit.state.visibleWorkspaces, isEmpty);
      expect(cubit.state.workspaces, [personal, team]);
      expect(cubit.state.emptyMembershipConfirmed, isFalse);
      expect(cubit.state.defaultWorkspace, personal);
      verifyNever(() => repo.updateDefaultWorkspace(any()));
    },
  );

  test('failed optimistic hide rolls back selection and preference', () async {
    await load();
    final completion = Completer<void>();
    when(
      () => visibility.update('A', personal.id, hidden: true),
    ).thenAnswer((_) => completion.future);
    final operation = cubit.setWorkspaceHidden(personal.id, hidden: true);
    expect(cubit.state.visibleWorkspaces, [team]);
    expect(cubit.state.currentWorkspace, team);
    final failure = expectLater(operation, throwsA(isA<Exception>()));
    completion.completeError(Exception('offline'));
    await failure;
    expect(cubit.state.hiddenWorkspaceIds, isEmpty);
    expect(cubit.state.currentWorkspace, personal);
    expect(cubit.state.pendingVisibilityIds, isEmpty);
    expect(cubit.state.visibilityError, isNotNull);
  });

  test('concurrent successes persist only confirmed choices '
      'and rollback remains offline-safe', () async {
    await load();
    final writes = <List<String>>[];
    when(() => visibility.saveCached('A', any())).thenAnswer((call) async {
      writes.add(List<String>.of(call.positionalArguments[1] as List<String>));
    });
    final pending = Completer<void>();
    when(
      () => visibility.update('A', personal.id, hidden: true),
    ).thenAnswer((_) => pending.future);
    final hidingPersonal = cubit.setWorkspaceHidden(personal.id, hidden: true);
    await cubit.setWorkspaceHidden(team.id, hidden: true);
    expect(writes, [
      [team.id],
    ]);
    expect(cubit.state.hiddenWorkspaceIds, containsAll([personal.id, team.id]));
    final failure = expectLater(hidingPersonal, throwsA(isA<Exception>()));
    pending.completeError(Exception('offline'));
    await failure;
    expect(writes.last, [team.id]);
    expect(writes.expand((ids) => ids), isNot(contains(personal.id)));
    expect(cubit.state.hiddenWorkspaceIds, [team.id]);
    when(() => visibility.readCached('A')).thenAnswer(
      (_) async => CacheReadResult<List<String>>(
        state: CacheEntryState.fresh,
        hasValue: true,
        data: writes.last,
      ),
    );
    when(() => visibility.refresh('A')).thenThrow(Exception('offline'));
    await cubit.close();
    cubit = WorkspaceCubit(
      workspaceRepository: repo,
      visibilityRepository: visibility,
    );
    await load();
    expect(cubit.state.hiddenWorkspaceIds, [team.id]);
    expect(cubit.state.visibleWorkspaces, [personal]);
  });
  test(
    'account-change StateError during canonical discovery is safely discarded',
    () async {
      final pending = Completer<List<Workspace>>();
      when(() => repo.getWorkspaces()).thenAnswer((_) => pending.future);
      final loading = cubit.loadWorkspaces(forceRefresh: true);
      await Future<void>.delayed(Duration.zero);
      actor = 'B';
      pending.completeError(StateError('Workspace account changed'));
      await loading;
      expect(cubit.state.workspaces, isEmpty);
    },
  );
  test('stale refresh cannot overwrite a newer optimistic hide', () async {
    await load();
    final stale = Completer<List<String>>();
    when(() => visibility.refresh('A')).thenAnswer((_) => stale.future);
    final refresh = cubit.refreshHiddenWorkspaces();
    await Future<void>.delayed(Duration.zero);
    await cubit.setWorkspaceHidden(team.id, hidden: true);
    stale.complete([]);
    await refresh;
    expect(cubit.state.hiddenWorkspaceIds, [team.id]);
    expect(cubit.state.workspaces, [personal, team]);
  });

  test('late A mutation cannot emit or cache under account B', () async {
    await load();
    final write = Completer<void>();
    when(
      () => visibility.update('A', team.id, hidden: true),
    ).thenAnswer((_) => write.future);
    final operation = cubit.setWorkspaceHidden(team.id, hidden: true);
    actor = 'B';
    final loadingB = cubit.loadWorkspaces(forceRefresh: true);
    expect(cubit.state.hiddenWorkspaceIds, isEmpty);
    expect(cubit.state.workspaces, isEmpty);
    await loadingB;
    await Future<void>.delayed(Duration.zero);
    clearInteractions(visibility);
    write.complete();
    await operation;
    expect(cubit.state.hiddenWorkspaceIds, isEmpty);
    expect(cubit.state.workspaces, [personal, team]);
    verifyNever(() => visibility.saveCached(any(), any()));
  });

  test(
    'logout clears UI synchronously and ignores delayed Hidden refresh',
    () async {
      await load();
      final stale = Completer<List<String>>();
      when(() => visibility.refresh('A')).thenAnswer((_) => stale.future);
      final refresh = cubit.refreshHiddenWorkspaces();
      await Future<void>.delayed(Duration.zero);
      actor = null;
      final clear = cubit.clearWorkspaces();
      expect(cubit.state.workspaces, isEmpty);
      clearInteractions(visibility);
      stale.complete([team.id]);
      await refresh;
      await clear;
      expect(cubit.state.hiddenWorkspaceIds, isEmpty);
      verifyNever(() => visibility.saveCached(any(), any()));
    },
  );

  test(
    'explicit authorized hidden selection does not unhide on refresh',
    () async {
      await load();
      await cubit.setWorkspaceHidden(team.id, hidden: true);
      await cubit.selectWorkspace(team);
      when(() => visibility.refresh('A')).thenAnswer((_) async => [team.id]);
      await cubit.refreshHiddenWorkspaces();
      expect(cubit.state.currentWorkspace, team);
      expect(cubit.state.visibleWorkspaces, [personal]);
      expect(cubit.state.hiddenWorkspaceIds, [team.id]);
    },
  );

  test('pending workspace visibility writes cannot duplicate', () async {
    await load();
    final write = Completer<void>();
    when(
      () => visibility.update('A', team.id, hidden: true),
    ).thenAnswer((_) => write.future);
    final operation = cubit.setWorkspaceHidden(team.id, hidden: true);
    await cubit.setWorkspaceHidden(team.id, hidden: true);
    verify(() => visibility.update('A', team.id, hidden: true)).called(1);
    write.complete();
    await operation;
    expect(cubit.state.pendingVisibilityIds, isEmpty);
  });
  test(
    'remote hide success survives device cache persistence failure',
    () async {
      await load();
      when(
        () => visibility.saveCached('A', any()),
      ).thenThrow(Exception('device cache unavailable'));
      await cubit.setWorkspaceHidden(team.id, hidden: true);
      expect(cubit.state.hiddenWorkspaceIds, [team.id]);
      expect(cubit.state.visibilityError, isNull);
    },
  );

  test(
    'known empty private cache stays usable when revalidation is offline',
    () async {
      when(() => visibility.readCached('A')).thenAnswer(
        (_) async => const CacheReadResult<List<String>>(
          state: CacheEntryState.fresh,
          hasValue: true,
          data: [],
        ),
      );
      when(() => visibility.refresh('A')).thenThrow(Exception('offline'));
      await load();
      expect(cubit.state.visibilityResolved, isTrue);
      expect(cubit.state.visibleWorkspaces, [personal, team]);
    },
  );

  test('explicit hidden scope survives canonical workspace refresh', () async {
    await load();
    await cubit.setWorkspaceHidden(team.id, hidden: true);
    await cubit.selectWorkspace(team);
    when(() => visibility.refresh('A')).thenAnswer((_) async => [team.id]);
    await cubit.loadWorkspaces(forceRefresh: true);
    expect(cubit.state.currentWorkspace?.id, team.id);
    expect(cubit.state.visibleWorkspaces, [personal]);
  });
  test('refresh during pending hide preserves optimistic choices', () async {
    await load();
    final write = Completer<void>();
    when(
      () => visibility.update('A', team.id, hidden: true),
    ).thenAnswer((_) => write.future);
    final operation = cubit.setWorkspaceHidden(team.id, hidden: true);
    clearInteractions(visibility);
    await cubit.refreshHiddenWorkspaces();
    expect(cubit.state.visibleWorkspaces, [personal]);
    verifyNever(() => visibility.refresh(any()));
    write.complete();
    await operation;
  });

  test(
    'rollback cannot restore a scope hidden by a concurrent mutation',
    () async {
      await load();
      final first = Completer<void>();
      final second = Completer<void>();
      when(
        () => visibility.update('A', personal.id, hidden: true),
      ).thenAnswer((_) => first.future);
      when(
        () => visibility.update('A', team.id, hidden: true),
      ).thenAnswer((_) => second.future);
      final hidingPersonal = cubit.setWorkspaceHidden(
        personal.id,
        hidden: true,
      );
      final hidingTeam = cubit.setWorkspaceHidden(team.id, hidden: true);
      first.complete();
      await hidingPersonal;
      final failure = expectLater(hidingTeam, throwsA(isA<Exception>()));
      second.completeError(Exception('offline'));
      await failure;
      expect(cubit.state.hiddenWorkspaceIds, [personal.id]);
      expect(cubit.state.currentWorkspace, team);
    },
  );

  test(
    'late mutation from prior A session cannot affect replacement A session',
    () async {
      await load();
      final write = Completer<void>();
      when(
        () => visibility.update('A', team.id, hidden: true),
      ).thenAnswer((_) => write.future);
      final operation = cubit.setWorkspaceHidden(team.id, hidden: true);
      actor = null;
      await cubit.clearWorkspaces();
      actor = 'A';
      await load();
      clearInteractions(visibility);
      write.complete();
      await operation;
      expect(cubit.state.hiddenWorkspaceIds, isEmpty);
      verifyNever(() => visibility.saveCached(any(), any()));
    },
  );
  test(
    'hide during deferred module flags cannot re-emit hidden current scope',
    () async {
      await load();
      final flags = Completer<List<String>>();
      when(
        () => repo.getMobileHiddenModuleIds(personal.id),
      ).thenAnswer((_) => flags.future);
      when(
        () => repo.getMobileHiddenModuleIds(team.id),
      ).thenAnswer((_) async => ['team-only']);
      final loading = cubit.loadWorkspaces(forceRefresh: true);
      await Future<void>.delayed(Duration.zero);
      await cubit.setWorkspaceHidden(personal.id, hidden: true);
      flags.complete(['personal-only']);
      await loading;
      expect(cubit.state.currentWorkspace, team);
      expect(cubit.state.hiddenModuleIds, ['team-only']);
    },
  );
  test(
    'explicit deep link before hidden refresh retains authorized scope',
    () async {
      final hidden = Completer<List<String>>();
      when(() => visibility.refresh('A')).thenAnswer((_) => hidden.future);
      await cubit.loadWorkspaces(forceRefresh: true);
      expect(cubit.state.visibilityResolved, isFalse);
      await cubit.selectWorkspace(team);
      hidden.complete([team.id]);
      await Future<void>.delayed(Duration.zero);
      expect(cubit.state.currentWorkspace, team);
      expect(cubit.state.visibleWorkspaces, [personal]);
    },
  );
}
