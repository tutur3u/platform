import 'package:mobile/data/models/workspace.dart';

/// With fewer workspaces than this, every workspace gets a chip.
const homeChipShowAllBelow = 5;

/// The workspaces shown as Home chips: all of them when there are fewer than
/// [homeChipShowAllBelow], otherwise the pinned ones in pin order, led by
/// the current workspace when it is not pinned so the selection stays
/// visible. Pins for workspaces the user can no longer open are skipped.
List<Workspace> homeChipWorkspaces({
  required List<Workspace> workspaces,
  required String? currentId,
  required List<String> pinnedIds,
}) {
  if (workspaces.length < homeChipShowAllBelow) return workspaces;
  final byId = {for (final workspace in workspaces) workspace.id: workspace};
  final chips = [
    for (final id in pinnedIds)
      if (byId[id] case final workspace?) workspace,
  ];
  final current = currentId == null ? null : byId[currentId];
  if (current != null && !chips.contains(current)) chips.insert(0, current);
  return chips;
}
