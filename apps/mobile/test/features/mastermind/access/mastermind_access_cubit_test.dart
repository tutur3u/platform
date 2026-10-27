import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/mastermind/access/mastermind_access_cubit.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mocktail/mocktail.dart';

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

class _Source extends Mock implements MastermindSnapshotSource {}

void main() {
  for (final root in [false, true]) {
    for (final permission in [false, true]) {
      for (final configured in [false, true]) {
        blocTest<MastermindAccessCubit, MastermindAccessState>(
          'root=$root permission=$permission configured=$configured',
          build: () {
            final repository = _Permissions();
            final source = _Source();
            when(() => source.isConfigured).thenReturn(configured);
            when(
              () => repository.getPermissions(wsId: rootWorkspaceId),
            ).thenAnswer(
              (_) async => WorkspacePermissions(
                permissions: {if (permission) 'view_infrastructure'},
                isCreator: false,
              ),
            );
            return MastermindAccessCubit(
              repository: repository,
              source: source,
            );
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
                  root && permission && configured,
                ),
          ],
        );
      }
    }
  }
  test('workspace ABA cannot resurrect an older permission grant', () async {
    final repository = _Permissions();
    final source = _Source();
    when(() => source.isConfigured).thenReturn(true);
    final pending = Completer<WorkspacePermissions>();
    var calls = 0;
    when(() => repository.getPermissions(wsId: rootWorkspaceId)).thenAnswer((
      _,
    ) {
      calls++;
      return calls == 1
          ? pending.future
          : Future.value(
              const WorkspacePermissions(permissions: {}, isCreator: false),
            );
    });
    final cubit = MastermindAccessCubit(repository: repository, source: source);
    final old = cubit.sync(rootWorkspaceId);
    await cubit.sync(null);
    await cubit.sync(rootWorkspaceId);
    pending.complete(
      const WorkspacePermissions(
        permissions: {'view_infrastructure'},
        isCreator: false,
      ),
    );
    await old;
    expect(cubit.state.enabled, isFalse);
    await cubit.close();
  });
  blocTest<MastermindAccessCubit, MastermindAccessState>(
    'permission errors fail closed',
    build: () {
      final repository = _Permissions();
      final source = _Source();
      when(() => source.isConfigured).thenReturn(true);
      when(
        () => repository.getPermissions(wsId: rootWorkspaceId),
      ).thenThrow(StateError('synthetic'));
      return MastermindAccessCubit(repository: repository, source: source);
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
