import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/profile/personal_profile_workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

void main() {
  const team = Workspace(id: 'team');
  const personal = Workspace(id: 'verified-personal', personal: true);
  late _Workspaces workspaces;
  setUp(() {
    workspaces = _Workspaces();
    when(() => workspaces.hasAuthenticatedActor).thenReturn(true);
    when(() => workspaces.state).thenReturn(
      const WorkspaceState(
        workspaces: [team, personal],
        currentWorkspace: team,
      ),
    );
  });
  tearDown(() => workspaces.close());

  Workspace? resolve({String? actor = 'owner', String? cacheActor = 'owner'}) =>
      verifiedPersonalProfileWorkspace(
        userId: actor,
        cacheUserId: cacheActor,
        workspaces: workspaces,
      );

  test('active team and hidden personal membership do not alter scope', () {
    expect(resolve(), personal);
    when(() => workspaces.state).thenReturn(
      const WorkspaceState(
        workspaces: [team, personal],
        hiddenWorkspaceIds: ['verified-personal'],
        currentWorkspace: team,
      ),
    );
    expect(resolve(), personal);
  });

  test('missing or ambiguous personal membership never guesses an ID', () {
    for (final members in [
      <Workspace>[],
      [team],
      [personal, const Workspace(id: 'other', personal: true)],
    ]) {
      when(() => workspaces.state).thenReturn(
        WorkspaceState(workspaces: members, currentWorkspace: personal),
      );
      expect(resolve(), isNull);
    }
  });

  test('account transition and unverified memberships fail closed', () {
    expect(resolve(actor: null), isNull);
    expect(resolve(cacheActor: null), isNull);
    expect(resolve(actor: 'next-account'), isNull);
    when(() => workspaces.hasAuthenticatedActor).thenReturn(false);
    expect(resolve(), isNull);
  });
}
