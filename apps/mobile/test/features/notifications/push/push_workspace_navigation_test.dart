import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/notifications/push/push_workspace_navigation.dart';

void main() {
  test('account change during workspace load prevents switching', () async {
    const workspace = Workspace(id: 'other', name: 'Other');
    final workspaces = <Workspace>[];
    final selected = <Workspace>[];
    var isCurrent = true;
    final ready = await preparePushWorkspace(
      targetId: workspace.id,
      currentId: () => null,
      workspaces: () => workspaces,
      loadWorkspaces: () async {
        isCurrent = false;
        workspaces.add(workspace);
      },
      selectWorkspace: (workspace) async => selected.add(workspace),
      isCurrentActor: () => isCurrent,
    );
    expect(ready, isFalse);
    expect(selected, isEmpty);
  });

  test('unknown workspace does not switch', () async {
    final ready = await preparePushWorkspace(
      targetId: 'unknown',
      currentId: () => 'current',
      workspaces: () => const [Workspace(id: 'current', name: 'Current')],
      loadWorkspaces: () async => fail('Workspace list is already loaded'),
      selectWorkspace: (_) async => fail('Unknown workspace was selected'),
      isCurrentActor: () => true,
    );
    expect(ready, isFalse);
  });
}
