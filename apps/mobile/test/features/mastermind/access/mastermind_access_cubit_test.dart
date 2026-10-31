import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_repository.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mocktail/mocktail.dart';

class _Access extends Mock implements MastermindAccessRepository {}

class _Source extends Mock implements MastermindSnapshotSource {}

MastermindAccessCubit _cubit({
  required _Access repository,
  bool configured = true,
  bool Function(String wsId)? isPersonalWorkspace,
}) {
  final source = _Source();
  when(() => source.isConfigured).thenReturn(configured);
  return MastermindAccessCubit(
    repository: repository,
    source: source,
    isPersonalWorkspace: isPersonalWorkspace,
  );
}

void main() {
  // Product rule: apps/docs/platform/features/mobile-mastermind.mdx#rollout
  // The entry follows Web's answer; this build never picks the rule.
  for (final root in [false, true]) {
    for (final allowed in [false, true]) {
      for (final configured in [false, true]) {
        blocTest<MastermindAccessCubit, MastermindAccessState>(
          'root=$root server=$allowed configured=$configured',
          build: () {
            final repository = _Access();
            when(repository.isEnabled).thenAnswer((_) async => allowed);
            return _cubit(repository: repository, configured: configured);
          },
          act: (cubit) => cubit.sync(root ? rootWorkspaceId : 'other'),
          expect: () => [
            if (root && configured)
              isA<MastermindAccessState>()
                  .having(
                    (s) => s.status,
                    'status',
                    MastermindAccessStatus.loading,
                  )
                  .having((s) => s.enabled, 'fail closed', false),
            isA<MastermindAccessState>()
                .having(
                  (s) => s.status,
                  'status',
                  MastermindAccessStatus.loaded,
                )
                .having(
                  (s) => s.enabled,
                  'enabled',
                  root && allowed && configured,
                ),
          ],
        );
      }
    }
  }

  group('personal workspace', () {
    const personalId = 'personal-ws';
    MastermindAccessCubit build({required bool allowed}) {
      final repository = _Access();
      when(repository.isEnabled).thenAnswer((_) async => allowed);
      return _cubit(
        repository: repository,
        isPersonalWorkspace: (wsId) => wsId == personalId,
      );
    }

    test('shows Mastermind when the server allows it', () async {
      final cubit = build(allowed: true);
      await cubit.sync(personalId);
      expect(cubit.state.visible, isTrue);
      expect(cubit.state.wsId, personalId);
      await cubit.close();
    });

    test('hides Mastermind when the server denies it', () async {
      final cubit = build(allowed: false);
      await cubit.sync(personalId);
      expect(cubit.state.visible, isFalse);
      await cubit.close();
    });

    test('other workspaces never offer Mastermind', () async {
      final repository = _Access();
      final cubit = _cubit(
        repository: repository,
        isPersonalWorkspace: (wsId) => wsId == personalId,
      );
      await cubit.sync('team-ws');
      expect(cubit.state.status, MastermindAccessStatus.loaded);
      expect(cubit.state.visible, isFalse);
      verifyNever(repository.isEnabled);
      await cubit.close();
    });
  });

  test('creator and admin never imply manage_mastermind', () {
    const creator = WorkspacePermissions(permissions: {}, isCreator: true);
    const admin = WorkspacePermissions(
      permissions: {'admin'},
      isCreator: false,
    );
    expect(creator.containsPermission(manageMastermindPermission), isFalse);
    expect(admin.containsPermission(manageMastermindPermission), isFalse);
    expect(admin.containsPermission('view_infrastructure'), isTrue);
  });

  test('workspace ABA cannot resurrect an older answer', () async {
    final repository = _Access();
    final pending = Completer<bool>();
    var calls = 0;
    when(repository.isEnabled).thenAnswer((_) {
      calls++;
      return calls == 1 ? pending.future : Future.value(false);
    });
    final cubit = _cubit(repository: repository);
    final old = cubit.sync(rootWorkspaceId);
    await cubit.sync(null);
    await cubit.sync(rootWorkspaceId);
    pending.complete(true);
    await old;
    expect(cubit.state.enabled, isFalse);
    await cubit.close();
  });

  blocTest<MastermindAccessCubit, MastermindAccessState>(
    'access errors fail closed',
    build: () {
      final repository = _Access();
      when(repository.isEnabled).thenThrow(StateError('synthetic'));
      return _cubit(repository: repository);
    },
    act: (c) => c.sync(rootWorkspaceId),
    expect: () => [
      isA<MastermindAccessState>().having(
        (s) => s.enabled,
        'loading denied',
        false,
      ),
      isA<MastermindAccessState>()
          .having((s) => s.status, 'status', MastermindAccessStatus.error)
          .having((s) => s.enabled, 'error denied', false),
    ],
  );
}
