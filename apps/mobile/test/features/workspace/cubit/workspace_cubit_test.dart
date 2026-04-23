import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/workspace_repository.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

class _MockWorkspaceRepository extends Mock implements WorkspaceRepository {}

void main() {
  group('WorkspaceCubit', () {
    late _MockWorkspaceRepository repository;
    late WorkspaceCubit cubit;

    const personalWorkspace = Workspace(
      id: 'personal_ws',
      name: 'Personal',
      personal: true,
    );
    const teamWorkspace = Workspace(
      id: 'team_ws',
      name: 'Team',
    );

    setUp(() {
      repository = _MockWorkspaceRepository();
      cubit = WorkspaceCubit(workspaceRepository: repository);

      when(
        () => repository.loadDefaultWorkspaceId(),
      ).thenAnswer((_) async => null);
      when(
        () => repository.loadSelectedWorkspace(),
      ).thenAnswer((_) async => null);
      when(
        () => repository.getDefaultWorkspace(),
      ).thenAnswer((_) async => null);
      when(() => repository.getWorkspaceLimits()).thenThrow(Exception('skip'));
      when(
        () => repository.saveCachedWorkspaces(any()),
      ).thenAnswer((_) async {});
    });

    tearDown(() async {
      await cubit.close();
    });

    blocTest<WorkspaceCubit, WorkspaceState>(
      'emits cached workspaces and keeps them when remote refresh fails',
      build: () {
        when(
          () => repository.readCachedWorkspaces(),
        ).thenAnswer(
          (_) async => CacheReadResult<List<Workspace>>(
            state: CacheEntryState.stale,
            data: const [personalWorkspace, teamWorkspace],
            fetchedAt: DateTime(2026),
            isFromCache: true,
            hasValue: true,
          ),
        );
        when(() => repository.getWorkspaces()).thenThrow(Exception('timeout'));
        return cubit;
      },
      act: (cubit) => cubit.loadWorkspaces(),
      expect: () => const [
        WorkspaceState(
          status: WorkspaceStatus.loaded,
          workspaces: [personalWorkspace, teamWorkspace],
          currentWorkspace: personalWorkspace,
          defaultWorkspace: personalWorkspace,
        ),
      ],
      verify: (_) {
        verify(() => repository.readCachedWorkspaces()).called(1);
        verify(() => repository.getWorkspaces()).called(1);
        verifyNever(() => repository.getDefaultWorkspace());
      },
    );

    blocTest<WorkspaceCubit, WorkspaceState>(
      'forces remote fetch when requested',
      build: () {
        when(() => repository.getWorkspaces()).thenAnswer(
          (_) async => const [teamWorkspace],
        );
        return cubit;
      },
      act: (cubit) => cubit.loadWorkspaces(forceRefresh: true),
      expect: () => const [
        WorkspaceState(
          status: WorkspaceStatus.loading,
        ),
        WorkspaceState(
          status: WorkspaceStatus.loaded,
          workspaces: [teamWorkspace],
          currentWorkspace: teamWorkspace,
          defaultWorkspace: teamWorkspace,
        ),
      ],
      verify: (_) {
        verifyNever(() => repository.readCachedWorkspaces());
        verify(() => repository.getWorkspaces()).called(1);
        verify(() => repository.getDefaultWorkspace()).called(1);
      },
    );
  });
}
