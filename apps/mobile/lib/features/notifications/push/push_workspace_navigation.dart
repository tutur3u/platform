import 'package:mobile/data/models/workspace.dart';

Future<bool> preparePushWorkspace({
  required String? targetId,
  required String? Function() currentId,
  required List<Workspace> Function() workspaces,
  required Future<void> Function() loadWorkspaces,
  required Future<void> Function(Workspace) selectWorkspace,
  required bool Function() isCurrentActor,
}) async {
  if (targetId == null || targetId.isEmpty || targetId == currentId()) {
    return true;
  }
  if (workspaces().isEmpty) await loadWorkspaces();
  if (!isCurrentActor()) return false;
  final target = workspaces()
      .where((workspace) => workspace.id == targetId)
      .firstOrNull;
  if (target == null) return false;
  await selectWorkspace(target);
  return true;
}
