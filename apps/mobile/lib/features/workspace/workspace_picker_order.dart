import 'package:mobile/data/models/workspace.dart';

/// The picker shows its filter field only above this many workspaces.
const int workspacePickerFilterThreshold = 8;

/// Picker order: the selected workspace first, then the rest by recent use
/// ([recentIds], most recent first), then the remaining ones in their given
/// order.
List<Workspace> orderPickerWorkspaces(
  List<Workspace> workspaces, {
  String? selectedId,
  List<String> recentIds = const [],
}) {
  final rank = <String, int>{
    for (final (index, id) in recentIds.indexed) id: index,
  };
  final ordered = [...workspaces];
  final position = {
    for (final (index, workspace) in workspaces.indexed) workspace.id: index,
  };
  int key(Workspace workspace) {
    if (workspace.id == selectedId) return -1;
    return rank[workspace.id] ?? recentIds.length + position[workspace.id]!;
  }

  ordered.sort((a, b) => key(a).compareTo(key(b)));
  return ordered;
}
