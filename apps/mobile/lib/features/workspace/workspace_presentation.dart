import 'package:flutter/widgets.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/l10n/l10n.dart';

// Keep in sync with packages/utils/src/constants.ts.
const rootWorkspaceId = '00000000-0000-0000-0000-000000000000';

bool isSystemWorkspaceId(String workspaceId) => workspaceId == rootWorkspaceId;

bool isSystemWorkspace(Workspace workspace) =>
    isSystemWorkspaceId(workspace.id);

String displayWorkspaceName(BuildContext context, Workspace workspace) {
  if (workspace.personal) {
    return context.l10n.workspacePersonalBadge;
  }

  final rawName = workspace.name?.trim();
  final raw = rawName != null && rawName.isNotEmpty
      ? rawName
      : isSystemWorkspace(workspace)
      ? context.l10n.workspaceSystemBadge
      : workspace.id;

  return humanizeWorkspaceLabel(raw);
}

String displayWorkspaceNameOrFallback(
  BuildContext context,
  Workspace? workspace,
) {
  if (workspace == null) {
    return context.l10n.workspacePickerTitle;
  }

  return displayWorkspaceName(context, workspace);
}

String humanizeWorkspaceLabel(String value) {
  if (value.isEmpty || value.toUpperCase() != value) {
    return value;
  }

  return value
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

class WorkspaceSections {
  const WorkspaceSections({
    required this.personal,
    required this.system,
    required this.team,
  });

  final List<Workspace> personal;
  final List<Workspace> system;
  final List<Workspace> team;
}

WorkspaceSections splitWorkspaceSections(Iterable<Workspace> workspaces) {
  final personal = <Workspace>[];
  final system = <Workspace>[];
  final team = <Workspace>[];

  for (final workspace in workspaces) {
    if (workspace.personal) {
      personal.add(workspace);
      continue;
    }

    if (isSystemWorkspace(workspace)) {
      system.add(workspace);
      continue;
    }

    team.add(workspace);
  }

  int compareWorkspaces(Workspace a, Workspace b) {
    final aName = (a.name?.trim().isNotEmpty ?? false) ? a.name!.trim() : a.id;
    final bName = (b.name?.trim().isNotEmpty ?? false) ? b.name!.trim() : b.id;
    return aName.toLowerCase().compareTo(bName.toLowerCase());
  }

  personal.sort(compareWorkspaces);
  system.sort(compareWorkspaces);
  team.sort(compareWorkspaces);

  return WorkspaceSections(
    personal: personal,
    system: system,
    team: team,
  );
}
